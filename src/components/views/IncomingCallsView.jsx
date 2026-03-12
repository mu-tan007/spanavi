import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';

const ORG_ID = 'a0000000-0000-0000-0000-000000000001';

const formatJST = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function IncomingCallsView({ setCallFlowScreen }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('incoming_calls')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('received_at', { ascending: false })
      .limit(200);
    setRecords(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markHandled = async (id) => {
    await supabase
      .from('incoming_calls')
      .update({ status: '対応済み', handled_at: new Date().toISOString() })
      .eq('id', id);
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: '対応済み' } : r));
  };

  const filtered = records.filter(r =>
    statusFilter === 'all' ? true : r.status === statusFilter
  );

  const statusColor = (s) => s === '対応済み' ? C.green : '#e53835';

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>📞 着信履歴</div>
          <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>
            Zoom Phoneからの着信ログ
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* ステータスフィルタ */}
          {['all', '未対応', '対応済み'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Noto Sans JP'",
              border: '1px solid ' + (statusFilter === s ? C.navy : C.border),
              background: statusFilter === s ? C.navy : C.white,
              color: statusFilter === s ? C.white : C.textMid,
            }}>
              {s === 'all' ? 'すべて' : s}
            </button>
          ))}
          <button onClick={load} style={{
            padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            border: '1px solid ' + C.border, background: C.white, color: C.textMid,
          }}>
            ↻ 更新
          </button>
        </div>
      </div>

      {/* テーブル */}
      <div style={{
        background: C.white, borderRadius: 10, border: '1px solid ' + C.borderLight,
        overflow: 'hidden', boxShadow: '0 1px 4px rgba(26,58,92,0.06)',
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 13 }}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 13 }}>着信履歴がありません</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.offWhite, borderBottom: '1px solid ' + C.borderLight }}>
                {['受信日時', '企業名', '電話番号', 'ステータス', '対応者', '操作'].map(h => (
                  <th key={h} style={{
                    padding: '9px 14px', textAlign: 'left', fontWeight: 700,
                    color: C.textMid, fontSize: 11,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{
                  borderBottom: '1px solid ' + C.borderLight,
                  background: i % 2 === 0 ? C.white : C.offWhite + '80',
                }}>
                  <td style={{ padding: '8px 14px', color: C.textMid, whiteSpace: 'nowrap' }}>
                    {formatJST(r.received_at)}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    {r.item_id && setCallFlowScreen ? (
                      <span
                        onClick={() => setCallFlowScreen({ list: { _supaId: null, id: null, company: '' }, defaultItemId: r.item_id, defaultListMode: false })}
                        style={{ color: C.navy, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {r.company_name || '-'}
                      </span>
                    ) : (
                      <span style={{ color: C.textDark, fontWeight: r.company_name ? 600 : 400 }}>
                        {r.company_name || '-'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 14px', fontFamily: "'JetBrains Mono'", color: C.textMid }}>
                    {r.caller_number || '-'}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                      fontSize: 10, fontWeight: 700,
                      background: statusColor(r.status) + '18',
                      color: statusColor(r.status),
                    }}>
                      {r.status || '-'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 14px', color: C.textMid }}>
                    {r.handled_by || '-'}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    {r.status !== '対応済み' && (
                      <button onClick={() => markHandled(r.id)} style={{
                        padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                        cursor: 'pointer', border: '1px solid ' + C.border,
                        background: C.white, color: C.textMid, fontFamily: "'Noto Sans JP'",
                      }}>
                        対応済みにする
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
