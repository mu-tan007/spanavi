import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { useCallStatuses } from '../../../hooks/useCallStatuses';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// クライアント選択時のリスト別 架電結果サマリ + 時系列
// DB の集計は RPC 経由なので 1000件上限に影響されない。
export default function CallResultsTab({ client }) {
  const { ceoConnectLabels } = useCallStatuses();
  const [rows, setRows] = useState([]);    // [{list_id, list_name, industry, calls, ceo_connects, appos}]
  const [byDay, setByDay] = useState([]);  // [{date, calls}]
  const [loading, setLoading] = useState(false);
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
        }),
        supabase.rpc('sourcing_call_daily', {
          p_client_id: client.id, p_org_id: orgId,
        }),
      ]);
      if (cancelled) return;
      setRows(sumRes.data || []);
      setByDay(dayRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, client?.id, ceoConnectLabels]);

  const totals = useMemo(() => rows.reduce((a, s) => ({
    calls:       a.calls       + Number(s.calls || 0),
    ceoConnects: a.ceoConnects + Number(s.ceo_connects || 0),
    appos:       a.appos       + Number(s.appos || 0),
  }), { calls: 0, ceoConnects: 0, appos: 0 }), [rows]);

  if (!client) return <EmptyCard>クライアントを選択してください</EmptyCard>;
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>;
  if (rows.length === 0) return <EmptyCard>このクライアントに紐付くリストがありません</EmptyCard>;

  const ratePct = (num, den) => den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';
  const rate2Pct = (num, den) => den > 0 ? `${((num / den) * 100).toFixed(2)}%` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                </tr>
              );
            })}
            {/* 合計行 */}
            <tr style={{ background: C.cream, borderTop: `2px solid ${C.navy}`, fontWeight: 600 }}>
              <td style={{ ...td, textAlign: 'left', color: C.navy, fontWeight: 700 }}>合計</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{totals.calls.toLocaleString()}</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{totals.ceoConnects.toLocaleString()}</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{ratePct(totals.ceoConnects, totals.calls)}</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{totals.appos.toLocaleString()}</td>
              <td style={{ ...td, color: C.navy, fontWeight: 700 }}>{rate2Pct(totals.appos, totals.calls)}</td>
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
