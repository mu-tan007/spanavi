import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { updateClient, insertClient, deleteClient } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import useColumnConfig from '../../hooks/useColumnConfig';
import { useUrlState } from '../../hooks/useUrlState';
import PageHeader from '../common/PageHeader';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import ClientDetailPage from './contacts/ClientDetailPage';
import { EmailFollowupModal } from './BusinessOverviewView';
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
import { useEngagements } from '../../hooks/useEngagements';

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

function CRMViewInner({ isAdmin, clientData, setClientData, rewardMaster = [], contactsByClient = {}, setContactsByClient, callListData = [], currentUser = '', members = [], clientEngagementRewards = [] }) {
  // ハードリロード/URL共有で状態保持するため URL クエリに同期
  const [statusFilter, setStatusFilter] = useUrlState('crm_status', '支援中');
  const [search, setSearch]             = useUrlState('crm_q', '');
  const [view, setView]                 = useUrlState('view', 'list', { allowed: ['list', 'detail'] });
  const [detailClientId, setDetailClientId] = useUrlState('clientId', null);

  const [showRewardDetail, setShowRewardDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addToast, setAddToast] = useState(null);
  const [emailCtx, setEmailCtx] = useState(null); // クライアント向けフォローメール作成 ctx
  // 新規顧客追加で AI が抽出した「追加候補の担当者」をキューする
  const [pendingNewContacts, setPendingNewContacts] = useState([]);
  // 既存顧客の編集で AI が抽出した「追加候補の担当者」をキューする
  const [pendingEditContacts, setPendingEditContacts] = useState([]);

  // URL の clientId から実 clientData を復元（リロード時の view='detail' 対応）
  const detailClient = useMemo(() => {
    if (!detailClientId) return null;
    return (clientData || []).find(c => c._supaId === detailClientId) || null;
  }, [detailClientId, clientData]);

  // view と clientId の同時切替は単一 setSearchParams で行う必要がある。
  // React Router の useSearchParams は内部 ref を useEffect で遅延更新するため、
  // useUrlState 経由で setView + setDetailClientId を連続で呼ぶと 2回目の更新が
  // 1回目を上書きして消す（→ 顧客行クリックで詳細画面が真っ白になる事故の原因）。
  const [, setSearchParams] = useSearchParams();
  const goToDetail = (c) => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      if (c?._supaId) np.set('clientId', c._supaId); else np.delete('clientId');
      np.set('view', 'detail');
      return np;
    }, { replace: true });
  };
  const goToList = () => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      np.delete('view');   // default 'list' は URL から消す
      np.delete('clientId');
      return np;
    }, { replace: true });
  };

  // 詳細ページ表示中に編集後の値を反映するための互換 setter（view は維持）
  const setDetailClient = (c) => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      if (c?._supaId) np.set('clientId', c._supaId); else np.delete('clientId');
      return np;
    }, { replace: true });
  };

  // 状態整合性: view='detail' なのに detailClient が見つからない → 自動で list に戻す
  // 復帰すべきパターン:
  //   (a) clientId が URL から欠落（旧 goToDetail の race で残った "view=detail だけ" の URL）
  //   (b) clientId はあるが現 clientData に該当 client が無い（削除済み/別engagement/共有URL）
  // (b) のみ「clientData がロード前の length===0 段階」では即時判定せず待つ。
  // (a) は clientId 自体が無いので clientData ロード完了を待つ必要はない（即時 list 復帰）。
  useEffect(() => {
    if (view !== 'detail') return;
    if (detailClient) return;
    // clientId が URL にあるが clientData が未ロードのケースは復帰判定を保留
    if (detailClientId && (!clientData || clientData.length === 0)) return;
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      np.delete('view');
      np.delete('clientId');
      return np;
    }, { replace: true });
  }, [view, detailClientId, detailClient, clientData, setSearchParams]);

  const orgId = getOrgId();
  const { currentEngagement } = useEngagements();

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

  // engagements マスタ (報酬体系列の eng名表示用)
  const [engagementsMaster, setEngagementsMaster] = useState([]);
  // 商材マスタ (商材タブ表示順用)
  const [categoryOptions, setCategoryOptions] = useState([]);
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const [{ data: engs }, { data: cats }] = await Promise.all([
        supabase.from('engagements').select('id, name, type, category_id').eq('org_id', orgId).eq('status', 'active'),
        supabase.from('business_categories').select('id, name, display_order').eq('org_id', orgId).eq('is_active', true).order('display_order'),
      ]);
      if (cancelled) return;
      const catMap = new Map((cats || []).map(c => [c.id, c]));
      setCategoryOptions((cats || []).map(c => ({ value: c.name, label: c.name })));
      setEngagementsMaster((engs || []).map(e => ({
        ...e,
        category_name: catMap.get(e.category_id)?.name || null,
        category_order: catMap.get(e.category_id)?.display_order || 999,
      })));
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // クライアント別 報酬体系マップ: { [client_id]: [{ engName, categoryName, rewardName }] }
  const rewardsByClient = useMemo(() => {
    const engMap = new Map(engagementsMaster.map(e => [e.id, e]));
    const typeNameMap = new Map((rewardMaster || []).map(r => [r.id || r.type_id, r.name]));
    const map = {};
    for (const r of clientEngagementRewards) {
      if (!r.reward_type) continue;
      const eng = engMap.get(r.engagement_id);
      if (!eng) continue;
      if (!map[r.client_id]) map[r.client_id] = [];
      map[r.client_id].push({
        engName: eng.name || '—',
        categoryName: eng.category_name || '—',
        categoryOrder: eng.category_order || 999,
        rewardType: r.reward_type,
        rewardName: typeNameMap.get(r.reward_type) || r.reward_type,
      });
    }
    // 各クライアント内で 商材順 → engName順 でソート
    Object.values(map).forEach(arr => {
      arr.sort((a, b) =>
        (a.categoryOrder - b.categoryOrder) || a.engName.localeCompare(b.engName)
      );
    });
    return map;
  }, [clientEngagementRewards, engagementsMaster, rewardMaster]);

  // 最終接点 (client_meetings.meeting_at の最大値)
  const lastMeetingQuery = useQuery({
    queryKey: ['crm-last-meeting-by-client', orgId],
    queryFn: async () => {
      const { fetchLastMeetingByClient } = await import('../../lib/supabaseWrite');
      const { data } = await fetchLastMeetingByClient();
      return data || {};
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
  const lastMeetingByClient = lastMeetingQuery.data || {};

  // 各クライアントの「アクティブな架電リスト数」
  const listCountByClient = useMemo(() => {
    const map = {};
    (callListData || []).forEach(l => {
      if (l.is_archived) return;
      if (!l.client_id) return;
      map[l.client_id] = (map[l.client_id] || 0) + 1;
    });
    return map;
  }, [callListData]);

  // テーブル並び替え state: { key: 'product'|'lastMeeting'|..., dir: 'asc'|'desc' }
  const [sortState, setSortState] = useState({ key: null, dir: null });
  // 商材フィルタ ('all' or '商材名')
  const [productFilter, setProductFilter] = useUrlState('product', 'all');

  // クライアントが持つ商材一覧 (タブのカウント用)
  const productCounts = useMemo(() => {
    const m = {};
    (clientData || []).forEach(c => {
      if (!c.industry || c.company === 'M&Aソーシングパートナーズ株式会社') return;
      m[c.industry] = (m[c.industry] || 0) + 1;
    });
    return m;
  }, [clientData]);

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
  const [alertFilter, setAlertFilter] = useUrlState('alert', null, { allowed: ['overdue', 'expired'] });

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

  // 自社 (軸②クライアント開拓便宜上の client) を除外した clientData
  // ステータス別カウント・KPI・バッジ件数すべてで自社を含めないため、ここで filter 済を使う
  const displayClientData = useMemo(
    () => clientData.filter(c => c.company !== 'M&Aソーシングパートナーズ株式会社'),
    [clientData]
  );
  // バッジ件数（statusFilter は無視して全クライアントから集計）
  const overdueCount = displayClientData.filter(isOverdue).length;
  const expiredCount = displayClientData.filter(isExpired).length;

  const filtered = displayClientData.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (productFilter !== "all" && c.industry !== productFilter) return false;
    if (search && !c.company.includes(search) && !c.industry.includes(search)) return false;
    if (alertFilter === 'overdue' && !isOverdue(c)) return false;
    if (alertFilter === 'expired' && !isExpired(c)) return false;
    return true;
  });
  // 「面談予定」フィルタ時は next_contact_at 昇順（直近の予定が上、null は末尾）
  if (statusFilter === '面談予定') {
    filtered.sort((a, b) => {
      const ta = a.nextContactAt ? new Date(a.nextContactAt).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.nextContactAt ? new Date(b.nextContactAt).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }
  // ユーザー指定ソート (商材/企業名/最終接点/リスト数/目標対比 等)
  if (sortState.key) {
    const dir = sortState.dir === 'desc' ? -1 : 1;
    const sortKey = sortState.key;
    const getVal = (c) => {
      switch (sortKey) {
        case 'product':     return (c.industry || '').toString();
        case 'company':     return (c.company || '').toString();
        case 'status':      return (c.status || '').toString();
        case 'lastMeeting': {
          const ts = lastMeetingByClient[c._supaId];
          return ts ? new Date(ts).getTime() : -Infinity;
        }
        case 'listCount':   return listCountByClient[c._supaId] || 0;
        case 'targetRatio': {
          const tgt = monthTargetByClient[c._supaId] || 0;
          if (!tgt) return -Infinity;
          return ((monthAppoCountByClient[c._supaId] || 0) / tgt);
        }
        default: return '';
      }
    };
    filtered.sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return va.toString().localeCompare(vb.toString(), 'ja') * dir;
    });
  }

  const statusCounts = {};
  displayClientData.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  const rewardMap = {};
  rewardMaster.forEach(r => {
    if (!rewardMap[r.id]) rewardMap[r.id] = { name: r.name, timing: r.timing, basis: r.basis, tax: r.tax, tiers: [] };
    rewardMap[r.id].tiers.push(r);
  });

  const crmDefaultCols = setClientData ? CRM_COLS_EDIT : CRM_COLS_BASE;
  const { columns: crmCols, gridTemplateColumns: crmGrid, contentMinWidth: crmMinW, onResizeStart: crmResize } = useColumnConfig(setClientData ? 'crmViewEdit' : 'crmView', crmDefaultCols);

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
    const { result, error } = await insertClient(addForm, currentEngagement?.id);
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
          title="CRM"
          description="顧客・連絡先・契約条件の管理"
          style={{ marginBottom: 16 }}
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
          currentUser={currentUser}
          onBack={goToList}
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
            overdueCount={overdueCount}
            expiredCount={expiredCount}
            alertFilter={alertFilter}
            setAlertFilter={setAlertFilter}
          />
          <CRMStatusTabs
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            totalCount={displayClientData.length}
          />
          {/* 商材タブ */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: color.textLight, fontWeight: font.weight.semibold, marginRight: 4 }}>商材:</span>
            {(() => {
              const baseBtn = {
                padding: '4px 12px', borderRadius: radius.sm, fontSize: 11, fontWeight: font.weight.semibold,
                cursor: 'pointer', fontFamily: font.family.sans,
              };
              const total = displayClientData.length;
              const ordered = categoryOptions.length > 0
                ? categoryOptions.map(o => o.value).filter(v => productCounts[v] > 0)
                : Object.keys(productCounts).sort();
              return (
                <>
                  <button
                    onClick={() => setProductFilter('all')}
                    style={{
                      ...baseBtn,
                      border: '1px solid ' + (productFilter === 'all' ? NAVY : color.border),
                      background: productFilter === 'all' ? NAVY : color.white,
                      color: productFilter === 'all' ? color.white : color.textMid,
                    }}
                  >全て <span style={{ fontSize: 10, opacity: 0.7 }}>{total}</span></button>
                  {ordered.map(p => {
                    const active = productFilter === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setProductFilter(p)}
                        style={{
                          ...baseBtn,
                          border: '1px solid ' + (active ? NAVY : color.border),
                          background: active ? NAVY : color.white,
                          color: active ? color.white : color.textMid,
                        }}
                      >{p} <span style={{ fontSize: 10, opacity: 0.7 }}>{productCounts[p]}</span></button>
                    );
                  })}
                </>
              );
            })()}
          </div>
          <CRMTable
            filtered={filtered}
            clientData={clientData}
            setClientData={setClientData}
            isEditable={!!setClientData}
            crmCols={crmCols}
            crmGrid={crmGrid}
            crmMinW={crmMinW}
            crmResize={crmResize}
            lastTouchByClient={lastTouchByClient}
            lastMeetingByClient={lastMeetingByClient}
            listCountByClient={listCountByClient}
            contactsByClient={contactsByClient}
            monthAppoCountByClient={monthAppoCountByClient}
            monthTargetByClient={monthTargetByClient}
            maxMonthTarget={maxMonthTarget}
            rewardsByClient={rewardsByClient}
            rewardMaster={rewardMaster}
            sortState={sortState}
            setSortState={setSortState}
            onRowClick={goToDetail}
            onComposeEmail={(c) => setEmailCtx({
              kind: 'client',
              client: {
                client_id: c._supaId,
                client_name: c.company,
                status: c.status,
                industry: c.industry,
                days_since_status_change: c.statusChangedAt
                  ? Math.floor((Date.now() - new Date(c.statusChangedAt).getTime()) / 86400000)
                  : null,
                contact_count: (contactsByClient?.[c._supaId] || []).length,
                past_appo_count: 0,
              },
            })}
          />
        </>
      )}

      {/* Toast */}
      {addToast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: color.navy, color: color.white, padding: "10px 20px", borderRadius: radius.md, fontSize: font.size.sm, fontWeight: font.weight.semibold, zIndex: 30000, boxShadow: shadow.lg, fontFamily: font.family.sans }}>
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

      {emailCtx && (
        <EmailFollowupModal
          modalCtx={emailCtx}
          callListData={callListData}
          clientData={clientData}
          contactsByClient={contactsByClient}
          currentUser={currentUser}
          onClose={() => setEmailCtx(null)}
        />
      )}

    </div>
  );
}
