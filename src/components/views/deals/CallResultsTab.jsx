import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { useCallStatuses } from '../../../hooks/useCallStatuses';
import ListApproachPage from './ListApproachPage';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ─── 期間生成ユーティリティ ──────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }
function toIsoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// 月次プリセット: 直近6ヶ月 + 過去6ヶ月
function buildMonthlyPeriods() {
  const opts = [];
  const now = new Date();
  for (let i = -11; i <= 0; i++) {
    const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
    const mi = ((now.getMonth() + i) % 12 + 12) % 12;
    const from = new Date(y, mi, 1);
    const to = new Date(y, mi + 1, 1); // 翌月 1 日 (exclusive)
    opts.push({
      key: toIsoDate(from),
      label: `${y}年${mi + 1}月`,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }
  return opts.reverse(); // 新しい月を先頭に
}

// 週次プリセット: 直近 13 週 (月曜始まり)
function buildWeeklyPeriods() {
  const opts = [];
  const now = new Date();
  // 今週の月曜 0:00
  const day = now.getDay(); // 0=日曜
  const offsetToMon = (day === 0 ? -6 : 1 - day);
  const thisMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetToMon);
  for (let i = 0; i < 13; i++) {
    const from = new Date(thisMon);
    from.setDate(thisMon.getDate() - i * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 7);
    opts.push({
      key: toIsoDate(from),
      label: `${from.getFullYear()}/${from.getMonth() + 1}/${from.getDate()} 週`,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }
  return opts;
}

// クライアント選択時のリスト別 架電結果サマリ + 時系列
// DB 側で期間絞り込みと集計。
export default function CallResultsTab({ client }) {
  const { keymanConnectLabels } = useCallStatuses();
  const [rows, setRows] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailList, setDetailList] = useState(null);

  // 期間モード
  const [periodMode, setPeriodMode] = useState('total'); // 'total'|'monthly'|'weekly'|'daily'
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
    // daily
    const d = new Date(dailyDate);
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const to = new Date(from); to.setDate(from.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString(), label: dailyDate };
  }, [periodMode, monthlyKey, weeklyKey, dailyDate, monthlyOpts, weeklyOpts]);

  const orgId = getOrgId();

  useEffect(() => {
    if (!orgId || !client?.id) { setRows([]); setByDay([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const keymanLabels = Array.from(keymanConnectLabels || []);
      const [sumRes, dayRes] = await Promise.all([
        supabase.rpc('sourcing_call_result_by_list', {
          p_client_id: client.id, p_org_id: orgId, p_keyman_labels: keymanLabels,
          p_from: periodRange.from, p_to: periodRange.to,
        }),
        supabase.rpc('sourcing_call_daily', {
          p_client_id: client.id, p_org_id: orgId,
          p_from: periodRange.from, p_to: periodRange.to,
        }),
      ]);
      if (cancelled) return;
      setRows(sumRes.data || []);
      setByDay(dayRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, client?.id, keymanConnectLabels, periodRange.from, periodRange.to]);

  const totals = useMemo(() => rows.reduce((a, s) => ({
    calls:           a.calls           + Number(s.calls || 0),
    keymanConnects:  a.keymanConnects  + Number(s.keyman_connects || 0),
    appos:           a.appos           + Number(s.appos || 0),
  }), { calls: 0, keymanConnects: 0, appos: 0 }), [rows]);

  // 詳細ページ: 全フック宣言後に描画切替
  if (detailList) {
    return (
      <ListApproachPage
        list={detailList}
        orgId={orgId}
        onBack={() => setDetailList(null)}
      />
    );
  }

  if (!client) return <EmptyCard>クライアントを選択してください</EmptyCard>;

  const ratePct = (num, den) => den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';
  const rate2Pct = (num, den) => den > 0 ? `${((num / den) * 100).toFixed(2)}%` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* 期間セレクタ */}
      <Card padding="none" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>期間:</span>
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
        <span style={{ fontSize: 10, color: color.textLight, marginLeft: 'auto' }}>
          表示中: {periodRange.label}
        </span>
      </Card>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: color.textMid }}>読み込み中...</div>
      ) : rows.length === 0 ? (
        <EmptyCard>
          {periodMode === 'total'
            ? 'このクライアントに紐付くリストがありません'
            : 'この期間に該当するデータがありません'}
        </EmptyCard>
      ) : (<>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <SummaryCard label="総架電件数" value={totals.calls.toLocaleString()} />
        <SummaryCard label="キーマン接続数" value={totals.keymanConnects.toLocaleString()} />
        <SummaryCard label="キーマン接続率" value={ratePct(totals.keymanConnects, totals.calls)} />
        <SummaryCard label="アポ獲得数 / 獲得率" value={`${totals.appos.toLocaleString()} / ${rate2Pct(totals.appos, totals.calls)}`} />
      </div>

      <SectionCard title="リスト別 架電結果">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
          <thead>
            <tr style={{ background: color.cream, borderBottom: `1px solid ${color.border}` }}>
              <th style={{ ...th, textAlign: 'left' }}>業種</th>
              <th style={th}>架電件数</th>
              <th style={th}>キーマン接続数</th>
              <th style={th}>キーマン接続率</th>
              <th style={th}>アポ獲得数</th>
              <th style={th}>アポ獲得率</th>
              <th style={th}>詳細</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const calls = Number(s.calls || 0);
              const keyman = Number(s.keyman_connects || 0);
              const appos = Number(s.appos || 0);
              const archived = !!s.is_archived;
              return (
                <tr key={s.list_id} style={{
                  borderBottom: `1px solid ${color.borderLight}`,
                  background: archived ? color.cream : 'transparent',
                  color: archived ? color.textMid : undefined,
                }}>
                  <td style={{ ...td, textAlign: 'left', color: archived ? color.textLight : color.textMid }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {s.industry || '—'}
                      {archived && <Badge variant="neutral" size="sm">ARCHIVED</Badge>}
                    </span>
                  </td>
                  <td style={td}>{calls.toLocaleString()}</td>
                  <td style={td}>{keyman.toLocaleString()}</td>
                  <td style={td}>{ratePct(keyman, calls)}</td>
                  <td style={td}>{appos.toLocaleString()}</td>
                  <td style={td}>{rate2Pct(appos, calls)}</td>
                  <td style={td}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailList({ list_id: s.list_id, list_name: s.industry || '(名称未設定)' })}
                    >▶ 開く</Button>
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: color.cream, borderTop: `2px solid ${color.navy}`, fontWeight: font.weight.semibold }}>
              <td style={{ ...td, textAlign: 'left', color: color.navy, fontWeight: font.weight.bold }}>合計</td>
              <td style={{ ...td, color: color.navy, fontWeight: font.weight.bold }}>{totals.calls.toLocaleString()}</td>
              <td style={{ ...td, color: color.navy, fontWeight: font.weight.bold }}>{totals.keymanConnects.toLocaleString()}</td>
              <td style={{ ...td, color: color.navy, fontWeight: font.weight.bold }}>{ratePct(totals.keymanConnects, totals.calls)}</td>
              <td style={{ ...td, color: color.navy, fontWeight: font.weight.bold }}>{totals.appos.toLocaleString()}</td>
              <td style={{ ...td, color: color.navy, fontWeight: font.weight.bold }}>{rate2Pct(totals.appos, totals.calls)}</td>
              <td style={td}></td>
            </tr>
          </tbody>
        </table>
      </SectionCard>

      {byDay.length > 0 && (
        <SectionCard title="日別 架電件数">
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke={color.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: color.textMid }} />
                <YAxis tick={{ fontSize: 10, fill: color.textMid }} />
                <Tooltip />
                <Bar dataKey="calls" fill={color.navy} name="架電件数" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}
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

const th = { padding: '10px 12px', fontWeight: font.weight.semibold, color: color.navy, fontSize: font.size.xs, letterSpacing: font.letterSpacing.wide, textAlign: 'center' };
const td = { padding: '8px 12px', fontSize: font.size.sm, color: color.textDark, textAlign: 'center', fontFamily: font.family.mono };
