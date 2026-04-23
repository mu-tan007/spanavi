import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
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
  const { ceoConnectLabels } = useCallStatuses();
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
      const ceoLabels = Array.from(ceoConnectLabels || []);
      const [sumRes, dayRes] = await Promise.all([
        supabase.rpc('sourcing_call_result_by_list', {
          p_client_id: client.id, p_org_id: orgId, p_ceo_labels: ceoLabels,
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
  }, [orgId, client?.id, ceoConnectLabels, periodRange.from, periodRange.to]);

  const totals = useMemo(() => rows.reduce((a, s) => ({
    calls:       a.calls       + Number(s.calls || 0),
    ceoConnects: a.ceoConnects + Number(s.ceo_connects || 0),
    appos:       a.appos       + Number(s.appos || 0),
  }), { calls: 0, ceoConnects: 0, appos: 0 }), [rows]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 期間セレクタ */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600 }}>期間:</span>
        {[
          { id: 'total',   label: 'トータル' },
          { id: 'monthly', label: '月次' },
          { id: 'weekly',  label: '週次' },
          { id: 'daily',   label: '日次' },
        ].map(p => {
          const active = periodMode === p.id;
          return (
            <button key={p.id} onClick={() => setPeriodMode(p.id)}
              style={{
                padding: '5px 12px', fontSize: 11,
                background: active ? C.navy : C.white, color: active ? C.white : C.textMid,
                border: `1px solid ${active ? C.navy : C.border}`,
                borderRadius: 4, cursor: 'pointer', fontWeight: active ? 600 : 400,
              }}
            >{p.label}</button>
          );
        })}
        {periodMode === 'monthly' && (
          <select value={monthlyKey} onChange={e => setMonthlyKey(e.target.value)}
            style={{ padding: '5px 10px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4, minWidth: 140 }}>
            {monthlyOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        )}
        {periodMode === 'weekly' && (
          <select value={weeklyKey} onChange={e => setWeeklyKey(e.target.value)}
            style={{ padding: '5px 10px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4, minWidth: 160 }}>
            {weeklyOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        )}
        {periodMode === 'daily' && (
          <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
            style={{ padding: '5px 10px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4 }} />
        )}
        <span style={{ fontSize: 10, color: C.textLight, marginLeft: 'auto' }}>
          表示中: {periodRange.label}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>
      ) : rows.length === 0 ? (
        <EmptyCard>
          {periodMode === 'total'
            ? 'このクライアントに紐付くリストがありません'
            : 'この期間に該当するデータがありません'}
        </EmptyCard>
      ) : (<>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <SummaryCard label="総架電件数" value={totals.calls.toLocaleString()} />
        <SummaryCard label="社長接続数" value={totals.ceoConnects.toLocaleString()} />
        <SummaryCard label="社長接続率" value={ratePct(totals.ceoConnects, totals.calls)} />
        <SummaryCard label="アポ獲得数 / 獲得率" value={`${totals.appos.toLocaleString()} / ${rate2Pct(totals.appos, totals.calls)}`} />
      </div>

      <Card title="リスト別 架電結果">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.cream, borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...th, textAlign: 'left' }}>業種</th>
              <th style={th}>架電件数</th>
              <th style={th}>社長接続数</th>
              <th style={th}>社長接続率</th>
              <th style={th}>アポ獲得数</th>
              <th style={th}>アポ獲得率</th>
              <th style={th}>詳細</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const calls = Number(s.calls || 0);
              const ceo = Number(s.ceo_connects || 0);
              const appos = Number(s.appos || 0);
              return (
                <tr key={s.list_id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  <td style={{ ...td, textAlign: 'left', color: C.textMid }}>{s.industry || '—'}</td>
                  <td style={td}>{calls.toLocaleString()}</td>
                  <td style={td}>{ceo.toLocaleString()}</td>
                  <td style={td}>{ratePct(ceo, calls)}</td>
                  <td style={td}>{appos.toLocaleString()}</td>
                  <td style={td}>{rate2Pct(appos, calls)}</td>
                  <td style={td}>
                    <button
                      onClick={() => setDetailList({ list_id: s.list_id, list_name: s.industry || '(名称未設定)' })}
                      style={{
                        fontSize: 10, padding: '3px 10px', border: `1px solid ${C.border}`,
                        background: C.white, color: C.navy, borderRadius: 3, cursor: 'pointer',
                      }}
                    >▶ 開く</button>
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: C.cream, borderTop: `2px solid ${C.navy}`, fontWeight: 600 }}>
              <td style={{ ...td, textAlign: 'left', color: C.navy, fontWeight: 700 }}>合計</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{totals.calls.toLocaleString()}</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{totals.ceoConnects.toLocaleString()}</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{ratePct(totals.ceoConnects, totals.calls)}</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{totals.appos.toLocaleString()}</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{rate2Pct(totals.appos, totals.calls)}</td>
              <td style={td}></td>
            </tr>
          </tbody>
        </table>
      </Card>

      {byDay.length > 0 && (
        <Card title="日別 架電件数">
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.textMid }} />
                <YAxis tick={{ fontSize: 10, fill: C.textMid }} />
                <Tooltip />
                <Bar dataKey="calls" fill={C.navy} name="架電件数" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      </>)}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.navy, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '12px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function EmptyCard({ children }) {
  return (
    <div style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight, background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
      {children}
    </div>
  );
}

const th = { padding: '10px 12px', fontWeight: 600, color: C.navy, fontSize: 11, letterSpacing: '0.04em', textAlign: 'center' };
const td = { padding: '8px 12px', fontSize: 12, color: C.textDark, textAlign: 'center', fontFamily: "'JetBrains Mono',monospace" };
