import { useState, useEffect } from 'react';
import { updateClient, insertClient, deleteClient } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import useColumnConfig from '../../hooks/useColumnConfig';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import PageHeader from '../common/PageHeader';
import ClientDetailPage from './contacts/ClientDetailPage';
import { dbFieldsToFe } from '../../utils/clientFieldsMap';
import { insertClientContact as insertClientContactFn } from '../../lib/supabaseWrite';
import { NAVY, CRM_COLS_BASE, CRM_COLS_EDIT } from './crm/utils';
import RewardDetailModal from './crm/RewardDetailModal';
import ClientFormModal from './crm/ClientFormModal';
import CRMHeader from './crm/CRMHeader';
import CRMStatusTabs from './crm/CRMStatusTabs';
import CRMTable from './crm/CRMTable';

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

      {/* List mode: header + tabs + table */}
      {view === 'list' && (
        <>
          <CRMHeader
            filteredCount={filtered.length}
            search={search}
            setSearch={setSearch}
            onAddClient={initial => setAddForm(initial)}
            isEditable={!!setClientData}
          />
          <CRMStatusTabs
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            totalCount={clientData.length}
          />
          <CRMTable
            filtered={filtered}
            clientData={clientData}
            isEditable={!!setClientData}
            crmCols={crmCols}
            crmGrid={crmGrid}
            crmMinW={crmMinW}
            crmCtxMenu={crmCtxMenu}
            crmResize={crmResize}
            lastTouchByClient={lastTouchByClient}
            contactsByClient={contactsByClient}
            getRewardSummary={getRewardSummary}
            onRowClick={goToDetail}
            onEditRow={(c, globalIdx) => setEditForm({ ...c, _idx: globalIdx })}
            onShowReward={rid => setShowRewardDetail(rid)}
          />
        </>
      )}

      {/* Toast */}
      {addToast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: NAVY, color: '#fff', padding: "10px 20px", borderRadius: 4, fontSize: 12, fontWeight: 600, zIndex: 30000, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", fontFamily: "'Noto Sans JP'" }}>
          {addToast}
        </div>
      )}

      {/* 新規顧客追加モーダル */}
      {addForm && setClientData && (
        <ClientFormModal
          mode="add"
          form={addForm}
          setForm={setAddForm}
          onSave={handleSaveAdd}
          onCancel={() => { setAddForm(null); setPendingNewContacts([]); }}
          saving={addSaving}
          rewardMaster={rewardMaster}
          rewardMap={rewardMap}
          pendingContacts={pendingNewContacts}
          onClearPendingContacts={() => setPendingNewContacts([])}
          voiceTargetKind="client_create"
          onVoiceProcessed={handleNewClientVoiceProcessed}
        />
      )}

      {/* 顧客編集モーダル */}
      {editForm && setClientData && (
        <ClientFormModal
          mode="edit"
          form={editForm}
          setForm={setEditForm}
          onSave={handleSaveEdit}
          onCancel={() => { setEditForm(null); setPendingEditContacts([]); }}
          onDelete={async () => {
            if (editForm._supaId) {
              const error = await deleteClient(editForm._supaId);
              if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
            }
            setClientData(prev => prev.filter((_, i) => i !== editForm._idx));
            setEditForm(null);
          }}
          rewardMaster={rewardMaster}
          rewardMap={rewardMap}
          pendingContacts={pendingEditContacts}
          onClearPendingContacts={() => setPendingEditContacts([])}
          voiceTargetKind="client_update"
          voiceClientId={editForm._supaId || null}
          onVoiceProcessed={handleEditVoiceProcessed}
        />
      )}

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
