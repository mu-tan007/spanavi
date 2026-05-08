import { useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { updateClient, insertClient, deleteClient } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import useColumnConfig from '../../hooks/useColumnConfig';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import PageHeader from '../common/PageHeader';
import ClientDetailPage from './contacts/ClientDetailPage';
import { dbFieldsToFe } from '../../utils/clientFieldsMap';
import { insertClientContact as insertClientContactFn } from '../../lib/supabaseWrite';
import { NAVY, CRM_COLS_BASE, CRM_COLS_EDIT, currentYearMonth } from './crm/utils';
import { fetchClientMonthlyTargets } from '../../lib/supabaseWrite';
import RewardDetailModal from './crm/RewardDetailModal';
import ClientFormModal from './crm/ClientFormModal';
import CRMHeader from './crm/CRMHeader';
import CRMStatusTabs from './crm/CRMStatusTabs';
import CRMTable from './crm/CRMTable';
import MonthlyTargetsView from './crm/MonthlyTargetsView';
import CRMKPIDashboard from './crm/CRMKPIDashboard';
import CRMPipelineView from './crm/CRMPipelineView';
import CRMLeadGenView from './crm/CRMLeadGenView';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 },
  },
});

export default function CRMView(props) {
  return (
    <QueryClientProvider client={queryClient}>
      <CRMViewInner {...props} />
    </QueryClientProvider>
  );
}

function CRMViewInner({ isAdmin, clientData, setClientData, rewardMaster = [], contactsByClient = {}, setContactsByClient, callListData = [], currentUser = '', members = [] }) {
  const [statusFilter, setStatusFilter] = useState("支援中");
  const [search, setSearch] = useState("");
  const [showRewardDetail, setShowRewardDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addToast, setAddToast] = useState(null);
  // 詳細ページ切替
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'targets'
  const [detailClient, setDetailClient] = useState(null);
  // 新規顧客追加で AI が抽出した「追加候補の担当者」をキューする
  const [pendingNewContacts, setPendingNewContacts] = useState([]);
  // 既存顧客の編集で AI が抽出した「追加候補の担当者」をキューする
  const [pendingEditContacts, setPendingEditContacts] = useState([]);

  const goToDetail = (c) => { setDetailClient(c); setView('detail'); };
  const goToList = () => { setView('list'); setDetailClient(null); };

  const orgId = getOrgId();

  // 最終接点の元データを React Query で 5分キャッシュ
  const memoQuery = useQuery({
    queryKey: ['crm-memo-events', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_memo_events')
        .select('contact_id, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) { console.warn('[CRM] memo lookup failed', error); return []; }
      return data || [];
    },
    enabled: !!orgId,
  });

  const appoQuery = useQuery({
    queryKey: ['crm-appointments', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('client_id, appointment_date, created_at')
        .eq('org_id', orgId)
        .order('appointment_date', { ascending: false })
        .limit(2000);
      if (error) { console.warn('[CRM] appointment lookup failed', error); return []; }
      return data || [];
    },
    enabled: !!orgId,
  });

  // 当月の月別目標（テーブル目標対比%列、KPI共通キャッシュ）
  const currentYM = useMemo(() => currentYearMonth(), []);
  const monthlyTargetsQuery = useQuery({
    queryKey: ['crm-monthly-targets', currentYM, currentYM],
    queryFn: async () => {
      const { data } = await fetchClientMonthlyTargets(currentYM, currentYM);
      return data;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // 最終接点 (clientId -> ISO timestamp) はメモから派生計算
  const lastTouchByClient = useMemo(() => {
    const contactToClient = {};
    Object.entries(contactsByClient).forEach(([cid, list]) => {
      (list || []).forEach(ct => { if (ct?.id) contactToClient[ct.id] = cid; });
    });
    const result = {};
    (memoQuery.data || []).forEach(m => {
      const cid = contactToClient[m.contact_id];
      if (!cid) return;
      if (!result[cid] || m.created_at > result[cid]) result[cid] = m.created_at;
    });
    (appoQuery.data || []).forEach(a => {
      const ts = a.appointment_date || a.created_at;
      const cid = a.client_id;
      if (!cid || !ts) return;
      if (!result[cid] || ts > result[cid]) result[cid] = ts;
    });
    return result;
  }, [memoQuery.data, appoQuery.data, contactsByClient]);

  // 当月の実績アポ件数を clientId -> count にまとめる
  const monthAppoCountByClient = useMemo(() => {
    const map = {};
    const ymPrefix = currentYM;
    (appoQuery.data || []).forEach(a => {
      const ts = a.appointment_date || a.created_at;
      if (!ts || !String(ts).startsWith(ymPrefix)) return;
      if (!a.client_id) return;
      map[a.client_id] = (map[a.client_id] || 0) + 1;
    });
    return map;
  }, [appoQuery.data, currentYM]);

  // 当月の目標を clientId -> targetCount にまとめる
  const monthTargetByClient = useMemo(() => {
    const map = {};
    (monthlyTargetsQuery.data || []).forEach(t => {
      map[t.client_id] = t.target_count || 0;
    });
    return map;
  }, [monthlyTargetsQuery.data]);

  // 全クライアント中の最大月間目標（優先度スコアの規模ファクター）
  const maxMonthTarget = useMemo(
    () => Math.max(0, ...Object.values(monthTargetByClient)),
    [monthTargetByClient]
  );

  // アラートフィルタ ('overdue' | 'expired' | null)
  const [alertFilter, setAlertFilter] = useState(null);

  // フォロー漏れ判定: 最終接点 30日以上前 or 一度も接点なし（架電履歴・アポ・メモのいずれもない）
  const isOverdue = (c) => {
    const ts = lastTouchByClient[c._supaId];
    if (!ts) return true;  // 接点なし = フォロー漏れ
    const days = Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24));
    return days >= 30;
  };

  // 予定日超過判定: 「面談予定」ステータスで next_contact_at が過去
  const isExpired = (c) => {
    if (c.status !== '面談予定') return false;
    if (!c.nextContactAt) return false;
    return new Date(c.nextContactAt).getTime() < Date.now();
  };

  // バッジ件数（statusFilter は無視して全クライアントから集計）
  const overdueCount = clientData.filter(isOverdue).length;
  const expiredCount = clientData.filter(isExpired).length;

  const filtered = clientData.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search && !c.company.includes(search) && !c.industry.includes(search)) return false;
    if (alertFilter === 'overdue' && !isOverdue(c)) return false;
    if (alertFilter === 'expired' && !isExpired(c)) return false;
    return true;
  });

  const statusCounts = {};
  clientData.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  const rewardMap = {};
  rewardMaster.forEach(r => {
    if (!rewardMap[r.id]) rewardMap[r.id] = { name: r.name, timing: r.timing, basis: r.basis, tax: r.tax, tiers: [] };
    rewardMap[r.id].tiers.push(r);
  });

  const crmDefaultCols = setClientData ? CRM_COLS_EDIT : CRM_COLS_BASE;
  const { columns: crmCols, gridTemplateColumns: crmGrid, contentMinWidth: crmMinW, onResizeStart: crmResize, onHeaderContextMenu: crmCtxMenu, contextMenu: crmCtx, setAlign: crmSetAlign, resetAll: crmReset, closeMenu: crmClose } = useColumnConfig(setClientData ? 'crmViewEdit' : 'crmView', crmDefaultCols);

  const handleSaveEdit = async () => {
    if (!editForm || !setClientData) return;
    const idx = editForm._idx;
    const oldStatus = clientData[idx]?.status;
    const updated = { ...editForm };
    delete updated._idx;
    // ステータスが変わったら変更日時を記録
    const statusChanged = oldStatus !== updated.status;
    if (statusChanged) {
      updated.statusChangedAt = new Date().toISOString();
    }
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
      {view !== 'detail' && (
        <PageHeader
          eyebrow="Sourcing · 顧客"
          title="CRM"
          description="顧客・連絡先・契約条件・月別目標の管理"
          style={{ marginBottom: 16 }}
        />
      )}

      {/* サブビュー切替（list / pipeline / leadgen / targets） */}
      {view !== 'detail' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {[
            { key: 'list',     label: '顧客一覧' },
            { key: 'pipeline', label: 'パイプライン' },
            { key: 'leadgen',  label: '新規開拓' },
            { key: 'targets',  label: '月別目標' },
          ].map(t => {
            const active = view === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 4,
                  border: '1px solid ' + (active ? NAVY : '#E5E7EB'),
                  background: active ? NAVY : '#fff',
                  color: active ? '#fff' : '#6B7280',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Noto Sans JP'",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 月別目標ビュー */}
      {view === 'targets' && (
        <MonthlyTargetsView clientData={clientData} />
      )}

      {/* パイプラインビュー */}
      {view === 'pipeline' && (
        <CRMPipelineView
          clientData={clientData}
          setClientData={setClientData}
          contactsByClient={contactsByClient}
          monthAppoCountByClient={monthAppoCountByClient}
          monthTargetByClient={monthTargetByClient}
          maxMonthTarget={maxMonthTarget}
          onCardClick={goToDetail}
        />
      )}

      {/* 新規開拓ボード */}
      {view === 'leadgen' && (
        <CRMLeadGenView currentUser={currentUser} members={members} setClientData={setClientData} />
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
          currentUser={currentUser}
          onBack={goToList}
          onEdit={(cl) => {
            const idx = clientData.findIndex(x => x._supaId === cl._supaId);
            setEditForm({ ...cl, _idx: idx });
          }}
          onShowReward={(rid) => setShowRewardDetail(rid)}
        />
      )}

      {/* List mode: KPI + header + tabs + table */}
      {view === 'list' && (
        <>
          <CRMKPIDashboard clientData={clientData} statusCounts={statusCounts} />
          <CRMHeader
            filteredCount={filtered.length}
            search={search}
            setSearch={setSearch}
            onAddClient={initial => setAddForm(initial)}
            isEditable={!!setClientData}
            overdueCount={overdueCount}
            expiredCount={expiredCount}
            alertFilter={alertFilter}
            setAlertFilter={setAlertFilter}
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
            monthAppoCountByClient={monthAppoCountByClient}
            monthTargetByClient={monthTargetByClient}
            maxMonthTarget={maxMonthTarget}
            onRowClick={goToDetail}
            onEditRow={(c, globalIdx) => setEditForm({ ...c, _idx: globalIdx })}
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
