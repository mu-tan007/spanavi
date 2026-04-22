import { useState, useEffect } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';

import { getOrgId } from '../../lib/orgContext';
import PageHeader from '../common/PageHeader';

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

const INCOMING_COLS = [
  { key: 'receivedAt', width: 50, align: 'right' },
  { key: 'company', width: 210, align: 'left' },
  { key: 'phone', width: 70, align: 'left' },
  { key: 'status', width: 100, align: 'center' },
  { key: 'handler', width: 120, align: 'left' },
  { key: 'action', width: 130, align: 'center' },
];

export default function IncomingCallsView({ setCallFlowScreen }) {
  const isMobile = useIsMobile();
  const { columns, contentMinWidth, onResizeStart, onHeaderContextMenu, contextMenu, setAlign, resetAll, closeMenu } = useColumnConfig('incomingCalls', INCOMING_COLS);
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
      .eq('org_id', getOrgId())
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
      singleItemMode: true,
    });
    setSelectModal(null);
  };

  const filtered = records.filter(r =>
    statusFilter === 'all' ? true : r.status === statusFilter
  );

  const statusColor = (s) => s === '対応済み' ? C.green : '#e53835';

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="Incoming Call"
        description="着信履歴"
        style={{ marginBottom: isMobile ? 16 : 24 }}
      />
      {/* フィルター */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        marginBottom: 16, gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['all', '未対応', '対応済み'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Noto Sans JP'",
              border: '1px solid ' + (statusFilter === s ? '#0D2247' : '#E5E7EB'),
              background: statusFilter === s ? '#0D2247' : '#fff',
              color: statusFilter === s ? '#fff' : '#6B7280',
            }}>
              {s === 'all' ? 'すべて' : s}
            </button>
          ))}
          <button onClick={load} style={{
            padding: '5px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
            border: '1px solid #0D2247', background: '#fff', color: '#0D2247',
          }}>
            ↻ 更新
          </button>
        </div>
      </div>

      {/* テーブル */}
      <div style={{
        background: '#fff', borderRadius: 4, border: '1px solid #E5E7EB',
        overflowX: 'auto', overflowY: 'hidden',
      }}>
        <div style={{ minWidth: contentMinWidth }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 13 }}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 13 }}>着信履歴がありません</div>
        ) : (
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: isMobile ? 11 : 12 }}>
            <thead>
              <tr style={{ background: '#0D2247' }}>
                {['受信日時', '企業名・リスト', '電話番号', 'ステータス', '対応者', '操作'].map((label, i) => (
                  <th key={label} onContextMenu={e => onHeaderContextMenu(e, i)} style={{
                    padding: i === 0 ? '8px 6px' : '8px 16px',
                    textAlign: columns[i].align, fontWeight: 600,
                    color: '#fff', fontSize: 11, verticalAlign: 'middle',
                    width: columns[i].width, position: 'relative',
                  }}>
                    {label}
                    <ColumnResizeHandle colIndex={i} onResizeStart={onResizeStart} />
                  </th>
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
                    borderBottom: '1px solid #E5E7EB',
                    background: i % 2 === 0 ? '#fff' : '#F8F9FA',
                  }}>
                    <td style={{ padding: '8px 6px 8px 6px', textAlign: columns[0].align, color: C.textMid, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {formatJST(r.received_at)}
                    </td>

                    {/* 企業名・リスト列 */}
                    <td style={{ padding: '8px 16px', textAlign: columns[1].align, verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

                    <td style={{ padding: '8px 16px', textAlign: columns[2].align, fontFamily: "'JetBrains Mono'", fontVariantNumeric: 'tabular-nums', color: C.textMid, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {r.caller_number || '-'}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: columns[3].align, verticalAlign: 'middle' }}>
                      <span style={{
                        color: statusColor(r.status), fontSize: 12,
                      }}>
                        {r.status || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: columns[4].align, color: C.textMid, verticalAlign: 'middle' }}>
                      {r.handled_by || '-'}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: columns[5].align, verticalAlign: 'middle' }}>
                      {r.status !== '対応済み' && (
                        <button onClick={() => markHandled(r.id)} style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                          cursor: 'pointer', border: '1px solid #0D2247',
                          background: '#fff', color: '#0D2247', fontFamily: "'Noto Sans JP'",
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
      </div>

      <AlignmentContextMenu
        contextMenu={contextMenu}
        setAlign={setAlign}
        resetAll={resetAll}
        closeMenu={closeMenu}
      />

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
              background: '#fff', borderRadius: 4,
              minWidth: 320, maxWidth: 420,
              boxShadow: '0 16px 48px rgba(10,25,41,0.22)',
              border: '1px solid #E5E7EB',
              overflow: 'hidden',
            }}
          >
            <div style={{ background: '#0D2247', color: '#fff', padding: '12px 24px', fontWeight: 600, fontSize: 14 }}>
              どのリストから架電しますか？
            </div>
            <div style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {selectModal.map(m => (
                <button
                  key={m.itemId}
                  onClick={() => navigateTo(m)}
                  style={{
                    padding: '10px 14px', borderRadius: 4, border: '1px solid #E5E7EB',
                    background: '#F8F9FA', cursor: 'pointer', textAlign: 'left',
                    fontFamily: "'Noto Sans JP'", fontSize: 12, color: '#0D2247',
                    fontWeight: 500, transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F8F9FA'; }}
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
                  padding: '6px 20px', borderRadius: 4, border: '1px solid #0D2247',
                  background: '#fff', color: '#0D2247', cursor: 'pointer',
                  fontSize: 12, fontFamily: "'Noto Sans JP'",
                }}
              >
                キャンセル
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
