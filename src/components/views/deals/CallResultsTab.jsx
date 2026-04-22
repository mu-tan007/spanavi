import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { useCallStatuses } from '../../../hooks/useCallStatuses';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// 選択されたクライアントに紐付くリストごとの架電結果サマリ + 時系列
export default function CallResultsTab({ client }) {
  const { ceoConnectLabels } = useCallStatuses();
  const [lists, setLists] = useState([]);
  const [summary, setSummary] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [loading, setLoading] = useState(false);
  const orgId = getOrgId();

  useEffect(() => {
    if (!orgId || !client?.id) { setLists([]); setSummary([]); setByDay([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: listRows } = await supabase
        .from('call_lists')
        .select('id, company, industry, status, is_archived')
        .eq('org_id', orgId)
        .eq('client_id', client.id);
      if (cancelled) return;
      const activeLists = (listRows || []).filter(l => !l.is_archived);
      setLists(activeLists);

      const listIds = activeLists.map(l => l.id);
      if (listIds.length === 0) { setSummary([]); setByDay([]); setLoading(false); return; }

      const { data: calls } = await supabase
        .from('call_records')
        .select('id, list_id, called_at, status')
        .in('list_id', listIds);

      const { data: appos } = await supabase
        .from('appointments')
        .select('id, list_id, client_id, status')
        .eq('client_id', client.id);

      if (cancelled) return;

      const sum = {};
      for (const l of activeLists) {
        sum[l.id] = { list_id: l.id, list_name: l.company || '(名称未設定)', industry: l.industry || '', calls: 0, ceoConnects: 0, appos: 0 };
      }
      (calls || []).forEach(r => {
        const s = sum[r.list_id]; if (!s) return;
        s.calls += 1;
        if (ceoConnectLabels.has(r.status)) s.ceoConnects += 1;
      });
      (appos || []).forEach(a => {
        const s = sum[a.list_id]; if (!s) return;
        s.appos += 1;
      });
      setSummary(Object.values(sum));

      const dayMap = {};
      (calls || []).forEach(r => {
        const d = (r.called_at || '').slice(0, 10);
        if (!d) return;
        dayMap[d] = (dayMap[d] || 0) + 1;
      });
      setByDay(Object.entries(dayMap).map(([date, calls]) => ({ date, calls })).sort((a, b) => a.date.localeCompare(b.date)));

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, client?.id, ceoConnectLabels]);

  const totals = useMemo(() => summary.reduce((a, s) => ({
    calls: a.calls + s.calls,
    ceoConnects: a.ceoConnects + s.ceoConnects,
    appos: a.appos + s.appos,
  }), { calls: 0, ceoConnects: 0, appos: 0 }), [summary]);

  if (!client) {
    return <EmptyCard>クライアントを選択してください</EmptyCard>;
  }
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>;
  }
  if (lists.length === 0) {
    return <EmptyCard>このクライアントに紐付くリストがありません</EmptyCard>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* サマリーカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <SummaryCard label="総架電件数" value={totals.calls} />
        <SummaryCard label="社長接続数" value={totals.ceoConnects} />
        <SummaryCard label="社長接続率" value={totals.calls > 0 ? `${((totals.ceoConnects / totals.calls) * 100).toFixed(1)}%` : '—'} />
        <SummaryCard label="アポ獲得数 (獲得率)" value={`${totals.appos} (${totals.calls > 0 ? `${((totals.appos / totals.calls) * 100).toFixed(2)}%` : '—'})`} />
      </div>

      {/* リスト別テーブル */}
      <Card title="リスト別 架電結果">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.cream, borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...th, textAlign: 'left' }}>リスト名</th>
              <th style={{ ...th, textAlign: 'left' }}>業種</th>
              <th style={th}>架電件数</th>
              <th style={th}>社長接続数</th>
              <th style={th}>社長接続率</th>
              <th style={th}>アポ獲得数</th>
              <th style={th}>アポ獲得率</th>
            </tr>
          </thead>
          <tbody>
            {summary.map(s => (
              <tr key={s.list_id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 500, color: C.navy }}>{s.list_name}</td>
                <td style={{ ...td, textAlign: 'left', color: C.textMid }}>{s.industry || '—'}</td>
                <td style={td}>{s.calls.toLocaleString()}</td>
                <td style={td}>{s.ceoConnects.toLocaleString()}</td>
                <td style={td}>{s.calls > 0 ? `${((s.ceoConnects / s.calls) * 100).toFixed(1)}%` : '—'}</td>
                <td style={td}>{s.appos.toLocaleString()}</td>
                <td style={td}>{s.calls > 0 ? `${((s.appos / s.calls) * 100).toFixed(2)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 時系列 */}
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
