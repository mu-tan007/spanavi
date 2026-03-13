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

// リスト表示ラベル: call_lists.nameがclientName含む場合はlistNameのみ
const listLabel = (m) => {
  if (!m.clientName) return m.listName || '';
  if (m.listName.startsWith(m.clientName)) return m.listName;
  return m.listName ? `${m.clientName} – ${m.listName}` : m.clientName;
};

const normalizePhone = (n) => {
  if (!n) return '';
  const digits = n.replace(/\D/g, '');
  if (digits.startsWith('81')) return '0' + digits.slice(2);
  return digits;
};

export default function IncomingCallsView({ setCallFlowScreen }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  // phone(正規化済み) → [{ itemId, company, listId, listName, clientName }]
  const [phoneItemMap, setPhoneItemMap] = useState({});
  // リスト選択モーダル: null | [{ itemId, company, listId, listName, clientName }]
  const [selectModal, setSelectModal] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('incoming_calls')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('received_at', { ascending: false })
      .limit(200);
    const rows = data || [];
    setRecords(rows);

    // 全電話番号を一括でcall_list_itemsに問い合わせ
    const phones = [...new Set(
      rows.map(r => normalizePhone(r.caller_number)).filter(Boolean)
    )];
    if (phones.length > 0) {
      const { data: items } = await supabase
        .from('call_list_items')
        .select('id, company, phone, list_id, call_lists(id, name, clients(name))')
        .in('phone', phones)
        .limit(500);
      const map = {};
      (items || []).forEach(item => {
        const p = normalizePhone(item.phone);
        if (!p) return;
        if (!map[p]) map[p] = [];
        map[p].push({
          itemId: item.id,
          company: item.company || '',
          listId: item.list_id,
          listName: item.call_lists?.name || '',
          clientName: item.call_lists?.clients?.name || '',
        });
      });
      setPhoneItemMap(map);
    }

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

  const handleCompanyClick = (matches) => {
    if (matches.length === 1) {
      navigateTo(matches[0]);
    } else {
      setSelectModal(matches);
    }
  };

  const navigateTo = (match) => {
    if (!setCallFlowScreen) return;
    setCallFlowScreen({
      list: { _supaId: match.listId, id: match.listId, company: match.company },
      defaultItemId: match.itemId,
      defaultListMode: false,
    });
    setSelectModal(null);
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
                {['受信日時', '企業名・リスト', '電話番号', 'ステータス', '対応者', '操作'].map(h => (
                  <th key={h} style={{
                    padding: '9px 14px', textAlign: 'left', fontWeight: 700,
                    color: C.textMid, fontSize: 11,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const phone = normalizePhone(r.caller_number);
                const matches = phoneItemMap[phone] || [];
                // 重複排除（同企業が複数リストに登録されている場合、itemIdで重複除去）
                const uniqueMatches = matches.filter((m, idx, arr) =>
                  arr.findIndex(x => x.itemId === m.itemId) === idx
                );
                const companyName = uniqueMatches[0]?.company || r.company_name || null;
                const canNavigate = uniqueMatches.length > 0 && setCallFlowScreen;

                return (
                  <tr key={r.id} style={{
                    borderBottom: '1px solid ' + C.borderLight,
                    background: i % 2 === 0 ? C.white : C.offWhite + '80',
                  }}>
                    <td style={{ padding: '8px 14px', color: C.textMid, whiteSpace: 'nowrap' }}>
                      {formatJST(r.received_at)}
                    </td>

                    {/* 企業名・リスト列 */}
                    <td style={{ padding: '8px 14px', minWidth: 160 }}>
                      {companyName ? (
                        <div>
                          {canNavigate ? (
                            <span
                              onClick={() => handleCompanyClick(uniqueMatches)}
                              style={{ color: C.navy, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
                            >
                              {companyName}
                            </span>
                          ) : (
                            <span style={{ color: C.textDark, fontWeight: 700, fontSize: 12 }}>
                              {companyName}
                            </span>
                          )}
                          {/* 所属リスト一覧 */}
                          {uniqueMatches.length > 0 && (
                            <div style={{ marginTop: 3 }}>
                              {uniqueMatches.map(m => (
                                <div key={m.itemId} style={{
                                  fontSize: 10, color: C.textLight,
                                  display: 'flex', alignItems: 'center', gap: 3,
                                }}>
                                  <span style={{ color: C.textLight }}>└</span>
                                  <span
                                    onClick={() => setCallFlowScreen && navigateTo(m)}
                                    style={{
                                      cursor: setCallFlowScreen ? 'pointer' : 'default',
                                      color: setCallFlowScreen ? C.navy + 'cc' : C.textLight,
                                      textDecoration: setCallFlowScreen ? 'underline' : 'none',
                                    }}
                                  >
                                    {listLabel(m)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: C.textLight }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '8px 14px', fontFamily: "'JetBrains Mono'", color: C.textMid, whiteSpace: 'nowrap' }}>
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* リスト選択モーダル */}
      {selectModal && (
        <div
          onClick={() => setSelectModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(10,25,41,0.5)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.white, borderRadius: 12, padding: '24px 28px',
              minWidth: 320, maxWidth: 420,
              boxShadow: '0 16px 48px rgba(10,25,41,0.22)',
              border: '1px solid ' + C.borderLight,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              どのリストから架電しますか？
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {selectModal.map(m => (
                <button
                  key={m.itemId}
                  onClick={() => navigateTo(m)}
                  style={{
                    padding: '10px 14px', borderRadius: 8, border: '1px solid ' + C.border,
                    background: C.offWhite, cursor: 'pointer', textAlign: 'left',
                    fontFamily: "'Noto Sans JP'", fontSize: 12, color: C.navy,
                    fontWeight: 600, transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.offWhite; }}
                >
                  {listLabel(m)}
                  {m.company && (
                    <span style={{ fontSize: 10, color: C.textLight, fontWeight: 400, marginLeft: 8 }}>
                      {m.company}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setSelectModal(null)}
                style={{
                  padding: '6px 20px', borderRadius: 6, border: '1px solid ' + C.border,
                  background: C.white, color: C.textMid, cursor: 'pointer',
                  fontSize: 12, fontFamily: "'Noto Sans JP'",
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
