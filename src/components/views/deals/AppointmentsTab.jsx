import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import {
  extractCeoMaIntent, extractPrefecture, parseRevenueOku,
  extractRevenueFromReport, extractAddressFromReport,
} from '../../../utils/apppoReportParse';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// Spanavi テーマに準拠。ラベルは 前向き/様子見/消極的/不明 の 4 グループ。
//   前向き  ← 前向き・比較的高い(と思われる)・角度高い方です
//   様子見  ← 様子見・普通・中
//   消極的  ← 消極的・やや低め・低め・やや消極的・やや低い・やんわり断り(気味)
//   不明    ← 不明・面談化には成功したが・空欄
const CEO_INTENT_OPTIONS = [
  { value: 'positive', label: '前向き', color: C.green },
  { value: 'wait',     label: '様子見', color: C.gold },
  { value: 'negative', label: '消極的', color: C.navy },
  { value: 'unknown',  label: '不明',   color: C.textLight },
];

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

export default function AppointmentsTab({ client }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [extraByName, setExtraByName] = useState({}); // { company_name: {address, revenue} }
  const orgId = getOrgId();

  useEffect(() => {
    if (!orgId || !client?.id) { setRows([]); setExtraByName({}); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('appointments')
        .select(`
          id, company_name, meeting_date, status, cancel_reason, ceo_ma_intent, sales_amount, appo_report,
          item:call_list_items(id, company, address, revenue, business)
        `)
        .eq('org_id', orgId)
        .eq('client_id', client.id)
        .order('meeting_date', { ascending: false });
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
      // fallback B: company_master (MASP database) で同名企業
      const [cliRes, cmRes] = await Promise.all([
        supabase.from('call_list_items')
          .select('company, address, revenue')
          .eq('org_id', orgId)
          .in('company', missingNames),
        supabase.from('company_master')
          .select('company_name, address, revenue_k')
          .eq('org_id', orgId)
          .in('company_name', missingNames),
      ]);
      if (cancelled) return;
      const acc = {};
      // company_master 優先度は低め (A があれば A)
      (cmRes.data || []).forEach(c => {
        if (!acc[c.company_name]) acc[c.company_name] = {};
        if (!acc[c.company_name].address && c.address) acc[c.company_name].address = c.address;
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
  }, [orgId, client?.id]);

  const enriched = useMemo(() => (rows || []).map(r => {
    const fallback = extraByName[r.company_name] || {};
    // 住所 優先度: item → 同名リスト行 → company_master → appo_report
    const address = r.item?.address || fallback.address || extractAddressFromReport(r.appo_report);
    // 売上 同様
    const revenueText = r.item?.revenue || fallback.revenue || null;
    const revenue_oku = parseRevenueOku(revenueText) ?? extractRevenueFromReport(r.appo_report);
    // 未入力 & 推定できずは 不明 に集約
    const intent = r.ceo_ma_intent || extractCeoMaIntent(r.appo_report) || 'unknown';
    return {
      ...r,
      address,
      prefecture: extractPrefecture(address),
      revenue_oku,
      revenue_text: revenue_oku != null ? formatOku(revenue_oku) : (revenueText || null),
      resolved_intent: intent,
      intent_is_derived: !r.ceo_ma_intent && intent !== 'unknown' ? !!extractCeoMaIntent(r.appo_report) : false,
    };
  }), [rows, extraByName]);

  const handleIntentChange = async (id, value) => {
    setUpdating(id);
    const { error } = await supabase.from('appointments')
      .update({ ceo_ma_intent: value || null })
      .eq('id', id);
    if (!error) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, ceo_ma_intent: value || null } : r));
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
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>;
  if (enriched.length === 0) return <EmptyCard>このクライアントへのアポイントがありません</EmptyCard>;

  const intentChartData = CEO_INTENT_OPTIONS.map(o => ({ name: o.label, value: stats.intentCount[o.value] || 0, color: o.color }))
    .filter(d => d.value > 0);
  const prefChartData = Object.entries(stats.prefCount).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const revChartData = ['〜1億','1〜3億','3〜10億','10〜30億','30億〜','不明']
    .map(name => ({ name, value: stats.revCount[name] || 0 }))
    .filter(d => d.value > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <SummaryCard label="アポ数" value={stats.total} />
        <SummaryCard label="キャンセル" value={`${stats.canceled} (${stats.total > 0 ? ((stats.canceled / stats.total) * 100).toFixed(1) : 0}%)`} />
        <SummaryCard label="リスケ中" value={stats.rescheduled} />
        <SummaryCard label="前向き" value={stats.intentCount.positive || 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Card title="社長のM&A意向">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={intentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                  {intentChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="エリア分布 (都道府県)">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={prefChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.textMid }} />
                <YAxis tick={{ fontSize: 10, fill: C.textMid }} />
                <Tooltip />
                <Bar dataKey="value" fill={C.navy} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="売上高分布 (億円)">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={revChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.textMid }} />
                <YAxis tick={{ fontSize: 10, fill: C.textMid }} />
                <Tooltip />
                <Bar dataKey="value" fill={C.gold} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="アポ一覧">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.cream, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ ...th, textAlign: 'left' }}>企業名</th>
                <th style={{ ...th, textAlign: 'left' }}>業種</th>
                <th style={th}>売上高</th>
                <th style={th}>エリア</th>
                <th style={th}>面談日</th>
                <th style={th}>状態</th>
                <th style={th}>社長のM&A意向</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map(r => {
                const statusColor = r.status === 'キャンセル' ? '#EF4444' : r.status === 'リスケ中' ? '#F59E0B' : C.navy;
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 500, color: C.navy }}>{r.company_name || '—'}</td>
                    <td style={{ ...td, textAlign: 'left', color: C.textMid }}>{r.item?.business || '—'}</td>
                    <td style={td}>{r.revenue_text || '—'}</td>
                    <td style={td}>{r.prefecture}</td>
                    <td style={td}>{r.meeting_date ? String(r.meeting_date).slice(0, 10) : '—'}</td>
                    <td style={{ ...td, color: statusColor, fontWeight: 600 }}>{r.status || '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <select
                          value={r.ceo_ma_intent || r.resolved_intent || ''}
                          disabled={updating === r.id}
                          onChange={e => handleIntentChange(r.id, e.target.value)}
                          style={{
                            fontSize: 11, padding: '3px 6px', border: `1px solid ${C.border}`,
                            borderRadius: 3, background: C.white, color: C.textDark, cursor: 'pointer',
                          }}
                        >
                          <option value="">—</option>
                          {CEO_INTENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {r.intent_is_derived && (
                          <span title="議事録から自動推定" style={{ fontSize: 9, color: C.textLight }}>AI</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
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
const td = { padding: '8px 12px', fontSize: 12, color: C.textDark, textAlign: 'center' };
