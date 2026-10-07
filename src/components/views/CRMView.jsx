import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { updateClient, insertClient, deleteClient, reorderClients } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import useColumnConfig from '../../hooks/useColumnConfig';
import { useUrlState } from '../../hooks/useUrlState';
import PageHeader from '../common/PageHeader';
import { color, radius, font, shadow } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import ClientDetailPage from './contacts/ClientDetailPage';
import { EmailFollowupModal } from './BusinessOverviewView';
import RewardTypeManager from './masp/RewardTypeManager';
import { dbFieldsToFe } from '../../utils/clientFieldsMap';
import { insertClientContact as insertClientContactFn } from '../../lib/supabaseWrite';
import CRMProspectsView from './crm/CRMProspectsView';
import { NAVY, CRM_COLS_BASE, CRM_COLS_EDIT, currentYearMonth, STAGE_LIST, SERVICE_LIST } from './crm/utils';
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
import CRMOverview from './crm/CRMOverview';
import ClientDrawer from './crm/ClientDrawer';
import { fetchReportRules } from '../../lib/reportRules';
import { todayJst, QUICK_RULES, ruleCountByClient } from '../../utils/crmOverview';

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
  // お気に入りトグル
  const handleToggleFavorite = useCallback(async (cli) => {
    if (!cli?._supaId || !setClientData) return;
    const next = !cli.isFavorite;
    // optimistic update
    setClientData(prev => prev.map(c => c._supaId === cli._supaId ? { ...c, isFavorite: next } : c));
    const { error } = await supabase
      .from('clients')
      .update({ is_favorite: next })
      .eq('id', cli._supaId);
    if (error) {
      // rollback
      setClientData(prev => prev.map(c => c._supaId === cli._supaId ? { ...c, isFavorite: !next } : c));
      alert('お気に入り更新に失敗しました: ' + (error.message || ''));
    }
  }, [setClientData]);

  // クライアント一覧のドラッグ並び替え。
  // orderedSupaIds は「表示中(filtered)のクライアント」を新しい順に並べた _supaId 配列。
  // 表示外(別ステータス等)のクライアントの相対位置は崩さず、表示中のものだけを並べ替える。
  const handleReorderClients = useCallback(async (orderedSupaIds) => {
    if (!setClientData) return;
    const idSet = new Set(orderedSupaIds);
    const newPos = new Map(orderedSupaIds.map((id, i) => [id, i]));
    // 表示中クライアントを新しい順に並べ替え
    const displayedSorted = clientData
      .filter(c => idSet.has(c._supaId))
      .sort((a, b) => newPos.get(a._supaId) - newPos.get(b._supaId));
    let di = 0;
    // 全体配列を再構築 (表示外はその場に固定、表示中スロットだけ差し替え) → sort_order 振り直し
    const nextArr = clientData
      .map(c => (idSet.has(c._supaId) ? displayedSorted[di++] : c))
      .map((c, i) => ({ ...c, no: (i + 1) * 10 }));
    setClientData(nextArr); // optimistic
    const allIds = nextArr.map(c => c._supaId).filter(Boolean);
    const { error } = await reorderClients(allIds);
    if (error) alert('並び順の保存に失敗しました: ' + (error.message || ''));
  }, [clientData, setClientData]);

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

  // テーブル並び替え state: { key: 'product'|'lastMeeting'|..., dir: 'asc'|'desc' }
  const [sortState, setSortState] = useState({ key: null, dir: null });
  // サービス・段階・要対応の絞り込み（2026-10-06。商材の絞り込みは M&A がほぼ全部で役に立たないため置き換え）
  const [serviceFilter, setServiceFilter] = useUrlState('service', 'all');
  const [stageFilter, setStageFilter] = useUrlState('stage', 'all');
  const [followFilter, setFollowFilter] = useUrlState('follow', null, { allowed: ['due', 'stale'] });
  // 止まった理由の絞り込み（停止中・保留を見るとき用・2026-10-06）
  const [stopReasonFilter, setStopReasonFilter] = useUrlState('stop_reason', 'all');
  // CRM内サブセクション ('clients' = クライアント一覧 / 'rewards' = 報酬体系マスタ / 'contracts' = 契約書テンプレ)
  const [crmSection, setCrmSection] = useUrlState('crm_section', 'clients', { allowed: ['clients', 'prospects', 'rewards'] });

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
    () => clientData.filter(c => c.company !== 'Spartia株式会社' && c.company !== 'M&Aソーシングパートナーズ株式会社'),
    [clientData]
  );
  // バッジ件数（statusFilter は無視して全クライアントから集計）
  const overdueCount = displayClientData.filter(isOverdue).length;
  const expiredCount = displayClientData.filter(isExpired).length;

  // 次の一手の期限切れ／30日以上やり取りなし（記録なしも含む）
  const todayStr = new Date().toISOString().slice(0, 10);
  const isActionDue = (c) => !!c.nextActionDue && c.nextActionDue < todayStr;
  const isContactStale = (c) => {
    if (!c.lastContactAt) return true;
    return (Date.now() - new Date(c.lastContactAt + 'T00:00:00').getTime()) / 86400000 >= 30;
  };

  // 上の段（数字4つ・日数の軸・2026-10-07 見本どおり）。対象は支援中の会社
  const crmToday = todayJst();
  const [quick, setQuick] = useState('');
  const [reportRules, setReportRules] = useState([]);
  const loadRules = useCallback(async (force = false) => { setReportRules(await fetchReportRules({ force })); }, []);
  useEffect(() => { loadRules(); }, [loadRules]);
  const ruleCount = useMemo(() => ruleCountByClient(reportRules), [reportRules]);
  const activeClients = useMemo(() => displayClientData.filter(c => c.status === '支援中'), [displayClientData]);
  const [drawerId, setDrawerId] = useState(null);
  const [drawerTab, setDrawerTab] = useState('base');
  const [hoverId, setHoverId] = useState(null);
  const drawerClient = drawerId ? (clientData || []).find(c => c._supaId === drawerId) || null : null;
  const openDrawer = (c, tab = 'base') => { setDrawerTab(tab); setDrawerId(c._supaId); };
  const flashRow = (c) => {
    const el = document.querySelector(`[data-client-id="${c._supaId}"]`);
    if (!el) { openDrawer(c); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('co-flash'); void el.offsetWidth; el.classList.add('co-flash');
  };

  const filtered = displayClientData.filter(c => {
    if (quick) {
      if (c.status !== '支援中' || !QUICK_RULES[quick](c, crmToday, ruleCount)) return false;
      return !search || c.company.includes(search) || c.industry.includes(search);
    }
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (serviceFilter !== 'all' && (c.service || '未設定') !== serviceFilter) return false;
    if (stageFilter !== 'all' && (c.stage || '未設定') !== stageFilter) return false;
    if (followFilter === 'due' && !isActionDue(c)) return false;
    if (followFilter === 'stale' && !isContactStale(c)) return false;
    if (statusFilter === '停止中' && stopReasonFilter !== 'all' && (c.stopReason || '未入力') !== stopReasonFilter) return false;
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
  // ユーザー指定ソート (商材/企業名/最終接点/支払いサイト/目標対比 等)
  if (sortState.key) {
    const dir = sortState.dir === 'desc' ? -1 : 1;
    const sortKey = sortState.key;
    const getVal = (c) => {
      switch (sortKey) {
        case 'service':     return (c.service || '').toString();
        case 'stage':       return STAGE_LIST.indexOf(c.stage);
        case 'lastContact': return c.lastContactAt ? new Date(c.lastContactAt).getTime() : -Infinity;
        case 'age':         return c.lastContactAt ? -new Date(c.lastContactAt).getTime() : Infinity;
        case 'rules':       return ruleCount[c._supaId] || 0;
        case 'nextAction':  return c.nextActionDue ? new Date(c.nextActionDue).getTime() : Infinity;
        case 'company':     return (c.company || '').toString();
        case 'status':      return (c.status || '').toString();
        case 'lastMeeting': {
          const ts = lastMeetingByClient[c._supaId];
          return ts ? new Date(ts).getTime() : -Infinity;
        }
        case 'paySite':     return (c.paySite || '').toString();
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

  // 列で並べ替えていないときは、契約済みで始まっていない先を上に出す（いちばん早く売上になる層）
  // ☆（お気に入り）で上に寄せる機能は外した（2026-10-06）
  const isKick = (c) => (!sortState.key && c.stage === '契約済・未開始') ? 1 : 0;
  filtered.sort((a, b) => isKick(b) - isKick(a));

  const statusCounts = {};
  displayClientData.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  const rewardMap = {};
  rewardMaster.forEach(r => {
    if (!rewardMap[r.id]) rewardMap[r.id] = { name: r.name, timing: r.timing, basis: r.basis, tax: r.tax, tiers: [] };
    rewardMap[r.id].tiers.push(r);
  });

  // ドラッグ並び替えは「手動順」で表示しているときだけ有効化する。
  // 文字検索・カラムソート・「面談予定」(独自ソート) 中は表示順と sort_order がズレるため無効。
  // 契約済・未開始を上に寄せている一覧も、表示順と sort_order がズレるので無効
  const canDragClients = !!setClientData && !search.trim() && !sortState.key && statusFilter !== '面談予定'
    && !filtered.some(c => c.stage === '契約済・未開始');

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
          title="顧客管理"
          description="クライアントとのやり取りの間隔と、次の一手"
          style={{ marginBottom: 16 }}
        />
      )}

      {/* CRMサブタブ切替 (詳細ページ表示中は非表示) */}
      {view !== 'detail' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${color.border}` }}>
          {[
            { key: 'clients',   label: 'クライアント一覧' },
            { key: 'prospects', label: '開拓' },
            { key: 'rewards',   label: '報酬体系マスタ' },
          ].map(t => {
            const active = crmSection === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setCrmSection(t.key)}
                style={{
                  padding: '8px 18px', fontSize: font.size.sm, fontWeight: font.weight.semibold,
                  background: 'transparent', border: 'none',
                  color: active ? NAVY : color.textLight,
                  borderBottom: `3px solid ${active ? '#C8A45A' : 'transparent'}`, // 2026-10-08 選択中の下線は金（新しい見た目）
                  cursor: 'pointer', fontFamily: font.family.sans,
                  marginBottom: -1,
                }}
              >{t.label}</button>
            );
          })}
        </div>
      )}

      {/* 開拓：まだアポを取ったことがない潜在顧客の一覧（2026-10-06。スケジュールのタブは使わないので外した） */}
      {view !== 'detail' && crmSection === 'prospects' && <CRMProspectsView />}

      {/* 報酬体系マスタ画面 */}
      {view !== 'detail' && crmSection === 'rewards' && (
        <RewardTypeManager isAdmin={isAdmin} />
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

      {/* List mode: header + tabs + table (rewards サブタブ時は非表示) */}
      {view === 'list' && crmSection === 'clients' && (
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
          <CRMOverview
            clients={activeClients}
            today={crmToday}
            ruleCount={ruleCount}
            quick={quick}
            onQuick={setQuick}
            onDot={flashRow}
            hoverId={hoverId}
          />
          {quick && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '-4px 0 10px', fontSize: font.size.xs, color: color.textMid }}>
              <span>上の数字で絞り込み中（支援中の会社だけ・下の絞り込みは外しています） ・ {filtered.length}社</span>
              <Button variant="ghost" size="sm" onClick={() => setQuick('')}>解除</Button>
            </div>
          )}
          <CRMStatusTabs
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            totalCount={displayClientData.length}
          />
          {/* サービス・段階・要対応（いま選んでいる状態の中で数える） */}
          {(() => {
            const pool = displayClientData.filter(c => statusFilter === 'all' || c.status === statusFilter);
            const chip = (active, danger) => ({
              padding: '4px 12px', borderRadius: radius.sm, fontSize: 11, fontWeight: font.weight.semibold,
              cursor: 'pointer', fontFamily: font.family.sans,
              border: '1px solid ' + (active ? (danger ? color.danger : NAVY) : (danger ? color.dangerSoft : color.border)),
              background: active ? (danger ? color.danger : NAVY) : (danger ? color.dangerSoft : color.white),
              color: active ? color.white : (danger ? color.danger : color.textMid),
            });
            const label = (t) => <span style={{ fontSize: 11, color: color.textLight, fontWeight: font.weight.semibold, minWidth: 56 }}>{t}</span>;
            const row = { display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' };
            const count = (key) => pool.reduce((m, c) => { const k = c[key] || '未設定'; m[k] = (m[k] || 0) + 1; return m; }, {});
            const svc = count('service');
            const svcKeys = [...SERVICE_LIST, '未設定'].filter(k => svc[k]);
            const svcPool = serviceFilter === 'all' ? pool : pool.filter(c => (c.service || '未設定') === serviceFilter);
            const stg = svcPool.reduce((m, c) => { const k = c.stage || '未設定'; m[k] = (m[k] || 0) + 1; return m; }, {});
            const stgKeys = [...STAGE_LIST, '未設定'].filter(k => stg[k]);
            return (
              <>
                <div style={row}>
                  {label('サービス')}
                  <button onClick={() => setServiceFilter('all')} style={chip(serviceFilter === 'all')}>全て <span style={{ fontSize: 10, opacity: 0.7 }}>{pool.length}</span></button>
                  {svcKeys.map(k => (
                    <button key={k} onClick={() => setServiceFilter(k)} style={chip(serviceFilter === k)}>{k} <span style={{ fontSize: 10, opacity: 0.7 }}>{svc[k]}</span></button>
                  ))}
                </div>
                {stgKeys.length > 1 && (
                  <div style={row}>
                    {label('段階')}
                    <button onClick={() => setStageFilter('all')} style={chip(stageFilter === 'all')}>全て <span style={{ fontSize: 10, opacity: 0.7 }}>{svcPool.length}</span></button>
                    {stgKeys.map(k => (
                      <button key={k} onClick={() => setStageFilter(k)} style={chip(stageFilter === k)}>{k} <span style={{ fontSize: 10, opacity: 0.7 }}>{stg[k]}</span></button>
                    ))}
                  </div>
                )}
                <div style={row}>
                  {label('要対応')}
                  <button onClick={() => setFollowFilter(followFilter === 'due' ? null : 'due')} style={chip(followFilter === 'due', true)}>
                    次の一手が期限切れ <span style={{ fontSize: 10, opacity: 0.7 }}>{svcPool.filter(isActionDue).length}</span></button>
                  <button onClick={() => setFollowFilter(followFilter === 'stale' ? null : 'stale')} style={chip(followFilter === 'stale', true)}>
                    30日以上やり取りなし <span style={{ fontSize: 10, opacity: 0.7 }}>{svcPool.filter(isContactStale).length}</span></button>
                </div>
              </>
            );
          })()}
          {/* 止まった理由（停止中・保留のときだけ出す。詳細画面で入れた理由で絞る） */}
          {statusFilter === '停止中' && (() => {
            const pool = displayClientData.filter(c => c.status === statusFilter);
            const counts = pool.reduce((m, c) => { const k = c.stopReason || '未入力'; m[k] = (m[k] || 0) + 1; return m; }, {});
            const keys = ['方針転換・体制', 'アポの質', '予算', '成果不足', 'その他', '未入力'].filter(k => counts[k]);
            const btn = (active) => ({
              padding: '4px 12px', borderRadius: radius.sm, fontSize: 11, fontWeight: font.weight.semibold,
              cursor: 'pointer', fontFamily: font.family.sans,
              border: '1px solid ' + (active ? NAVY : color.border),
              background: active ? NAVY : color.white, color: active ? color.white : color.textMid,
            });
            return (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: color.textLight, fontWeight: font.weight.semibold, marginRight: 4 }}>止まった理由:</span>
                <button onClick={() => setStopReasonFilter('all')} style={btn(stopReasonFilter === 'all')}>
                  全て <span style={{ fontSize: 10, opacity: 0.7 }}>{pool.length}</span></button>
                {keys.map(k => (
                  <button key={k} onClick={() => setStopReasonFilter(k)} style={btn(stopReasonFilter === k)}>
                    {k} <span style={{ fontSize: 10, opacity: 0.7 }}>{counts[k]}</span></button>
                ))}
              </div>
            );
          })()}
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
            contactsByClient={contactsByClient}
            monthAppoCountByClient={monthAppoCountByClient}
            monthTargetByClient={monthTargetByClient}
            maxMonthTarget={maxMonthTarget}
            rewardsByClient={rewardsByClient}
            rewardMaster={rewardMaster}
            sortState={sortState}
            setSortState={setSortState}
            onRowClick={(c) => openDrawer(c)}
            ruleCount={ruleCount}
            today={crmToday}
            onRowHover={setHoverId}
            onOpenRules={(c) => openDrawer(c, 'rule')}
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
            onToggleFavorite={handleToggleFavorite}
            canDrag={canDragClients}
            onReorder={handleReorderClients}
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

      {drawerClient && view === 'list' && (
        <ClientDrawer
          client={drawerClient}
          today={crmToday}
          contacts={contactsByClient[drawerClient._supaId] || []}
          lists={(callListData || []).filter(l => l.client_id === drawerClient._supaId)}
          rules={reportRules.filter(r => r.client_id === drawerClient._supaId)}
          reward={rewardMap[drawerClient.rewardType] || null}
          engagementRewards={rewardsByClient[drawerClient._supaId] || []}
          monthAppoCount={monthAppoCountByClient[drawerClient._supaId] || 0}
          isAdmin={isAdmin}
          currentUser={currentUser}
          initialTab={drawerTab}
          onClose={() => setDrawerId(null)}
          onOpenPage={(c) => { setDrawerId(null); goToDetail(c); }}
          onRulesSaved={() => loadRules(true)}
        />
      )}

      <RewardDetailModal
        rewardId={showRewardDetail}
        rewardMap={rewardMap}
        onClose={() => setShowRewardDetail(null)}
      />

      {emailCtx && emailCtx.kind !== 'bulk' && (
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
