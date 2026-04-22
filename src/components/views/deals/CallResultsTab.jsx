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
  const [rows, setRows] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailList, setDetailList] = useState(null); // { list_id, list_name }
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

      {detailList && (
        <ListApproachModal
          list={detailList}
          orgId={orgId}
          onClose={() => setDetailList(null)}
        />
      )}

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

// ─── リスト詳細モーダル: 各企業の架電タイムライン ─────────
function ListApproachModal({ list, orgId, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('sourcing_list_approach_detail', {
        p_list_id: list.list_id, p_org_id: orgId,
      });
      if (cancelled) return;
      if (error) console.error('[ListApproachModal]', error);
      setItems(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [list.list_id, orgId]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it => (it.company || '').toLowerCase().includes(q));
  }, [items, filter]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: 4, width: '100%', maxWidth: 1100, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>
              {list.list_name} — 各企業のアプローチ詳細
            </div>
            <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>
              {items.length}社
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="企業名で絞り込み"
              style={{ padding: '6px 10px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3, width: 200 }}
            />
            <button onClick={onClose}
              style={{ fontSize: 13, padding: '5px 10px', background: 'transparent', border: 'none', cursor: 'pointer', color: C.textMid }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textLight }}>該当企業がありません</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: C.cream, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ ...th, width: 40 }}>#</th>
                  <th style={{ ...th, textAlign: 'left' }}>企業名</th>
                  <th style={{ ...th, textAlign: 'left' }}>架電履歴 (新しい順)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(it => {
                  const calls = Array.isArray(it.calls) ? [...it.calls].reverse() : [];
                  return (
                    <tr key={it.item_id} style={{ borderBottom: `1px solid ${C.borderLight}`, verticalAlign: 'top' }}>
                      <td style={{ ...td, fontFamily: "'JetBrains Mono',monospace", color: C.textLight }}>{it.no ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 500, color: C.navy }}>{it.company || '—'}</td>
                      <td style={{ ...td, textAlign: 'left', color: C.textDark, padding: '6px 12px' }}>
                        {calls.length === 0 ? (
                          <span style={{ color: C.textLight }}>未架電</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {calls.map((c, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                                <span style={{ width: 42, color: C.textMid, fontWeight: 600 }}>
                                  {c.round ? `${c.round}回目` : `${calls.length - i}回目`}
                                </span>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: C.textMid, minWidth: 82 }}>
                                  {c.called_at ? new Date(c.called_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                                </span>
                                <span style={{ color: statusColor(c.status), fontWeight: 500 }}>{c.status || '—'}</span>
                                {c.getter_name && <span style={{ color: C.textLight, fontSize: 10 }}>({c.getter_name})</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function statusColor(status) {
  if (!status) return C.textMid;
  if (status.includes('アポ')) return C.green;
  if (status.includes('お断り') || status.includes('ブロック')) return '#C0392B';
  if (status.includes('不在') || status.includes('再コール')) return C.gold;
  return C.textMid;
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
