import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
import DataTable from '../../ui/DataTable';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import {
  extractKeymanMaIntent, extractPrefecture, parseRevenueOku,
  extractRevenueFromReport, extractAddressFromReport,
} from '../../../utils/apppoReportParse';
import { useKeymanIntentsForClient } from '../../../hooks/useKeymanIntents';
import { PlayRecordingButton } from '../../common/RecordingPlayerProvider';
import { fetchDossiersByAppointmentIds, invokeGenerateCompanyDossier, subscribeDossierByAppointment } from '../../../lib/dossierApi';
import CompanyDossierPanel from './CompanyDossierPanel';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// 既存 4 グループ (positive/wait/negative/unknown) は維持。
// ラベルは engagement 別 (売却意向/買収意向/導入意向 等) を useKeymanIntents で動的取得。
// チャート/集計用の色トーンは旧仕様を維持。
const INTENT_COLOR_MAP = {
  positive: C.gold,
  wait:     C.navy,
  negative: C.navyLight,
  unknown:  C.textLight,
};

function bucketRevenue(oku) {
  if (oku == null) return '不明';
  if (oku < 1) return '〜1億';
  if (oku < 3) return '1〜3億';
  if (oku < 10) return '3〜10億';
  if (oku < 30) return '10〜30億';
  return '30億〜';
}

function formatOku(oku) {
  if (oku == null) return '—';
  if (oku < 0.01) return `${Math.round(oku * 10000).toLocaleString()}万円`;
  return `${oku.toFixed(oku < 1 ? 2 : 1)}億円`;
}

// ─── 期間生成 (CallResultsTab と同じロジック) ──────────
function pad2(n) { return String(n).padStart(2, '0'); }
function toIsoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function buildMonthlyPeriods() {
  const opts = [];
  const now = new Date();
  for (let i = -11; i <= 0; i++) {
    const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
    const mi = ((now.getMonth() + i) % 12 + 12) % 12;
    const from = new Date(y, mi, 1);
    const to = new Date(y, mi + 1, 1);
    opts.push({ key: toIsoDate(from), label: `${y}年${mi + 1}月`, from: from.toISOString(), to: to.toISOString() });
  }
  return opts.reverse();
}
function buildWeeklyPeriods() {
  const opts = [];
  const now = new Date();
  const day = now.getDay();
  const offsetToMon = (day === 0 ? -6 : 1 - day);
  const thisMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetToMon);
  for (let i = 0; i < 13; i++) {
    const from = new Date(thisMon); from.setDate(thisMon.getDate() - i * 7);
    const to = new Date(from); to.setDate(from.getDate() + 7);
    opts.push({
      key: toIsoDate(from),
      label: `${from.getFullYear()}/${from.getMonth() + 1}/${from.getDate()} 週`,
      from: from.toISOString(), to: to.toISOString(),
    });
  }
  return opts;
}

// canEditDossier=true は MASP メンバー権限あり（管理画面 or クライアントポータル代理ログイン中）。
// adminAccessToken は代理ログイン中の編集経路で使う admin の access_token。null なら supabase 直接書込。
export default function AppointmentsTab({ client, canEditDossier = false, adminAccessToken = null, filterEngagementId = null }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [extraByName, setExtraByName] = useState({});
  const [dossiersById, setDossiersById] = useState({});
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [kickingoffIds, setKickingoffIds] = useState(() => new Set());

  const [periodMode, setPeriodMode] = useState('total');
  const monthlyOpts = useMemo(buildMonthlyPeriods, []);
  const weeklyOpts = useMemo(buildWeeklyPeriods, []);
  const [monthlyKey, setMonthlyKey] = useState(monthlyOpts[0]?.key || '');
  const [weeklyKey, setWeeklyKey] = useState(weeklyOpts[0]?.key || '');
  const [dailyDate, setDailyDate] = useState(toIsoDate(new Date()));

  const periodRange = useMemo(() => {
    if (periodMode === 'total') return { from: null, to: null, label: 'トータル' };
    if (periodMode === 'monthly') {
      const o = monthlyOpts.find(x => x.key === monthlyKey) || monthlyOpts[0];
      return { from: o.from, to: o.to, label: o.label };
    }
    if (periodMode === 'weekly') {
      const o = weeklyOpts.find(x => x.key === weeklyKey) || weeklyOpts[0];
      return { from: o.from, to: o.to, label: o.label };
    }
    const d = new Date(dailyDate);
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const to = new Date(from); to.setDate(from.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString(), label: dailyDate };
  }, [periodMode, monthlyKey, weeklyKey, dailyDate, monthlyOpts, weeklyOpts]);

  const orgId = getOrgId();

  // engagement 別キーマン意向ラベル
  const { options: intentOptions } = useKeymanIntentsForClient(client?.id);
  // タイトルに「意向」軸を表示するため最初の選択肢ラベルから軸名を抽出
  // (例: '売却意向: 高い' → '売却意向'。「:」が無い fallback ラベル時は「キーマン意向」)
  const intentAxisName = (() => {
    const first = intentOptions[0]?.label || '';
    if (first.includes(':')) return first.split(':')[0].trim();
    if (first.includes('：')) return first.split('：')[0].trim();
    return 'キーマン意向';
  })();

  useEffect(() => {
    if (!orgId || !client?.id) { setRows([]); setExtraByName({}); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('appointments')
        .select(`
          id, company_name, meeting_date, status, cancel_reason, keyman_ma_intent, sales_amount, appo_report, recording_url, engagement_id,
          item:call_list_items(id, company, address, revenue, business)
        `)
        .eq('org_id', orgId)
        .eq('client_id', client.id);
      // 兼業クライアントで engagement サブタブが選択されている場合のみフィルタ
      if (filterEngagementId) q = q.eq('engagement_id', filterEngagementId);
      // 期間フィルタ: 獲得日 (created_at) ベース。架電結果の集計と揃える。
      if (periodRange.from) q = q.gte('created_at', periodRange.from);
      if (periodRange.to)   q = q.lt('created_at', periodRange.to);
      const { data } = await q;
      if (cancelled) return;
      setRows(data || []);

      // fallback: item_id の join で address/revenue が取れなかった企業を列挙
      const missingNames = [...new Set(
        (data || [])
          .filter(r => !r.item?.address || !r.item?.revenue)
          .map(r => r.company_name)
          .filter(Boolean)
      )];
      if (missingNames.length === 0) { setExtraByName({}); setLoading(false); return; }

      // fallback A: call_list_items の別行 (アーカイブ済リストも含む) で同名企業
      // fallback B: company_master (全社共通 national DB、org_id カラム無し) で同名企業
      const [cliRes, cmRes] = await Promise.all([
        supabase.from('call_list_items')
          .select('company, address, revenue')
          .eq('org_id', orgId)
          .in('company', missingNames),
        supabase.from('company_master')
          .select('company_name, address, full_address, revenue_k')
          .in('company_name', missingNames),
      ]);
      if (cancelled) return;
      const acc = {};
      // company_master 優先度は低め (A があれば A)
      (cmRes.data || []).forEach(c => {
        if (!acc[c.company_name]) acc[c.company_name] = {};
        const addr = c.full_address || c.address;
        if (!acc[c.company_name].address && addr) acc[c.company_name].address = addr;
        if (!acc[c.company_name].revenue && c.revenue_k) acc[c.company_name].revenue = String(c.revenue_k);
      });
      (cliRes.data || []).forEach(c => {
        if (!acc[c.company]) acc[c.company] = {};
        if (c.address) acc[c.company].address = c.address;
        if (c.revenue) acc[c.company].revenue = c.revenue;
      });
      setExtraByName(acc);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, client?.id, periodRange.from, periodRange.to, filterEngagementId]);

  // appointments 取得後にドシエも一括取得（RLS で見える範囲のみ）
  useEffect(() => {
    if (!rows || rows.length === 0) { setDossiersById({}); return; }
    let cancelled = false;
    const ids = rows.map(r => r.id).filter(Boolean);
    fetchDossiersByAppointmentIds(ids).then(({ data }) => {
      if (!cancelled) setDossiersById(data || {});
    });
    return () => { cancelled = true; };
  }, [rows]);

  // 各アポのドシエ状態変化を Realtime で購読（ボタン「生成中…」→「再生成」の即時反映）
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const unsubs = rows.map(r => r.id).filter(Boolean).map(id =>
      subscribeDossierByAppointment(id, (next) => {
        setDossiersById(prev => ({ ...prev, [next.appointment_id]: { ...(prev[next.appointment_id] || {}), ...next } }));
      })
    );
    return () => { unsubs.forEach(u => { try { u(); } catch (_) { /* noop */ } }); };
  }, [rows]);

  const toggleExpand = (key) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // 「企業ドシェ作成」ボタン押下 → Edge Function キック + ローカル状態を running に即時反映
  const handleKickoffDossier = async (row) => {
    if (!row?.id || kickingoffIds.has(row.id)) return;
    setKickingoffIds(prev => { const n = new Set(prev); n.add(row.id); return n; });
    // 楽観更新: 即 running 状態を見せる（Realtime 反映までの空白を埋める）
    setDossiersById(prev => ({
      ...prev,
      [row.id]: { ...(prev[row.id] || {}), appointment_id: row.id, generation_status: 'running' },
    }));
    try {
      await invokeGenerateCompanyDossier({ appointment_id: row.id, org_id: orgId });
    } catch (e) {
      console.warn('[AppointmentsTab] dossier kickoff failed:', e);
    } finally {
      // ボタン disable 解除は数秒後（Realtime で running→succeeded を拾うまでの繋ぎ）
      setTimeout(() => {
        setKickingoffIds(prev => { const n = new Set(prev); n.delete(row.id); return n; });
      }, 2000);
    }
  };

  const enriched = useMemo(() => {
    const mapped = (rows || []).map(r => {
      const fallback = extraByName[r.company_name] || {};
      // 住所 優先度: item → 同名リスト行 → company_master → appo_report
      const address = r.item?.address || fallback.address || extractAddressFromReport(r.appo_report);
      // 売上 同様
      const revenueText = r.item?.revenue || fallback.revenue || null;
      const revenue_oku = parseRevenueOku(revenueText) ?? extractRevenueFromReport(r.appo_report);
      // 未入力 & 推定できずは 不明 に集約
      const intent = r.keyman_ma_intent || extractKeymanMaIntent(r.appo_report) || 'unknown';
      return {
        ...r,
        address,
        prefecture: extractPrefecture(address),
        revenue_oku,
        revenue_text: revenue_oku != null ? formatOku(revenue_oku) : (revenueText || null),
        resolved_intent: intent,
        intent_is_derived: !r.keyman_ma_intent && intent !== 'unknown' ? !!extractKeymanMaIntent(r.appo_report) : false,
      };
    });
    // ソート: ステータス優先度 → 面談日 昇順
    //   1. 事前確認済（面談直前）→ 2. アポ取得 → 3. リスケ中 → 4. 面談済 → 5. キャンセル
    //   各グループ内は meeting_date 昇順（日付の若いもの＝直近予定が上）
    const STATUS_ORDER = {
      '事前確認済': 1,
      'アポ取得':   2,
      'リスケ中':   3,
      '面談済':     4,
      'キャンセル': 5,
    };
    return mapped.sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      const ta = a.meeting_date ? new Date(a.meeting_date).getTime() : Infinity;
      const tb = b.meeting_date ? new Date(b.meeting_date).getTime() : Infinity;
      return ta - tb;  // 昇順（早い日付＝若い日付が上）
    });
  }, [rows, extraByName]);

  const handleIntentChange = async (id, value) => {
    setUpdating(id);
    const { error } = await supabase.from('appointments')
      .update({ keyman_ma_intent: value || null })
      .eq('id', id);
    if (!error) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, keyman_ma_intent: value || null } : r));
    }
    setUpdating(null);
  };

  const stats = useMemo(() => {
    const total = enriched.length;
    const canceled = enriched.filter(r => r.status === 'キャンセル').length;
    const rescheduled = enriched.filter(r => r.status === 'リスケ中').length;
    const intentCount = { positive: 0, wait: 0, unknown: 0, negative: 0 };
    enriched.forEach(r => { intentCount[r.resolved_intent] = (intentCount[r.resolved_intent] || 0) + 1; });
    const prefCount = {};
    enriched.forEach(r => { prefCount[r.prefecture] = (prefCount[r.prefecture] || 0) + 1; });
    const revCount = {};
    enriched.forEach(r => { const b = bucketRevenue(r.revenue_oku); revCount[b] = (revCount[b] || 0) + 1; });
    return { total, canceled, rescheduled, intentCount, prefCount, revCount };
  }, [enriched]);

  if (!client) return <EmptyCard>クライアントを選択してください</EmptyCard>;

  const intentChartData = intentOptions.map(o => ({
    name: o.short_label || o.label,
    value: stats.intentCount[o.value] || 0,
    color: INTENT_COLOR_MAP[o.value] || C.textLight,
  }))
    .filter(d => d.value > 0);
  const prefChartData = Object.entries(stats.prefCount).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const revChartData = ['〜1億','1〜3億','3〜10億','10〜30億','30億〜','不明']
    .map(name => ({ name, value: stats.revCount[name] || 0 }))
    .filter(d => d.value > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* 期間セレクタ */}
      <Card padding="none" style={{ padding: `${space[2]}px ${space[4]}px`, display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size.sm, color: color.textMid, fontWeight: font.weight.semibold, marginRight: space[1] }}>期間</span>
        <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center' }}>
          {[
            { id: 'total',   label: 'トータル' },
            { id: 'monthly', label: '月次' },
            { id: 'weekly',  label: '週次' },
            { id: 'daily',   label: '日次' },
          ].map(p => {
            const active = periodMode === p.id;
            return (
              <Button
                key={p.id}
                size="sm"
                variant={active ? 'primary' : 'secondary'}
                onClick={() => setPeriodMode(p.id)}
              >{p.label}</Button>
            );
          })}
        </div>
        {periodMode === 'monthly' && (
          <Select
            size="sm"
            fullWidth={false}
            value={monthlyKey}
            onChange={e => setMonthlyKey(e.target.value)}
            options={monthlyOpts.map(o => ({ value: o.key, label: o.label }))}
            style={{ minWidth: 140 }}
          />
        )}
        {periodMode === 'weekly' && (
          <Select
            size="sm"
            fullWidth={false}
            value={weeklyKey}
            onChange={e => setWeeklyKey(e.target.value)}
            options={weeklyOpts.map(o => ({ value: o.key, label: o.label }))}
            style={{ minWidth: 160 }}
          />
        )}
        {periodMode === 'daily' && (
          <Input
            size="sm"
            fullWidth={false}
            type="date"
            value={dailyDate}
            onChange={e => setDailyDate(e.target.value)}
          />
        )}
        <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: 'auto', paddingLeft: space[2] }}>
          表示中: {periodRange.label}（獲得日ベース）
        </span>
      </Card>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: color.textMid }}>読み込み中...</div>
      ) : enriched.length === 0 ? (
        <EmptyCard>
          {periodMode === 'total'
            ? 'このクライアントへのアポイントがありません'
            : 'この期間に該当するアポイントがありません'}
        </EmptyCard>
      ) : (<>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <SummaryCard label="アポ数" value={stats.total} />
        <SummaryCard label="キャンセル" value={`${stats.canceled} (${stats.total > 0 ? ((stats.canceled / stats.total) * 100).toFixed(1) : 0}%)`} />
        <SummaryCard label="リスケ中" value={stats.rescheduled} />
        <SummaryCard label={`${intentAxisName} 高`} value={stats.intentCount.positive || 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <SectionCard title={`キーマンの${intentAxisName}`}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <PieChart margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <Pie
                  data={intentChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={52}
                  labelLine={{ stroke: color.textLight, strokeWidth: 1 }}
                  label={({ value }) => value}
                  isAnimationActive={false}
                >
                  {intentChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="エリア分布 (都道府県)">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={prefChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={color.border} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: color.textMid }} />
                <YAxis tick={{ fontSize: 10, fill: color.textMid }} />
                <Tooltip />
                <Bar dataKey="value" fill={color.navy} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="売上高分布 (億円)">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={revChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={color.border} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: color.textMid }} />
                <YAxis tick={{ fontSize: 10, fill: color.textMid }} />
                <Tooltip />
                <Bar dataKey="value" fill={color.navy} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="アポ一覧">
        <DataTable
          columns={[
            { key: 'company_name', label: '企業名', width: 240, align: 'left',
              cellStyle: { fontWeight: font.weight.medium, color: color.navy, whiteSpace: 'normal' },
              render: r => {
                const isOpen = expandedIds.has(r.id);
                return (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={(e) => { e.stopPropagation(); toggleExpand(r.id); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); e.stopPropagation(); toggleExpand(r.id);
                      }
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      cursor: 'pointer', color: color.navy,
                      borderBottom: '1px dashed ' + alpha(color.navy, 0.35),
                      paddingBottom: 1,
                    }}
                  >
                    <span style={{
                      fontSize: 9, color: color.textMid,
                      transition: 'transform 0.15s ease',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      display: 'inline-block', width: 8,
                    }}>▶</span>
                    {r.company_name || '—'}
                  </span>
                );
              } },
            { key: 'business', label: '業種', width: 240, align: 'left',
              cellStyle: { color: color.textMid, whiteSpace: 'normal' },
              render: r => r.item?.business || '—' },
            { key: 'revenue_text', label: '売上高', width: 110, align: 'right',
              render: r => r.revenue_text || '—' },
            { key: 'prefecture', label: 'エリア', width: 100, align: 'center',
              render: r => r.prefecture },
            { key: 'meeting_date', label: '面談日', width: 110, align: 'right',
              render: r => r.meeting_date ? String(r.meeting_date).slice(0, 10) : '—' },
            { key: 'status', label: '状態', width: 110, align: 'center',
              render: r => {
                const variant = r.status === 'キャンセル' ? 'danger' : r.status === 'リスケ中' ? 'warn' : r.status === '面談済' ? 'success' : 'primary';
                return r.status ? <Badge variant={variant} dot size="sm">{r.status}</Badge> : '—';
              } },
            { key: 'intent', label: `キーマンの${intentAxisName}`, width: 170, align: 'center',
              cellStyle: { overflow: 'visible', whiteSpace: 'nowrap' },
              render: r => (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                     onClick={e => e.stopPropagation()}>
                  <Select
                    size="sm"
                    fullWidth={false}
                    value={r.keyman_ma_intent || r.resolved_intent || ''}
                    disabled={updating === r.id}
                    onChange={e => handleIntentChange(r.id, e.target.value)}
                    options={[
                      { value: '', label: '—' },
                      ...intentOptions.map(o => ({ value: o.value, label: o.label })),
                    ]}
                  />
                </div>
              ) },
            { key: 'recording', label: '録音', width: 110, align: 'center',
              cellStyle: { padding: '8px 12px' },
              render: r => r.recording_url ? (
                <span onClick={e => e.stopPropagation()}>
                  <PlayRecordingButton
                    url={r.recording_url}
                    title={r.company_name || 'アポ録音'}
                    subtitle={r.meeting_date ? `面談日 ${String(r.meeting_date).slice(0, 10)}` : ''}
                  />
                </span>
              ) : <span style={{ fontSize: 10, color: color.textLight }}>—</span> },
            ...(canEditDossier ? [{
              key: 'dossier', label: '企業情報', width: 120, align: 'center',
              cellStyle: { overflow: 'visible' },
              render: r => {
                const d = dossiersById[r.id];
                const status = d?.generation_status;
                // queued は「未生成」相当でボタン押下可能（手動で running に上書きする想定）。
                // running のみが「実行中」で disable 対象。
                const isRunning = status === 'running';
                const isKicking = kickingoffIds.has(r.id);
                // 「成果物が存在する」とみなすのは succeeded / partial / failed のみ。
                // queued は触ったことがある（過去にキックした）だけで成果物無し → 「ドシェ作成」のままが自然。
                const hasResult = status === 'succeeded' || status === 'partial' || status === 'failed';
                const label = isRunning ? '生成中…' : hasResult ? '作成済み' : '作成';
                return (
                  <span onClick={e => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant={hasResult ? 'outline' : 'primary'}
                      disabled={isRunning || isKicking}
                      loading={isKicking}
                      onClick={() => handleKickoffDossier(r)}
                    >{label}</Button>
                  </span>
                );
              },
            }] : []),
          ]}
          rows={enriched}
          rowKey="id"
          loading={loading}
          emptyMessage="該当するアポイントがありません"
          height="auto"
          rowAccent={r => r.status === 'キャンセル' ? 'danger' : r.status === 'リスケ中' ? 'warn' : null}
          expandedKeys={expandedIds}
          renderExpanded={r => (
            <CompanyDossierPanel
              appointment={r}
              initialDossier={dossiersById[r.id] || null}
              canEditDossier={canEditDossier}
              adminAccessToken={adminAccessToken}
              engagementId={r.engagement_id || client?.engagement_id || null}
            />
          )}
        />
      </SectionCard>
      </>)}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <Card padding="none" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: color.textLight, letterSpacing: font.letterSpacing.wider, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: font.size.xl - 2, fontWeight: font.weight.semibold, color: color.navy, fontFamily: font.family.mono }}>{value}</div>
    </Card>
  );
}
function SectionCard({ title, children }) {
  return (
    <Card padding="none" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 10 }}>{title}</div>
      {children}
    </Card>
  );
}
function EmptyCard({ children }) {
  return (
    <Card padding="none" style={{ padding: '40px 12px', textAlign: 'center', color: color.textLight }}>
      {children}
    </Card>
  );
}

const th = { padding: '10px 12px', fontWeight: font.weight.semibold, color: color.navy, fontSize: font.size.xs, letterSpacing: font.letterSpacing.wide, textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: font.size.sm, color: color.textDark, textAlign: 'center', whiteSpace: 'nowrap' };
