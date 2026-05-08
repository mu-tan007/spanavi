import { useState, useEffect } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Card, Badge } from '../ui';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';

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
  const { columns, contentMinWidth, onResizeStart } = useColumnConfig('incomingCalls', INCOMING_COLS);
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

  // ステータス → Badge variant
  const statusVariant = (s) => s === '対応済み' ? 'success' : 'danger';

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
        marginBottom: space[4], gap: space[2],
      }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          {['all', '未対応', '対応済み'].map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'primary' : 'outline'}
              onClick={() => setStatusFilter(s)}
              style={statusFilter !== s ? { color: color.textMid, borderColor: color.border } : undefined}
            >
              {s === 'all' ? 'すべて' : s}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load}>
            ↻ 更新
          </Button>
        </div>
      </div>

      {/* テーブル */}
      <Card padding="none" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ minWidth: contentMinWidth }}>
        {loading ? (
          <div style={{ padding: space[10], textAlign: 'center', color: color.textLight, fontSize: font.size.base }}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: space[10], textAlign: 'center', color: color.textLight, fontSize: font.size.base }}>着信履歴がありません</div>
        ) : (
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: isMobile ? font.size.xs : font.size.sm }}>
            <thead>
              <tr style={{ background: color.navy }}>
                {['受信日時', '企業名・リスト', '電話番号', 'ステータス', '対応者', '操作'].map((label, i) => (
                  <th key={label} style={{
                    padding: i === 0 ? '8px 6px' : '8px 16px',
                    textAlign: columns[i].align, fontWeight: font.weight.semibold,
                    color: color.white, fontSize: font.size.xs, verticalAlign: 'middle',
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
                    borderBottom: `1px solid ${color.border}`,
                    background: i % 2 === 0 ? color.white : color.cream,
                  }}>
                    <td style={{ padding: '8px 6px 8px 6px', textAlign: columns[0].align, color: color.textMid, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {formatJST(r.received_at)}
                    </td>

                    {/* 企業名・リスト列 */}
                    <td style={{ padding: '8px 16px', textAlign: columns[1].align, verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {companyName ? (
                        <div>
                          {canNavigate ? (
                            <span
                              onClick={() => handleCompanyClick(uniqueMatches)}
                              style={{ color: color.navy, fontWeight: font.weight.bold, cursor: 'pointer', textDecoration: 'underline', fontSize: font.size.sm }}
                            >
                              {companyName}
                            </span>
                          ) : (
                            <span style={{ color: color.textDark, fontWeight: font.weight.bold, fontSize: font.size.sm }}>
                              {companyName}
                            </span>
                          )}
                          {/* 所属リスト一覧 */}
                          {uniqueMatches.length > 0 && (
                            <div style={{ marginTop: 3 }}>
                              {uniqueMatches.map(m => (
                                <div key={m.itemId} style={{
                                  fontSize: 10, color: color.textLight,
                                  display: 'flex', alignItems: 'center', gap: 3,
                                }}>
                                  <span style={{ color: color.textLight }}>└</span>
                                  <span
                                    onClick={() => setCallFlowScreen && navigateTo(m)}
                                    style={{
                                      cursor: setCallFlowScreen ? 'pointer' : 'default',
                                      color: setCallFlowScreen ? alpha(color.navy, 0.8) : color.textLight,
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
                        <span style={{ color: color.textLight }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '8px 16px', textAlign: columns[2].align, fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums', color: color.textMid, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {r.caller_number || '-'}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: columns[3].align, verticalAlign: 'middle' }}>
                      {r.status
                        ? <Badge variant={statusVariant(r.status)} dot>{r.status}</Badge>
                        : <span style={{ color: color.textLight, fontSize: font.size.sm }}>-</span>
                      }
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: columns[4].align, color: color.textMid, verticalAlign: 'middle' }}>
                      {r.handled_by || '-'}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: columns[5].align, verticalAlign: 'middle' }}>
                      {r.status !== '対応済み' && (
                        <Button size="sm" variant="outline" onClick={() => markHandled(r.id)}>
                          対応済みにする
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </div>
      </Card>

      {/* リスト選択モーダル */}
      {selectModal && (
        <div
          onClick={() => setSelectModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: alpha(color.navyDeep, 0.5), backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: color.white, borderRadius: radius.md,
              minWidth: 320, maxWidth: 420,
              boxShadow: shadow.xl,
              border: `1px solid ${color.border}`,
              overflow: 'hidden',
            }}
          >
            <div style={{
              background: color.navy, color: color.white,
              padding: '12px 24px',
              fontWeight: font.weight.semibold, fontSize: font.size.md,
            }}>
              どのリストから架電しますか？
            </div>
            <div style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginBottom: space[5] }}>
              {selectModal.map(m => (
                <button
                  key={m.itemId}
                  onClick={() => navigateTo(m)}
                  style={{
                    padding: '10px 14px', borderRadius: radius.md,
                    border: `1px solid ${color.border}`,
                    background: color.cream, cursor: 'pointer', textAlign: 'left',
                    fontFamily: font.family.sans, fontSize: font.size.sm, color: color.navy,
                    fontWeight: font.weight.medium, transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = color.cream; }}
                >
                  {listLabel(m)}
                  {m.company && (
                    <span style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.normal, marginLeft: 8 }}>
                      {m.company}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <Button size="sm" variant="outline" onClick={() => setSelectModal(null)}>
                キャンセル
              </Button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
