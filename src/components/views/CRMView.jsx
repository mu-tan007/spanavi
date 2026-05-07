import { useState, useEffect } from 'react';
import { C } from '../../constants/colors';
import { updateClient, insertClient, deleteClient } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import PageHeader from '../common/PageHeader';
import ClientDetailPage from './contacts/ClientDetailPage';
import VoiceRecorderInline from './contacts/VoiceRecorderInline';
import { dbFieldsToFe } from '../../utils/clientFieldsMap';
import { insertClientContact as insertClientContactFn } from '../../lib/supabaseWrite';
import {
  NAVY, GRAY_200, GRAY_50, GOLD,
  STATUS_LIST, statusStyle, contactLabel, lastTouchDisplay,
  CRM_COLS_BASE, CRM_COLS_EDIT, CRM_COL_LABELS,
} from './crm/utils';
import RewardDetailModal from './crm/RewardDetailModal';

export default function CRMView({ isAdmin, clientData, setClientData, rewardMaster = [], contactsByClient = {}, setContactsByClient, callListData = [] }) {
  const [statusFilter, setStatusFilter] = useState("支援中");
  const [search, setSearch] = useState("");
  const [showRewardDetail, setShowRewardDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addToast, setAddToast] = useState(null);
  // 詳細ページ切替
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [detailClient, setDetailClient] = useState(null);
  // 新規顧客追加で AI が抽出した「追加候補の担当者」をキューする
  const [pendingNewContacts, setPendingNewContacts] = useState([]);
  // 既存顧客の編集で AI が抽出した「追加候補の担当者」をキューする
  const [pendingEditContacts, setPendingEditContacts] = useState([]);

  const goToDetail = (c) => { setDetailClient(c); setView('detail'); };
  const goToList = () => { setView('list'); setDetailClient(null); };
  // 最終接点 (clientId -> ISO timestamp)
  const [lastTouchByClient, setLastTouchByClient] = useState({});

  // 最終接点を非同期ロード: contact_memo_events と appointments の MAX(created_at / appointment_date)
  useEffect(() => {
    let cancelled = false;
    const orgId = getOrgId();
    if (!orgId) return;
    (async () => {
      // 1) contact_memo_events を contact_id 単位で取得して client_id にマップ
      const contactToClient = {};
      Object.entries(contactsByClient).forEach(([cid, list]) => {
        (list || []).forEach(ct => { if (ct?.id) contactToClient[ct.id] = cid; });
      });
      const lastByClient = {};
      try {
        const { data: memos, error: e1 } = await supabase
          .from('contact_memo_events')
          .select('contact_id, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(2000);
        if (!e1 && Array.isArray(memos)) {
          memos.forEach(m => {
            const cid = contactToClient[m.contact_id];
            if (!cid) return;
            if (!lastByClient[cid] || m.created_at > lastByClient[cid]) lastByClient[cid] = m.created_at;
          });
        }
      } catch (e) { console.warn('[CRM] memo lookup failed', e); }
      try {
        const { data: appos, error: e2 } = await supabase
          .from('appointments')
          .select('client_id, appointment_date, created_at')
          .eq('org_id', orgId)
          .order('appointment_date', { ascending: false })
          .limit(2000);
        if (!e2 && Array.isArray(appos)) {
          appos.forEach(a => {
            const ts = a.appointment_date || a.created_at;
            const cid = a.client_id;
            if (!cid || !ts) return;
            if (!lastByClient[cid] || ts > lastByClient[cid]) lastByClient[cid] = ts;
          });
        }
      } catch (e) { console.warn('[CRM] appointment lookup failed', e); }
      if (!cancelled) setLastTouchByClient(lastByClient);
    })();
    return () => { cancelled = true; };
  }, [contactsByClient]);

  const statusList = STATUS_LIST;

  const filtered = clientData.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search && !c.company.includes(search) && !c.industry.includes(search)) return false;
    return true;
  });

  const statusCounts = {};
  clientData.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  const rewardMap = {};
  rewardMaster.forEach(r => {
    if (!rewardMap[r.id]) rewardMap[r.id] = { name: r.name, timing: r.timing, basis: r.basis, tax: r.tax, tiers: [] };
    rewardMap[r.id].tiers.push(r);
  });

  const getRewardSummary = (typeId) => {
    const rm = rewardMap[typeId];
    if (!rm) return "-";
    if (rm.tiers.length === 1) return rm.tiers[0].memo;
    return rm.name;
  };

  // 連絡手段はテキストラベルに統一（絵文字撤去）。contactLabel(c.contact) を使用

  const crmDefaultCols = setClientData ? CRM_COLS_EDIT : CRM_COLS_BASE;
  const { columns: crmCols, gridTemplateColumns: crmGrid, contentMinWidth: crmMinW, onResizeStart: crmResize, onHeaderContextMenu: crmCtxMenu, contextMenu: crmCtx, setAlign: crmSetAlign, resetAll: crmReset, closeMenu: crmClose } = useColumnConfig(setClientData ? 'crmViewEdit' : 'crmView', crmDefaultCols);

  const handleSaveEdit = async () => {
    if (!editForm || !setClientData) return;
    const idx = editForm._idx;
    const updated = { ...editForm };
    delete updated._idx;
    if (updated._supaId) {
      const error = await updateClient(updated._supaId, updated);
      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
    }
    setClientData(prev => prev.map((c, i) => i === idx ? updated : c));

    // AI が抽出した担当者の追加候補がキューにあればまとめて insert
    if (pendingEditContacts.length > 0 && setContactsByClient && updated._supaId) {
      for (const ct of pendingEditContacts) {
        if (!ct?.name) continue;
        const payload = {
          name: ct.name,
          email: ct.email || '',
          slackMemberId: ct.slack_member_id || '',
        };
        if (ct.role || ct.phone) {
          payload.schedulingNotes = [
            ct.role ? `役職: ${ct.role}` : null,
            ct.phone ? `電話: ${ct.phone}` : null,
          ].filter(Boolean).join(' / ');
        }
        try {
          const { data, error: e2 } = await insertClientContactFn(updated._supaId, payload);
          if (e2) { console.error('[CRM] insertClientContact (edit) failed', e2); continue; }
          if (data) {
            setContactsByClient(prev => {
              const list = prev[updated._supaId] || [];
              return {
                ...prev,
                [updated._supaId]: [...list, {
                  id: data.id, name: data.name, email: data.email,
                  slackMemberId: data.slack_member_id || '',
                  googleCalendarId: data.google_calendar_id || '',
                  schedulingUrl: data.scheduling_url || '',
                  schedulingUrl2: data.scheduling_url_2 || '',
                  schedulingLabel: data.scheduling_label || '',
                  schedulingLabel2: data.scheduling_label_2 || '',
                  schedulingNotes: data.scheduling_notes || '',
                  isPrimary: false,
                }],
              };
            });
          }
        } catch (e) {
          console.error('[CRM] insertClientContact (edit) threw', e);
        }
      }
      setPendingEditContacts([]);
    }

    setEditForm(null);
    // 詳細ページ表示中なら detailClient も更新（編集後の値を反映）
    if (view === 'detail') setDetailClient(updated);
  };

  const handleSaveAdd = async () => {
    if (!addForm || !setClientData) return;
    if (!addForm.company?.trim()) { alert('企業名を入力してください'); return; }
    setAddSaving(true);
    const { result, error } = await insertClient(addForm);
    if (error) { setAddSaving(false); alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
    const newClient = {
      _supaId: result.id,
      no: result.sort_order || 0,
      status: result.status || addForm.status || '準備中',
      contract: result.contract_status || addForm.contract || '未',
      company: result.name || addForm.company,
      industry: result.industry || addForm.industry || '',
      target: result.supply_target || addForm.target || 0,
      rewardType: result.reward_type || addForm.rewardType || '',
      paySite: result.payment_site || addForm.paySite || '',
      payNote: result.payment_note || addForm.payNote || '',
      listSrc: result.list_source || addForm.listSrc || '',
      calendar: result.calendar_type || addForm.calendar || '',
      contact: result.contact_method || addForm.contact || '',
      noteFirst: (result.notes || addForm.noteFirst || '').replace(/\\n/g, '\n'),
      noteKickoff: (result.note_kickoff || '').replace(/\\n/g, '\n'),
      noteRegular: (result.note_regular || '').replace(/\\n/g, '\n'),
      googleCalendarId: result.google_calendar_id || addForm.googleCalendarId || '',
      clientEmail: result.client_email || addForm.clientEmail || '',
      schedulingUrl: result.scheduling_url || addForm.schedulingUrl || '',
    };
    setClientData(prev => [newClient, ...prev]);

    // AI が抽出した担当者をまとめて追加
    if (pendingNewContacts.length > 0 && setContactsByClient && newClient._supaId) {
      for (const ct of pendingNewContacts) {
        if (!ct?.name) continue;
        const payload = {
          name: ct.name,
          email: ct.email || '',
          slackMemberId: ct.slack_member_id || '',
        };
        if (ct.role || ct.phone) {
          payload.schedulingNotes = [
            ct.role ? `役職: ${ct.role}` : null,
            ct.phone ? `電話: ${ct.phone}` : null,
          ].filter(Boolean).join(' / ');
        }
        try {
          const { data, error: e2 } = await insertClientContactFn(newClient._supaId, payload);
          if (e2) { console.error('[CRM] insertClientContact failed', e2); continue; }
          if (data) {
            setContactsByClient(prev => {
              const list = prev[newClient._supaId] || [];
              return {
                ...prev,
                [newClient._supaId]: [...list, {
                  id: data.id, name: data.name, email: data.email,
                  slackMemberId: data.slack_member_id || '',
                  googleCalendarId: data.google_calendar_id || '',
                  schedulingUrl: data.scheduling_url || '',
                  schedulingUrl2: data.scheduling_url_2 || '',
                  schedulingLabel: data.scheduling_label || '',
                  schedulingLabel2: data.scheduling_label_2 || '',
                  schedulingNotes: data.scheduling_notes || '',
                  isPrimary: false,
                }],
              };
            });
          }
        } catch (e) {
          console.error('[CRM] insertClientContact threw', e);
        }
      }
    }

    setAddSaving(false);
    setPendingNewContacts([]);
    setAddForm(null);
    setAddToast('顧客を追加しました');
    setTimeout(() => setAddToast(null), 3000);
  };

  // 顧客編集: 音声 → AI 整理結果を editForm に反映 + 担当者候補をキュー
  const handleEditVoiceProcessed = (result) => {
    const ext = result?.ai_extracted || {};
    const cf = ext.client_fields || {};
    const fePatch = dbFieldsToFe(cf);
    setEditForm(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      Object.entries(fePatch).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') return;
        next[k] = v;
      });
      return next;
    });
    const cs = ext.contacts_to_add || [];
    if (cs.length > 0) setPendingEditContacts(prev => [...prev, ...cs]);
  };

  // 新規顧客追加: 音声 → AI 整理結果を addForm に反映
  const handleNewClientVoiceProcessed = (result) => {
    const ext = result?.ai_extracted || {};
    const cf = ext.client_fields || {};
    const fePatch = dbFieldsToFe(cf);
    setAddForm(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      Object.entries(fePatch).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') return;
        // 既に手入力されている場合は上書きしない
        if (next[k] !== '' && next[k] !== 0 && next[k] !== undefined && next[k] !== null) {
          // ただし数値フィールドの 0 デフォルトは空とみなして上書き
          if (k === 'target' && next[k] === 0) {
            next[k] = v;
          }
          return;
        }
        next[k] = v;
      });
      return next;
    });
    // 担当者は addForm 保存時にまとめて insert する
    const cs = ext.contacts_to_add || [];
    if (cs.length > 0) setPendingNewContacts(prev => [...prev, ...cs]);
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {view === 'list' && (
        <PageHeader
          eyebrow="Sourcing · 顧客"
          title="CRM"
          description="顧客・連絡先・契約条件の管理"
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 詳細ページモード */}
      {view === 'detail' && detailClient && (
        <ClientDetailPage
          client={detailClient}
          contactsByClient={contactsByClient}
          setContactsByClient={setContactsByClient}
          rewardMaster={rewardMaster}
          callListData={callListData}
          isAdmin={isAdmin}
          setClientData={setClientData}
          onBack={goToList}
          onEdit={(cl) => {
            const idx = clientData.findIndex(x => x._supaId === cl._supaId);
            setEditForm({ ...cl, _idx: idx });
          }}
          onShowReward={(rid) => setShowRewardDetail(rid)}
        />
      )}

      {/* Header (list mode only) */}
      {view === 'list' && (<>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: "14px 18px", background: '#fff', borderRadius: 4,
        border: "1px solid " + GRAY_200,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>顧客管理（CRM）</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{filtered.length}社</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="企業名・業界..."
            style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid " + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 180 }} />
          {setClientData && (
            <button onClick={() => setAddForm({ status: '準備中', contract: '未', company: '', industry: '', target: 0, rewardType: '', paySite: '', payNote: '', listSrc: '', calendar: '', contact: '', noteFirst: '', googleCalendarId: '', clientEmail: '', schedulingUrl: '', slackWebhookUrl: '', slackWebhookUrlInternal: '', chatworkRoomId: '' })}
              style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: NAVY, color: '#fff', fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap" }}>
              ＋ 新規顧客追加
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setStatusFilter("all")} style={{
          padding: "6px 14px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
          border: "1px solid " + (statusFilter === "all" ? NAVY : GRAY_200),
          background: statusFilter === "all" ? NAVY : '#fff', color: statusFilter === "all" ? '#fff' : C.textMid,
        }}>全て <span style={{ fontSize: 10, opacity: 0.7 }}>{clientData.length}</span></button>
        {statusList.map(st => {
          const sc = statusStyle(st);
          const active = statusFilter === st;
          return (
            <button key={st} onClick={() => setStatusFilter(st)} style={{
              padding: "6px 14px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              border: "1px solid " + (active ? sc.color : GRAY_200),
              background: active ? sc.bg : '#fff', color: active ? sc.color : C.textMid,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot }}></span>
              {st} <span style={{ fontSize: 10, opacity: 0.7 }}>{statusCounts[st] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid ' + GRAY_200, borderRadius: 4, overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ minWidth: crmMinW }}>
        <div style={{
          display: "grid", gridTemplateColumns: crmGrid,
          padding: "8px 16px", background: NAVY,
          fontSize: 11, fontWeight: 600, color: '#fff',
          verticalAlign: 'middle',
        }}>
          {CRM_COL_LABELS.map((label, idx) => (
            <span key={label} style={{ position: 'relative', verticalAlign: 'middle', textAlign: crmCols[idx]?.align || 'left', paddingRight: 6 }} onContextMenu={e => crmCtxMenu(e, idx)}>
              {label}
              <ColumnResizeHandle colIndex={idx} onResizeStart={crmResize} />
            </span>
          ))}
          {setClientData && <span></span>}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>データがありません</div>
        ) : filtered.map((c, i) => {
          const sc = statusStyle(c.status);
          const globalIdx = clientData.indexOf(c);
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: crmGrid,
              padding: "8px 16px", fontSize: 11, alignItems: "center",
              borderBottom: '1px solid ' + GRAY_200,
              background: i % 2 === 0 ? '#fff' : GRAY_50,
              cursor: "pointer", transition: "background 0.15s",
            }} onClick={() => goToDetail(c)}
              onMouseEnter={e => e.currentTarget.style.background = "#EAF4FF"}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : GRAY_50}>
              <span style={{
                borderLeft: '3px solid ' + sc.color, paddingLeft: 8, color: sc.color, fontSize: 12,
                display: "inline-block", width: "fit-content", textAlign: crmCols[0]?.align,
              }}>{c.status}</span>
              <span style={{ fontWeight: 600, color: NAVY, textAlign: crmCols[1]?.align }}>{c.company}</span>
              <span style={{ color: C.textMid, fontSize: 10, textAlign: crmCols[2]?.align }}>{c.industry}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 700, color: c.target > 0 ? NAVY : C.textLight, textAlign: crmCols[3]?.align, fontVariantNumeric: 'tabular-nums' }}>{c.target > 0 ? c.target + "件" : "-"}</span>
              <span onClick={e => { e.stopPropagation(); setShowRewardDetail(c.rewardType); }} style={{
                fontSize: 10, fontWeight: 600, color: NAVY, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textAlign: crmCols[4]?.align,
              }}>{c.rewardType ? c.rewardType + " " + getRewardSummary(c.rewardType).slice(0, 10) : "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid, textAlign: crmCols[5]?.align }}>{c.listSrc || "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid, textAlign: crmCols[6]?.align }}>{c.calendar || "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid, textAlign: crmCols[7]?.align }}>{contactLabel(c.contact)}</span>
              {(() => {
                const lt = lastTouchDisplay(lastTouchByClient[c._supaId]);
                return (
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontVariantNumeric: 'tabular-nums',
                    color: lt.stale ? GOLD : (lt.label === '-' ? C.textLight : C.textMid),
                    fontWeight: lt.stale ? 700 : 400,
                    textAlign: crmCols[8]?.align,
                  }}>{lt.label}</span>
                );
              })()}
              {(() => {
                const list = contactsByClient[c._supaId] || [];
                const primary = list.find(ct => ct.isPrimary) || list[0];
                if (!primary) {
                  return <span style={{ fontSize: 10, color: C.textLight, textAlign: crmCols[9]?.align }}>-</span>;
                }
                return (
                  <span style={{
                    fontSize: 10, color: NAVY, textAlign: crmCols[9]?.align,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {primary.isPrimary && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: 1,
                        color: NAVY, border: '1px solid ' + NAVY,
                        borderRadius: 2, padding: '1px 3px', flexShrink: 0,
                      }}>主</span>
                    )}
                    <span style={{ fontWeight: 500 }}>{primary.name}</span>
                  </span>
                );
              })()}
              {setClientData && <span style={{ textAlign: "center" }}><button onClick={e => { e.stopPropagation(); setEditForm({ ...c, _idx: globalIdx }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2 }}>&#9998;</button></span>}
            </div>
          );
        })}
        </div>
      </div>
      </>)}

      {/* Toast */}
      {addToast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: NAVY, color: '#fff', padding: "10px 20px", borderRadius: 4, fontSize: 12, fontWeight: 600, zIndex: 30000, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", fontFamily: "'Noto Sans JP'" }}>
          {addToast}
        </div>
      )}

      {/* Add Modal */}
      {addForm && setClientData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: GRAY_50 };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddForm(p => ({ ...p, [k]: v }));
        const rewardIds = [...new Set(rewardMaster.map(r => r.id))].sort();
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20001, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4, width: 580, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "12px 24px", background: NAVY, borderRadius: "4px 4px 0 0", color: '#fff', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>新規顧客を追加</span>
                <span style={{ display: 'inline-flex' }}>
                  <VoiceRecorderInline
                    targetKind="client_create"
                    onProcessed={handleNewClientVoiceProcessed}
                    onError={(msg) => alert(msg)}
                    size={28}
                  />
                </span>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {pendingNewContacts.length > 0 && (
                  <div style={{
                    marginBottom: 12, padding: '6px 10px',
                    fontSize: 10, color: NAVY,
                    background: '#FFFBF0', border: '1px solid ' + C.gold + '40',
                    borderRadius: 3,
                  }}>
                    AI から担当者 {pendingNewContacts.length} 名の追加候補があります。保存時にまとめて登録されます。
                    <button
                      onClick={() => setPendingNewContacts([])}
                      style={{
                        background: 'none', border: 'none', color: C.textLight,
                        fontSize: 10, marginLeft: 6, cursor: 'pointer',
                        fontFamily: "'Noto Sans JP', sans-serif", textDecoration: 'underline',
                      }}
                    >クリア</button>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={addForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      {statusList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>契約</label>
                    <select value={addForm.contract} onChange={e => u("contract", e.target.value)} style={inputStyle}>
                      <option value="済">済</option><option value="未">未</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ ...labelStyle, color: C.red }}>企業名 <span style={{ fontWeight: 400 }}>*</span></label>
                    <input value={addForm.company} onChange={e => u("company", e.target.value)} placeholder="株式会社○○" style={inputStyle} />
                  </div>
                  <div><label style={labelStyle}>業界</label><input value={addForm.industry} onChange={e => u("industry", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>供給目標（件/月）</label><input type="number" value={addForm.target} onChange={e => u("target", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>報酬体系</label>
                    <select value={addForm.rewardType} onChange={e => u("rewardType", e.target.value)} style={inputStyle}>
                      <option value="">-</option>
                      {rewardIds.map(id => <option key={id} value={id}>{id} - {rewardMap[id] ? rewardMap[id].name : ""}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>支払サイト</label><input value={addForm.paySite} onChange={e => u("paySite", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>支払特記事項</label><input value={addForm.payNote} onChange={e => u("payNote", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>リスト負担</label>
                    <select value={addForm.listSrc} onChange={e => u("listSrc", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="当社持ち">当社持ち</option><option value="先方持ち">先方持ち</option><option value="両方">両方</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>カレンダー</label>
                    <select value={addForm.calendar} onChange={e => u("calendar", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="Google">Google</option><option value="Spir">Spir</option><option value="Outlook">Outlook</option><option value="なし">なし</option><option value="調整アポ">調整アポ</option><option value="Google(入力)">Google(入力)</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>連絡手段</label>
                    <select value={addForm.contact} onChange={e => u("contact", e.target.value)} style={inputStyle}>
                      <option value="">-</option><option value="LINE">LINE</option><option value="Slack">Slack</option><option value="Chatwork">Chatwork</option><option value="メール">メール</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>メールアドレス</label><input value={addForm.clientEmail} onChange={e => u("clientEmail", e.target.value)} placeholder="client@example.com" style={inputStyle} /></div>
                  {addForm.contact === 'Slack' && (
                    <div><label style={labelStyle}>Slack Webhook URL（アポ報告用）</label><input value={addForm.slackWebhookUrl || ''} onChange={e => u("slackWebhookUrl", e.target.value)} placeholder="https://hooks.slack.com/services/..." style={inputStyle} /></div>
                  )}
                  {addForm.contact === 'Chatwork' && (
                    <div><label style={labelStyle}>Chatwork ルームID</label><input value={addForm.chatworkRoomId || ''} onChange={e => u("chatworkRoomId", e.target.value)} placeholder="123456789" style={inputStyle} /></div>
                  )}
                  <div><label style={labelStyle}>Slack Webhook URL（社内報告用）</label><input value={addForm.slackWebhookUrlInternal || ''} onChange={e => u("slackWebhookUrlInternal", e.target.value)} placeholder="https://hooks.slack.com/services/..." style={inputStyle} /></div>
                  {(addForm.calendar === 'Google' || addForm.calendar === 'Google(入力)') && (
                    <div><label style={labelStyle}>Google Calendar ID</label><input value={addForm.googleCalendarId} onChange={e => u("googleCalendarId", e.target.value)} placeholder="クライアントのGoogleメールアドレス" style={inputStyle} /></div>
                  )}
                  {(addForm.calendar === 'Spir' || addForm.calendar === '調整アポ') && (
                    <div><label style={labelStyle}>日程調整URL</label><input value={addForm.schedulingUrl} onChange={e => u("schedulingUrl", e.target.value)} placeholder="https://app.spir.com/..." style={inputStyle} /></div>
                  )}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>初回面談メモ</label>
                    <textarea value={addForm.noteFirst} onChange={e => u("noteFirst", e.target.value)} rows={4}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + GRAY_200, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => { setAddForm(null); setPendingNewContacts([]); }} style={{ padding: "8px 16px", borderRadius: 4, border: '1px solid ' + NAVY, background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: NAVY, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                <button onClick={handleSaveAdd} disabled={addSaving} style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: addSaving ? C.textLight : NAVY, cursor: addSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'" }}>
                  {addSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Modal */}
      {editForm && setClientData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: GRAY_50 };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        const rewardIds = [...new Set(rewardMaster.map(r => r.id))].sort();
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20001, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4, width: 580, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "12px 24px", background: NAVY, borderRadius: "4px 4px 0 0", color: '#fff', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>顧客情報を編集 — {editForm.company}</span>
                <span style={{ display: 'inline-flex' }}>
                  <VoiceRecorderInline
                    targetKind="client_update"
                    clientId={editForm._supaId || null}
                    onProcessed={(result) => handleEditVoiceProcessed(result)}
                    onError={(msg) => alert(msg)}
                    size={28}
                  />
                </span>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {pendingEditContacts.length > 0 && (
                  <div style={{
                    marginBottom: 12, padding: '6px 10px',
                    fontSize: 10, color: NAVY,
                    background: '#FFFBF0', border: '1px solid ' + C.gold + '40',
                    borderRadius: 3,
                  }}>
                    AI から担当者 {pendingEditContacts.length} 名の追加候補があります。保存時にまとめて登録されます。
                    <button
                      onClick={() => setPendingEditContacts([])}
                      style={{
                        background: 'none', border: 'none', color: C.textLight,
                        fontSize: 10, marginLeft: 6, cursor: 'pointer',
                        fontFamily: "'Noto Sans JP', sans-serif", textDecoration: 'underline',
                      }}
                    >クリア</button>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={editForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      {statusList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>契約</label>
                    <select value={editForm.contract} onChange={e => u("contract", e.target.value)} style={inputStyle}>
                      <option value="済">済</option><option value="未">未</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>企業名</label><input value={editForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>業界</label><input value={editForm.industry} onChange={e => u("industry", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>供給目標（件/月）</label><input type="number" value={editForm.target} onChange={e => u("target", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>報酬体系</label>
                    <select value={editForm.rewardType} onChange={e => u("rewardType", e.target.value)} style={inputStyle}>
                      <option value="">-</option>
                      {rewardIds.map(id => <option key={id} value={id}>{id} - {rewardMap[id] ? rewardMap[id].name : ""}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>支払サイト</label><input value={editForm.paySite} onChange={e => u("paySite", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>支払特記事項</label><input value={editForm.payNote} onChange={e => u("payNote", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>リスト負担</label>
                    <select value={editForm.listSrc} onChange={e => u("listSrc", e.target.value)} style={inputStyle}>
                      <option value="当社持ち">当社持ち</option><option value="先方持ち">先方持ち</option><option value="両方">両方</option><option value="">-</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>カレンダー</label>
                    <select value={editForm.calendar} onChange={e => u("calendar", e.target.value)} style={inputStyle}>
                      <option value="Google">Google</option><option value="Spir">Spir</option><option value="Outlook">Outlook</option><option value="なし">なし</option><option value="調整アポ">調整アポ</option><option value="Google(入力)">Google(入力)</option><option value="">-</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>連絡手段</label>
                    <select value={editForm.contact} onChange={e => u("contact", e.target.value)} style={inputStyle}>
                      <option value="LINE">LINE</option><option value="Slack">Slack</option><option value="Chatwork">Chatwork</option><option value="メール">メール</option><option value="">-</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>メールアドレス</label><input value={editForm.clientEmail || ''} onChange={e => u("clientEmail", e.target.value)} placeholder="client@example.com" style={inputStyle} /></div>
                  {editForm.contact === 'Slack' && (
                    <div><label style={labelStyle}>Slack Webhook URL（アポ報告用）</label><input value={editForm.slackWebhookUrl || ''} onChange={e => u("slackWebhookUrl", e.target.value)} placeholder="https://hooks.slack.com/services/..." style={inputStyle} /></div>
                  )}
                  {editForm.contact === 'Chatwork' && (
                    <div><label style={labelStyle}>Chatwork ルームID</label><input value={editForm.chatworkRoomId || ''} onChange={e => u("chatworkRoomId", e.target.value)} placeholder="123456789" style={inputStyle} /></div>
                  )}
                  <div><label style={labelStyle}>Slack Webhook URL（社内報告用）</label><input value={editForm.slackWebhookUrlInternal || ''} onChange={e => u("slackWebhookUrlInternal", e.target.value)} placeholder="https://hooks.slack.com/services/..." style={inputStyle} /></div>
                  {(editForm.calendar === 'Google' || editForm.calendar === 'Google(入力)') && (
                    <div><label style={labelStyle}>Google Calendar ID</label><input value={editForm.googleCalendarId || ''} onChange={e => u("googleCalendarId", e.target.value)} placeholder="クライアントのGoogleメールアドレス" style={inputStyle} /></div>
                  )}
                  {(editForm.calendar === 'Spir' || editForm.calendar === '調整アポ') && (
                    <div><label style={labelStyle}>日程調整URL</label><input value={editForm.schedulingUrl || ''} onChange={e => u("schedulingUrl", e.target.value)} placeholder="https://app.spir.com/..." style={inputStyle} /></div>
                  )}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 12, marginTop: 4 }}>備考</div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={labelStyle}>初回面談時</label>
                      <textarea value={(editForm.noteFirst || "").replace(/\\n/g, "\n")} onChange={e => u("noteFirst", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={labelStyle}>キックオフミーティング時</label>
                      <textarea value={(editForm.noteKickoff || "").replace(/\\n/g, "\n")} onChange={e => u("noteKickoff", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                    <div>
                      <label style={labelStyle}>定期ミーティング時</label>
                      <textarea value={(editForm.noteRegular || "").replace(/\\n/g, "\n")} onChange={e => u("noteRegular", e.target.value)} rows={4}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + GRAY_200, display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (editForm._supaId) {
                    const error = await deleteClient(editForm._supaId);
                    if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                  }
                  setClientData(prev => prev.filter((_, i) => i !== editForm._idx));
                  setEditForm(null);
                }} style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid #DC2626", background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#DC2626", fontFamily: "'Noto Sans JP'" }}>削除</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setEditForm(null); setPendingEditContacts([]); }} style={{ padding: "8px 16px", borderRadius: 4, border: '1px solid ' + NAVY, background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: NAVY, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={handleSaveEdit} style={{
                    padding: "8px 16px", borderRadius: 4, border: "none",
                    background: NAVY,
                    cursor: "pointer", fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <RewardDetailModal
        rewardId={showRewardDetail}
        rewardMap={rewardMap}
        onClose={() => setShowRewardDetail(null)}
      />

      {crmCtx.visible && (
        <AlignmentContextMenu
          x={crmCtx.x}
          y={crmCtx.y}
          currentAlign={crmCols[crmCtx.colIndex]?.align || 'left'}
          onSelect={align => crmSetAlign(crmCtx.colIndex, align)}
          onReset={crmReset}
          onClose={crmClose}
        />
      )}

    </div>
  );
}
