import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag, DataTable } from '../ui';
import { calcMonthlyPayroll, calcReferralBonuses, salesAmountOf } from '../../utils/money';
import { buildRecalcRows } from '../../utils/payrollRecalc';
import { fetchCumulativeSalesShortfalls, fetchCumulativeFlagMismatches, fetchMemberPayrollAdjustmentTotals } from '../../lib/supabaseWrite';
import { calcRankAndRate } from '../../utils/calculations';
import { supabase } from '../../lib/supabase';
import { updateMemberReward, updateAppoCounted, fetchPayrollSnapshots, upsertPayrollSnapshots, deletePayrollSnapshots, fetchOrgSettings, markMembersReferralPaid, clearMembersReferralPaid, fetchPayrollInvoicesByMonth, downloadPayrollInvoicesZip } from '../../lib/supabaseWrite';
import { getOrgId } from '../../lib/orgContext';
import { PAYROLL_SYNCED_EVENT } from '../../lib/payrollAutoSync';
// 旧 useColumnConfig / ColumnResizeHandle は DataTable 移行で不要に
import PageHeader from '../common/PageHeader';
import PayrollSelfDetailView from './PayrollSelfDetailView';
import SpartiaReceiptsModal from './SpartiaReceiptsModal';
import { useUrlState } from '../../hooks/useUrlState';
import { PayrollFlow, PayrollKpis, PayBar, PayLegend } from './payroll/PayrollParts';
import { payrollFlow, defaultPayrollMonth } from '../../utils/payrollFlow';

const PAYROLL_DATA = [];

// ── Design tokens ──────────────────────────────────────────────────────────
const TH_BG   = '#0D2247';          // テーブルヘッダー背景
const GRAY_200 = '#E5E7EB';         // ボーダー
const GRAY_50  = '#F8F9FA';         // 偶数行背景
const MONO     = "'JetBrains Mono'";

// ランクカラー（左ボーダー方式 / テキスト色）
const RANK_COLORS = {
  'スーパースパルタン': { color: '#b7791f' },
  'スパルタン':         { color: C.green },
  'プレイヤー':          { color: C.navyLight },
  'トレーニー':          { color: C.textLight },
};

// 2026-10-07 見本どおり：メンバー・ランク・今月の売上・支給の内わけ（色の帯）・支給額・請求書
const PAYROLL_COLS = [
  { key: 'name', width: 200, align: 'left' },
  { key: 'rank', width: 140, align: 'left' },
  { key: 'sales', width: 120, align: 'right' },
  { key: 'parts', width: 340, align: 'left' },
  { key: 'total', width: 130, align: 'right' },
  { key: 'invoice', width: 90, align: 'center' },
];

export default function PayrollView({ members, appoData, isAdmin, setMembers, onDataRefetch, currentUser = '' }) {
  // ── 一般メンバー: 自分の詳細ページのみ ────────────────────────
  // 管理者は引き続き全員一覧 + ドリルダウン閲覧（下部 AdminPayrollList）。
  const myMember = (members || []).find(m => typeof m === 'object' && m.name === currentUser) || null;
  const [drillTargetId, setDrillTargetId] = useState(null);
  // 一覧でタップした時に選択していた月を詳細へ引き継ぐ（一覧=5月なのに詳細が前月を開く取り違え防止）
  const [drillMonth, setDrillMonth] = useState(null);

  if (!isAdmin) {
    return <PayrollSelfDetailView targetMember={myMember} members={members} appoData={appoData} canEdit={true} isAdmin={false} />;
  }

  // 管理者ドリルダウン中
  if (drillTargetId) {
    const target = (members || []).find(m => typeof m === 'object' && (m._supaId === drillTargetId || m.id === drillTargetId));
    if (target) {
      const isSelf = target.name === currentUser;
      return (
        <PayrollSelfDetailView
          targetMember={target}
          members={members}
          appoData={appoData}
          canEdit={isSelf}
          isAdmin={isAdmin}
          initialMonth={drillMonth}
          embedded
          onBack={() => setDrillTargetId(null)}
        />
      );
    }
  }

  return <AdminPayrollList
    members={members} appoData={appoData} isAdmin={isAdmin}
    setMembers={setMembers} onDataRefetch={onDataRefetch} currentUser={currentUser}
    onSelectMember={(id, month) => { setDrillTargetId(id); setDrillMonth(month || null); }}
  />;
}

function AdminPayrollList({ members, appoData, isAdmin, setMembers, onDataRefetch, currentUser, onSelectMember }) {
  const payrollMonths = (() => {
    const now = new Date();
    const result = [];
    let y = 2026, m = 3;
    const endD = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    while (new Date(y, m - 1, 1) <= endD) {
      result.push({ label: m + "月", year: y, month: m });
      if (++m > 12) { m = 1; y++; }
    }
    return result;
  })();
  // URL クエリ同期（ハードリロード/共有URL対応）。既存 localStorage は移行のため初期値だけ参照。
  // 開いたときは先月（いま締めている月）。2026-10-07 までは前に開いた月を覚えていて、3月から開いていた
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const defaultMonthTab = defaultPayrollMonth(payrollMonths, todayIso) || "3月";
  const [monthTab, setMonthTab] = useUrlState('month', defaultMonthTab);
  const [teamFilter, setTeamFilter] = useUrlState('team', 'all');
  const [sortKey, setSortKey] = useUrlState('sort', 'total');
  const [syncing, setSyncing] = useState(false);
  // Spartia AI の顧客入金（5%バックの元）を登録するモーダル
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [orgSettings, setOrgSettings] = useState({});

  useEffect(() => {
    fetchOrgSettings().then(({ data }) => setOrgSettings(data || {}));
  }, []);

  // ── Phase 5: 各メンバーの Sourcing 事業内役割を fetch ────────────
  // member_engagements.role_id → engagement_roles.name の map を作る
  // Key: member_id (uuid), Value: 'リーダー' / '副リーダー' / 'メンバー'
  const [memberRoleMap, setMemberRoleMap] = useState({});
  useEffect(() => {
    (async () => {
      const orgId = getOrgId();
      if (!orgId) return;
      const { data: eng } = await supabase
        .from('engagements')
        .select('id')
        .eq('org_id', orgId)
        .eq('slug', 'seller_sourcing')
        .maybeSingle();
      if (!eng) return;
      const { data: meRows } = await supabase
        .from('member_engagements')
        .select('member_id, role:engagement_roles(name)')
        .eq('engagement_id', eng.id)
        .eq('org_id', orgId)
        .not('role_id', 'is', null);
      const map = {};
      (meRows || []).forEach(r => {
        if (r.role?.name) map[r.member_id] = r.role.name;
      });
      setMemberRoleMap(map);
    })();
  }, []);

  // ── スナップショット（報酬確定）────────────────────────────────────
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [unconfirming, setUnconfirming] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // 選択月の YYYY-MM 文字列
  const payMonth = React.useMemo(() => {
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    return `${sel.year}-${String(sel.month).padStart(2, '0')}`;
  }, [monthTab]);

  // 請求書格納済みの member_id セット（月単位）
  const [invoiceMemberIdSet, setInvoiceMemberIdSet] = useState(new Set());
  const [downloadingZip, setDownloadingZip] = useState(false);

  // monthTab 変更時にスナップショットと請求書一覧を取得
  useEffect(() => {
    setSnapshotLoading(true);
    Promise.all([
      fetchPayrollSnapshots(payMonth),
      fetchPayrollInvoicesByMonth(payMonth),
    ]).then(([snapRes, invRes]) => {
      setSnapshots(snapRes.data || []);
      setInvoiceMemberIdSet(new Set((invRes.data || []).map(r => r.member_id)));
      setSnapshotLoading(false);
    });
  }, [payMonth]);

  // アポ側の更新で自動再計算が走ったら、表示中の月なら取り直して最新の金額を出す
  useEffect(() => {
    const onSynced = (e) => {
      if (e.detail?.payMonth !== payMonth) return;
      fetchPayrollSnapshots(payMonth).then(({ data }) => setSnapshots(data || []));
      setActionMsg(`アポの変更にあわせて${monthTab}を再計算しました（${e.detail.diffs.length}名の金額を更新）`);
      setTimeout(() => setActionMsg(''), 8000);
    };
    window.addEventListener(PAYROLL_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(PAYROLL_SYNCED_EVENT, onSynced);
  }, [payMonth, monthTab]);

  // name → member_id（_supaId）の引き当てマップ。一覧の各行は p.name のみ持つため必要
  const memberIdByName = React.useMemo(() => {
    const m = {};
    (members || []).forEach(mem => {
      if (typeof mem === 'object' && mem.name && mem._supaId) m[mem.name] = mem._supaId;
    });
    return m;
  }, [members]);

  // member_id → 表示名（ZIP内のファイル名用）
  const nameByMemberId = React.useMemo(() => {
    const m = {};
    (members || []).forEach(mem => {
      if (typeof mem === 'object' && mem.name && mem._supaId) m[mem._supaId] = mem.name;
    });
    return m;
  }, [members]);

  const handleDownloadAllInvoices = async () => {
    setDownloadingZip(true);
    setActionMsg('');
    try {
      const { count, missing, error } = await downloadPayrollInvoicesZip(payMonth, nameByMemberId);
      if (error) {
        setActionMsg('請求書の一括ダウンロードに失敗しました');
      } else if (count === 0) {
        setActionMsg(`${monthTab}の格納済み請求書はありません`);
      } else {
        setActionMsg(`${monthTab}の請求書 ${count}件をダウンロードしました${missing > 0 ? `（${missing}件は取得できませんでした）` : ''}`);
      }
    } catch (e) {
      console.error('[PayrollView] handleDownloadAllInvoices error:', e);
      setActionMsg('請求書の一括ダウンロードに失敗しました');
    } finally {
      setDownloadingZip(false);
    }
  };

  const isConfirmed = snapshots.length > 0;
  const confirmedAt = isConfirmed
    ? new Date(snapshots[0].confirmed_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;
  // 再計算した月はその時刻も出す（確定日と区別がつくように）
  const recalculatedAt = React.useMemo(() => {
    const latest = snapshots.map(s => s.recalculated_at).filter(Boolean).sort().pop();
    return latest
      ? new Date(latest).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : null;
  }, [snapshots]);

  // リファラル採用インセンティブ計算（ロジック本体は utils/money.js でテスト固定）
  const referralCalc = React.useMemo(() => {
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    return calcReferralBonuses({
      members,
      appoData,
      payMonth,
      monthStart: new Date(sel.year, sel.month - 1, 1),
      monthEnd: new Date(sel.year, sel.month, 0),
    });
  }, [members, appoData, monthTab, payMonth]);
  const referralMap = referralCalc.bonusByReferrer;
  // 当月支払対象の被紹介者IDリスト（確定/解除時にマーキング更新するため）
  const referralPaidMemberIds = referralCalc.paidMemberIds;

  // 月次報酬計算（ロジック本体は utils/money.js でテスト固定）
  const calcData = React.useMemo(
    () => calcMonthlyPayroll({ appoData, members, payMonth, orgSettings, memberRoleMap }),
    [appoData, members, payMonth, orgSettings, memberRoleMap],
  );

  const data = React.useMemo(() => {
    if (!isConfirmed) return calcData;
    return snapshots.map(s => ({
      name: s.member_name,
      team: s.team_name,
      role: s.role,
      rank: s.rank,
      rate: s.incentive_rate,
      totalSales: 0,
      sales: s.monthly_sales,
      incentive: s.incentive_amt,
      teamBonus: s.team_bonus,
      total: s.total_payout - s.referral_bonus,
    }));
  }, [isConfirmed, snapshots, calcData]);

  const activeReferralMap = React.useMemo(() => {
    if (!isConfirmed) return referralMap;
    const map = {};
    snapshots.forEach(s => { map[s.member_name] = s.referral_bonus; });
    return map;
  }, [isConfirmed, snapshots, referralMap]);

  // 報酬確定
  const handleConfirm = async () => {
    if (!isAdmin || confirming) return;
    if (!window.confirm(`${monthTab}の報酬を確定しますか？\n確定後は自動計算が停止し、スナップショットが表示されます。`)) return;
    setConfirming(true);
    setActionMsg('');
    try {
      const rows = calcData.map(p => ({
        org_id: getOrgId(),
        pay_month: payMonth,
        member_name: p.name,
        team_name: p.team,
        role: p.role,
        rank: p.rank,
        incentive_rate: p.rate || 0,
        monthly_sales: p.sales,
        incentive_amt: p.incentive,
        team_bonus: p.teamBonus,
        referral_bonus: referralMap[p.name] || 0,
        total_payout: p.total + (referralMap[p.name] || 0),
        confirmed_by: currentUser || '管理者',
      }));
      const { error } = await upsertPayrollSnapshots(rows);
      if (error) throw error;
      // 当月支払対象の被紹介者を「支払済」としてマーキング（次月以降の重複支給防止）
      if (referralPaidMemberIds.length > 0) {
        await markMembersReferralPaid(referralPaidMemberIds, payMonth);
        if (onDataRefetch) setTimeout(onDataRefetch, 500);
      }
      const { data: fresh } = await fetchPayrollSnapshots(payMonth);
      setSnapshots(fresh || []);
      setActionMsg(`${monthTab}の報酬を確定しました（${rows.length}名）`);
      setTimeout(() => setActionMsg(''), 6000);
    } catch (e) {
      setActionMsg('確定に失敗しました: ' + (e.message || '不明'));
    } finally {
      setConfirming(false);
    }
  };

  // 確定済みの月を最新のアポデータで引き直す（後日キャンセル対応）。
  // チーム・役職・ランク・適用率は確定時の値を固定したまま、金額だけ更新する。
  // 確定解除→再確定だと現在の編成・役職・累計で全部引き直されてしまい、過去月の金額が動く。
  // 再計算の行組み立ては utils/payrollRecalc.js に集約。
  // アポ更新時の自動再計算（lib/payrollAutoSync.js）も同じ関数を使うので、
  // 手動ボタンと自動処理で結果が食い違うことがない。
  const { rows: recalcRows, diffs: recalcDiffs } = React.useMemo(
    () => buildRecalcRows({
      snapshots, appoData, members, payMonth, orgSettings,
      orgId: getOrgId(), currentUser,
    }),
    [snapshots, appoData, members, payMonth, orgSettings, currentUser],
  );

  // 管理者以外の操作でアポが変わった月は、その場では再計算できない（確定値の書き込みは管理者のみのため）。
  // 管理者がこのページを開いた時点で差分が残っていれば自動で追いつかせる。
  const autoRecalcedRef = React.useRef(new Set());
  useEffect(() => {
    if (!isAdmin || !isConfirmed || snapshotLoading) return;
    if (recalcDiffs.length === 0) return;
    if (autoRecalcedRef.current.has(payMonth)) return;
    autoRecalcedRef.current.add(payMonth);
    (async () => {
      const count = recalcDiffs.length;
      const { error } = await upsertPayrollSnapshots(recalcRows);
      if (error) { autoRecalcedRef.current.delete(payMonth); return; }
      const { data: fresh } = await fetchPayrollSnapshots(payMonth);
      setSnapshots(fresh || []);
      setActionMsg(`${monthTab}をアポの最新状態にあわせて再計算しました（${count}名の金額を更新）`);
      setTimeout(() => setActionMsg(''), 8000);
    })();
  }, [isAdmin, isConfirmed, snapshotLoading, recalcDiffs, recalcRows, payMonth, monthTab]);

  const handleRecalc = async () => {
    if (!isAdmin || recalculating) return;
    if (recalcDiffs.length === 0) {
      setActionMsg(`${monthTab}は最新のアポデータと一致しています（変更なし）`);
      setTimeout(() => setActionMsg(''), 5000);
      return;
    }
    const lines = recalcDiffs.map(d => {
      const delta = d.afterTotal - d.beforeTotal;
      const sign = delta > 0 ? '+' : '−';
      return `・${d.name}${d.isNew ? '（新規）' : ''}: ¥${d.beforeTotal.toLocaleString()} → ¥${d.afterTotal.toLocaleString()}（${sign}¥${Math.abs(delta).toLocaleString()}）`;
    });
    const invoiceWarn = invoiceMemberIdSet.size > 0
      ? `\n\n※ ${monthTab}は請求書が${invoiceMemberIdSet.size}件格納済みです。金額が変わる方は請求書の出し直しが必要です。`
      : '';
    if (!window.confirm(
      `${monthTab}の報酬を最新のアポデータで再計算します。\n`
      + `チーム・役職・ランク・適用率は確定時のまま固定し、金額だけ更新します。\n\n`
      + `${lines.join('\n')}${invoiceWarn}\n\n実行しますか？`
    )) return;
    setRecalculating(true);
    setActionMsg('');
    try {
      const { error } = await upsertPayrollSnapshots(recalcRows);
      if (error) throw error;
      const { data: fresh } = await fetchPayrollSnapshots(payMonth);
      setSnapshots(fresh || []);
      setActionMsg(`${monthTab}を再計算しました（${recalcDiffs.length}名の金額を更新）`);
      setTimeout(() => setActionMsg(''), 8000);
    } catch (e) {
      setActionMsg('再計算に失敗しました: ' + (e.message || '不明'));
    } finally {
      setRecalculating(false);
    }
  };

  // 確定解除
  const handleUnconfirm = async () => {
    if (!isAdmin || unconfirming) return;
    if (!window.confirm(`${monthTab}の報酬確定を解除しますか？\nリアルタイム計算に戻ります。`)) return;
    setUnconfirming(true);
    setActionMsg('');
    try {
      const { error } = await deletePayrollSnapshots(payMonth);
      if (error) throw error;
      // 当月分の紹介フィー支払マークを解除（再計算でやり直し可能にする）
      await clearMembersReferralPaid(payMonth);
      if (onDataRefetch) setTimeout(onDataRefetch, 500);
      setSnapshots([]);
      setActionMsg(`${monthTab}の確定を解除しました`);
      setTimeout(() => setActionMsg(''), 4000);
    } catch (e) {
      setActionMsg('解除に失敗しました: ' + (e.message || '不明'));
    } finally {
      setUnconfirming(false);
    }
  };

  // 累計同期処理（管理者のみ）
  // ── メンバー個別調整（特別ボーナス・控除）──
  // 個人の給与明細ページでは④として加算しているが、一覧には出ていなかったため
  // 一覧の合計支給額と明細・請求書の金額が食い違っていた。一覧にも列として出す。
  const [adjTotals, setAdjTotals] = React.useState({});
  // Spartia AI の入金を登録すると調整行が増えるので、モーダルを閉じたら引き直す
  const [adjReloadKey, setAdjReloadKey] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    if (!payMonth) { setAdjTotals({}); return; }
    fetchMemberPayrollAdjustmentTotals(payMonth).then(({ data }) => {
      if (!cancelled) setAdjTotals(data || {});
    });
    return () => { cancelled = true; };
  }, [payMonth, adjReloadKey]);
  // 表示は名前キーで引くので member_id → 名前 に載せ替える
  const adjByName = React.useMemo(() => {
    const out = {};
    (members || []).forEach(m => {
      if (typeof m !== 'object' || !m.name) return;
      const key = m._supaId || m.id;
      if (key && adjTotals[key]) out[m.name] = adjTotals[key];
    });
    return out;
  }, [members, adjTotals]);

  // ── 累計売上のズレ検知 ──
  // cumulative_sales はステータス変更時に足し引きするカウンターなので、
  // 更新失敗や同時編集で実績とズレる。ズレたままだとランク（＝適用率）が
  // 正しく上がらないため、管理者に気づける形で常時警告する。
  const [salesAudit, setSalesAudit] = React.useState({ shortfalls: [], mismatches: [] });
  const [auditOpen, setAuditOpen] = React.useState(false);
  React.useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    Promise.all([fetchCumulativeSalesShortfalls(), fetchCumulativeFlagMismatches()])
      .then(([a, b]) => {
        if (cancelled) return;
        setSalesAudit({ shortfalls: a.data || [], mismatches: b.data || [] });
      });
    return () => { cancelled = true; };
  }, [isAdmin, appoData]);
  const hasAuditIssue = salesAudit.shortfalls.length > 0 || salesAudit.mismatches.length > 0;

  const uncountedCount = React.useMemo(() =>
    (appoData || []).filter(a => a.status === '面談済' && !a.isCounted).length,
    [appoData]
  );
  const handleSync = async () => {
    if (!isAdmin || syncing) return;
    const uncounted = (appoData || []).filter(a => a.status === '面談済' && !a.isCounted);
    if (!uncounted.length) {
      setSyncMsg('未加算のアポはありません');
      setTimeout(() => setSyncMsg(''), 3000);
      return;
    }
    setSyncing(true);
    setSyncMsg('');
    try {
      const memberMap = {};
      members.forEach(m => { if (typeof m === 'object' && m.name) memberMap[m.name] = m; });
      const deltas = {};
      // クライアント開拓リスト由来のアポは累計売上に加算しない（後で再加算しないようis_counted_in_cumulativeフラグだけ立てる）
      uncounted.forEach(a => {
        // 面談日が無いアポ・クライアント開拓由来は累計売上に加算しない（ランク判定に効くため）
        deltas[a.getter] = (deltas[a.getter] || 0) + salesAmountOf(a);
      });
      for (const [getterName, delta] of Object.entries(deltas)) {
        const member = memberMap[getterName];
        if (!member?._supaId || delta === 0) continue;
        const newTotal = Math.max(0, (member.totalSales || 0) + delta);
        const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal, orgSettings);
        await updateMemberReward(member._supaId, { cumulativeSales: newTotal, rank: newRank, incentiveRate: newRate });
        if (setMembers) {
          setMembers(prev => prev.map(m =>
            (typeof m !== 'string' && m._supaId === member._supaId)
              ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate }
              : m
          ));
        }
      }
      for (const a of uncounted) {
        if (a._supaId) await updateAppoCounted(a._supaId, true);
      }
      setSyncMsg(`${uncounted.length}件のアポを累計に加算しました`);
      if (onDataRefetch) setTimeout(onDataRefetch, 500);
      setTimeout(() => setSyncMsg(''), 5000);
    } catch (e) {
      setSyncMsg('同期に失敗しました: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = data
    .filter(p => teamFilter === "all" || p.team === teamFilter)
    .sort((a, b) => b[sortKey] - a[sortKey]);
  const teams = [...new Set(data.map(p => p.team))];
  const rawGrandTotal = data.reduce((s, p) => s + p.total + (activeReferralMap[p.name] || 0) + (adjByName[p.name] || 0), 0);
  const rawGrandSales = data.reduce((s, p) => s + p.sales, 0);
  const grandTotal = rawGrandTotal;
  const grandSales = rawGrandSales;
  const paidCount = data.filter(p => p.total > 0).length;
  const fmt = (v) => v > 0 ? "¥" + v.toLocaleString() : "-";

  // テーブルカラム定義: [header, sortKey, align]
  const COLS = [
    { h: "名前",           sk: null,         align: "left"   },
    { h: "チーム",         sk: null,         align: "left"   },
    { h: "ランク",         sk: null,         align: "left"   },
    { h: "率",             sk: null,         align: "right"  },
    { h: "今月売上",       sk: "sales",      align: "right"  },
    { h: "①インセンティブ",sk: "incentive",  align: "right"  },
    { h: "②役職ボーナス", sk: "teamBonus",  align: "right"  },
    { h: "③紹介",         sk: null,         align: "right"  },
    { h: "④調整",         sk: null,         align: "right"  },
    { h: "合計支給額",     sk: "total",      align: "right"  },
    { h: "請求書",         sk: null,         align: "center" },
  ];
  const cellPad = "8px 16px";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>

      <PageHeader
        title="報酬"
        description="月末に締めて、請求書を集め、翌月20日に確定、月末に振り込む"
        style={{ marginBottom: space[6] }}
      />

      {/* ── 上の段：月の流れ・数字4つ（2026-10-07 見本どおり） ── */}
      {(() => {
        const mo = payrollMonths.find(x => x.label === monthTab) || payrollMonths[payrollMonths.length - 1];
        const payees = data.filter(p => p.total + (activeReferralMap[p.name] || 0) + (adjByName[p.name] || 0) > 0);
        const submitted = payees.filter(p => invoiceMemberIdSet.has(memberIdByName[p.name])).length;
        const flow = payrollFlow({ year: mo.year, month: mo.month, today: todayIso, isConfirmed, submitted, payees: payees.length });
        return (
          <>
            <PayrollFlow monthLabel={monthTab} flow={flow} />
            <PayrollKpis total={grandTotal} sales={grandSales} payees={payees.length} submitted={submitted} />
          </>
        );
      })()}

      {/* ── Filters + 確定ボタン ──────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: space[3], alignItems: "center", flexWrap: "wrap" }}>
        {/* 月タブ（スマホでは横にスクロール。8か月分並ぶと画面幅を越える） */}
        <div className="spa-scroll-x" style={{ display: "flex", gap: 4, maxWidth: "100%", overflowX: "auto" }}>
          {payrollMonths.map(({ label }) => (
            <button key={label} onClick={() => setMonthTab(label)} style={{
              padding: "5px 14px", borderRadius: radius.md, fontSize: font.size.xs, fontWeight: font.weight.semibold, cursor: "pointer", fontFamily: font.family.sans,
              flexShrink: 0, whiteSpace: "nowrap",
              background: monthTab === label ? TH_BG : color.white,
              color: monthTab === label ? color.white : color.textMid,
              border: `1px solid ${monthTab === label ? TH_BG : GRAY_200}`,
            }}>{label}</button>
          ))}
        </div>

        {/* チームフィルター */}
        <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {["all", ...teams].map(t => (
            <button key={t} onClick={() => setTeamFilter(t)} style={{
              padding: "4px 10px", borderRadius: radius.md, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, cursor: "pointer", fontFamily: font.family.sans,
              background: teamFilter === t ? TH_BG : color.white,
              color: teamFilter === t ? color.white : color.textMid,
              border: `1px solid ${teamFilter === t ? TH_BG : GRAY_200}`,
            }}>{t === "all" ? "全チーム" : t + "チーム"}</button>
          ))}
        </div>
        <span style={{ marginLeft: 12 }}><PayLegend /></span>

        {/* 管理者アクション */}
        {isAdmin && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Spartia AI は入金の5%だけが報酬なので、入金の登録口をここに置く。
                登録すると「調整」列と請求書明細に自動で乗る */}
            <Button variant="outline" size="sm" onClick={() => setReceiptsOpen(true)} style={{ borderColor: TH_BG, color: TH_BG }}>
              Spartia AI 入金
            </Button>
            <Button variant="outline" size="sm" loading={downloadingZip} onClick={handleDownloadAllInvoices} style={{ borderColor: TH_BG, color: TH_BG }}>
              {downloadingZip ? '準備中...' : '請求書を一括DL'}
            </Button>
            {isConfirmed ? (
              <>
                <span style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.bold, color: color.success, borderLeft: `3px solid ${color.success}`, paddingLeft: 8 }}>
                  ✓ 確定済 {confirmedAt}
                  {recalculatedAt && <span style={{ display: 'block', color: color.textMid, fontWeight: font.weight.semibold }}>再計算 {recalculatedAt}</span>}
                </span>
                <Button variant="primary" size="sm" loading={recalculating} onClick={handleRecalc} style={{ background: TH_BG }}>
                  {recalculating ? '再計算中...' : `再計算${recalcDiffs.length > 0 ? `（${recalcDiffs.length}名）` : ''}`}
                </Button>
                <Button variant="secondary" size="sm" loading={unconfirming} onClick={handleUnconfirm} style={{ borderColor: TH_BG, color: TH_BG }}>
                  {unconfirming ? '解除中...' : '確定解除'}
                </Button>
              </>
            ) : (
              <>
                {uncountedCount > 0 && (
                  <span style={{ fontSize: font.size.xs - 1, color: color.textMid, fontWeight: font.weight.semibold }}>未加算: {uncountedCount}件</span>
                )}
                {hasAuditIssue && (
                  <Badge variant="warn" dot size="sm">累計売上にズレ</Badge>
                )}
                <Button variant="secondary" size="sm" loading={syncing} onClick={handleSync} style={{ borderColor: TH_BG, color: TH_BG }}>
                  {syncing ? '同期中...' : '累計同期'}
                </Button>
                <Button variant="primary" size="sm" loading={confirming || snapshotLoading} onClick={handleConfirm} style={{ background: TH_BG }}>
                  {confirming ? '確定中...' : '報酬確定'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* メッセージ */}
      {(syncMsg || actionMsg) && (() => {
        const msg = syncMsg || actionMsg;
        const isErr = msg.includes('失敗') || msg.includes('エラー');
        return (
          <div style={{ marginBottom: 10, padding: "8px 16px", borderRadius: radius.md, fontSize: font.size.xs, fontWeight: font.weight.semibold,
            borderLeft: `3px solid ${isErr ? color.danger : color.success}`,
            background: isErr ? "#fff5f5" : "#f0faf4",
            color: isErr ? color.danger : color.success }}>
            {msg}
          </div>
        );
      })()}

      {/* 未確定注記 */}
      {!isConfirmed && !snapshotLoading && (
        <div style={{ marginBottom: 8, fontSize: font.size.xs - 1, color: color.textLight }}>
          ※ 未確定（リアルタイム計算）。月末に「報酬確定」を押すとスナップショットとして保存されます。
        </div>
      )}

      {/* ── 累計売上のズレ警告 ────────────────────────────────── */}
      {isAdmin && hasAuditIssue && (
        <div className="pr-alert">
          <b>累計売上のずれ {salesAudit.shortfalls.length + salesAudit.mismatches.length}件</b>
          <span>{[...salesAudit.shortfalls.map(r => `${r.name}さんの累計が面談済アポより ¥${Number(r.diff || 0).toLocaleString()} 少ない`), ...salesAudit.mismatches.map(r => `${r.getter_name}さんの${r.status}分が累計に残っている`)].join(' ／ ')}。ずれたままだとランクが正しく上がらない</span>
          <Button size="sm" variant="ghost" onClick={() => setAuditOpen(v => !v)}>{auditOpen ? '閉じる' : '中身を見る'}</Button>
          {!isConfirmed && <Button size="sm" variant="secondary" loading={syncing} onClick={handleSync}>累計同期</Button>}
        </div>
      )}
      {isAdmin && hasAuditIssue && auditOpen && (
        <Card padding="md" style={{ marginBottom: space[4], borderColor: color.warn }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
            <Badge variant="warn" dot>要確認</Badge>
            <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>
              累計売上がアポ実績と一致していません
            </span>
          </div>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[3], lineHeight: 1.7 }}>
            累計売上はステータス変更のたびに足し引きするカウンターのため、更新失敗や同時編集でズレることがあります。
            ズレたままだとランク（＝インセンティブ適用率）が正しく上がりません。
          </div>

          {salesAudit.shortfalls.length > 0 && (
            <div style={{ marginBottom: space[3] }}>
              <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.textDark, marginBottom: 6 }}>
                加算漏れ（{salesAudit.shortfalls.length}名）— 面談済アポの合計より累計売上が少ない
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {salesAudit.shortfalls.map(r => (
                  <div key={r.member_id} style={{
                    display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
                    padding: '6px 10px', borderRadius: radius.md,
                    background: alpha(color.warn, 0.07), fontSize: font.size.xs,
                  }}>
                    <span style={{ fontWeight: font.weight.semibold, color: color.navy, minWidth: 110 }}>{r.name}</span>
                    <span style={{ color: color.textLight }}>現在</span>
                    <span style={{ fontFamily: MONO }}>¥{Number(r.recorded_sales || 0).toLocaleString()}</span>
                    <span style={{ color: color.textLight }}>→ 実績</span>
                    <span style={{ fontFamily: MONO, fontWeight: font.weight.bold, color: color.navy }}>
                      ¥{Number(r.expected_sales || 0).toLocaleString()}
                    </span>
                    <span style={{ fontFamily: MONO, color: color.danger, fontWeight: font.weight.bold }}>
                      （不足 ¥{Number(r.diff || 0).toLocaleString()}）
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {salesAudit.mismatches.length > 0 && (
            <div>
              <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.textDark, marginBottom: 6 }}>
                減算漏れの疑い（{salesAudit.mismatches.length}件）— 面談済から外れたのに累計加算済みのまま
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {salesAudit.mismatches.map(r => (
                  <div key={r.appointment_id} style={{
                    display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
                    padding: '6px 10px', borderRadius: radius.md,
                    background: alpha(color.warn, 0.07), fontSize: font.size.xs,
                  }}>
                    <span style={{ fontWeight: font.weight.semibold, color: color.navy, minWidth: 110 }}>{r.getter_name}</span>
                    <span>{r.company_name}</span>
                    <Badge variant="neutral" size="sm">{r.status}</Badge>
                    <span style={{ fontFamily: MONO }}>¥{Number(r.sales_amount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Table ────────────────────────────────────────────────── */}
      {/* ヘッダー文字列をクリックで sortKey を切替できるラベル */}
      {(() => {
        const labelOf = (col) => col.sk ? (
          <span
            onClick={(e) => { e.stopPropagation(); setSortKey(col.sk); }}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >{col.h}{sortKey === col.sk ? ' ▼' : ''}</span>
        ) : col.h;

        const partsOf = (p) => ({ incentive: p.incentive, teamBonus: p.teamBonus, referral: activeReferralMap[p.name] || 0, adjustment: adjByName[p.name] || 0 });
        const maxPay = Math.max(1, ...filtered.map(p => p.incentive + p.teamBonus + (activeReferralMap[p.name] || 0) + Math.max(0, adjByName[p.name] || 0)));
        const dataColumns = [
          {
            key: 'name', label: 'メンバー', width: PAYROLL_COLS[0].width, align: 'left',
            cellStyle: { padding: cellPad },
            render: (p) => (
              <div>
                <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: TH_BG }}>{p.name}</div>
                <div style={{ fontSize: font.size.xs - 1, color: color.textLight }}>{[p.team ? p.team + 'チーム' : '', p.role].filter(Boolean).join(' ・ ')}</div>
              </div>
            ),
          },
          {
            key: 'rank', label: 'ランク', width: PAYROLL_COLS[1].width, align: 'left',
            cellStyle: { padding: cellPad, whiteSpace: 'nowrap' },
            render: (p) => {
              const rs = RANK_COLORS[p.rank] || RANK_COLORS['トレーニー'];
              return (
                <span style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, padding: '1px 8px', borderRadius: radius.pill, background: alpha(rs.color, 0.1), color: rs.color }}>
                  {p.rank || '-'}{p.rate ? ` ${(p.rate * 100).toFixed(0)}%` : ''}
                </span>
              );
            },
          },
          {
            key: 'sales', label: labelOf(COLS[4]), width: PAYROLL_COLS[2].width, align: 'right',
            cellStyle: { padding: cellPad, fontSize: font.size.xs, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.semibold, color: TH_BG },
            render: (p) => fmt(p.sales),
          },
          {
            key: 'parts', label: '支給の内わけ', width: PAYROLL_COLS[3].width, align: 'left',
            cellStyle: { padding: cellPad },
            render: (p) => <PayBar parts={partsOf(p)} max={maxPay} />,
          },
          {
            key: 'total', label: labelOf(COLS[9]), width: PAYROLL_COLS[4].width, align: 'right',
            cellStyle: { padding: cellPad, fontSize: font.size.sm, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.black, color: TH_BG },
            render: (p) => fmt(p.total + (activeReferralMap[p.name] || 0) + (adjByName[p.name] || 0)),
          },
          {
            key: 'invoice', label: '請求書', width: PAYROLL_COLS[5].width, align: 'center',
            cellStyle: { padding: cellPad },
            render: (p) => {
              const mid = memberIdByName[p.name];
              return mid && invoiceMemberIdSet.has(mid)
                ? <Badge variant="success" dot>出した</Badge>
                : <span style={{ fontSize: font.size.xs - 1, color: color.danger }}>まだ</span>;
            },
          },
        ];

        // 合計値の事前計算
        const sumSales = filtered.reduce((s, p) => s + p.sales, 0);
        const sumIncentive = filtered.reduce((s, p) => s + p.incentive, 0);
        const sumTeamBonus = filtered.reduce((s, p) => s + p.teamBonus, 0);
        const sumReferral = filtered.reduce((s, p) => s + (activeReferralMap[p.name] || 0), 0);
        const sumAdjustment = filtered.reduce((s, p) => s + (adjByName[p.name] || 0), 0);
        const sumTotal = filtered.reduce((s, p) => s + p.total + (activeReferralMap[p.name] || 0) + (adjByName[p.name] || 0), 0);

        // 合計行の grid template (DataTable の fillWidth と同じ動きにする)
        const totalGrid = PAYROLL_COLS.map(c => `minmax(${c.width}px, ${c.width}fr)`).join(' ');
        const totalMinWidth = PAYROLL_COLS.reduce((s, c) => s + c.width, 0);

        return (
          <div>
            <DataTable
              ariaLabel="給与支給テーブル"
              height="auto"
              showCount={false}
              fillWidth
              loading={snapshotLoading}
              rows={filtered}
              rowKey={(_, i) => i}
              emptyMessage="該当データがありません"
              zebra={false}
              rowBackground={(_, i) => i % 2 === 0 ? color.white : GRAY_50}
              style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
              columns={dataColumns}
              onRowClick={(row) => {
                const m = (members || []).find(mm => typeof mm === 'object' && mm.name === row.name);
                if (m && onSelectMember) onSelectMember(m._supaId || m.id, monthTab);
              }}
            />

            {/* 合計行: DataTable の真下に同じ列幅で表示 */}
            {filtered.length > 0 && (
              <div style={{
                background: color.white,
                border: `1px solid ${GRAY_200}`,
                borderTop: `2px solid ${TH_BG}`,
                borderTopLeftRadius: 0, borderTopRightRadius: 0,
                borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg,
                overflowX: 'auto',
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: totalGrid, alignItems: 'center',
                  minWidth: totalMinWidth,
                }}>
                  <div style={{ padding: cellPad, fontSize: font.size.sm, fontWeight: font.weight.bold, color: TH_BG }}>合計 {filtered.length}名</div>
                  <div style={{ padding: cellPad }} />
                  <div style={{ padding: cellPad, fontSize: font.size.sm, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.bold, color: TH_BG, textAlign: 'right' }}>
                    {sumSales > 0 ? '¥' + sumSales.toLocaleString() : '-'}
                  </div>
                  <div style={{ padding: cellPad, fontSize: font.size.xs, color: color.textMid }}>
                    インセンティブ ¥{sumIncentive.toLocaleString()} ・ 役職 ¥{sumTeamBonus.toLocaleString()} ・ 紹介 ¥{sumReferral.toLocaleString()} ・ 調整 {sumAdjustment < 0 ? '-' : ''}¥{Math.abs(sumAdjustment).toLocaleString()}
                  </div>
                  <div style={{ padding: cellPad, fontSize: font.size.base, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.black, color: TH_BG, textAlign: 'right' }}>
                    {'¥' + sumTotal.toLocaleString()}
                  </div>
                  <div style={{ padding: cellPad }} />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <SpartiaReceiptsModal
        open={receiptsOpen}
        onClose={() => { setReceiptsOpen(false); setAdjReloadKey(k => k + 1); }}
      />
    </div>
  );
}
