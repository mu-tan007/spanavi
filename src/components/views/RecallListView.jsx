import { useState } from "react";
import { C } from '../../constants/colors';
import { dialPhone } from '../../utils/phone';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import { useIsMobile } from '../../hooks/useIsMobile';

const RECALL_COLS = [
  { key: 'datetime', width: 78, align: 'left' },
  { key: 'company', width: 260, align: 'left' },
  { key: 'rep', width: 130, align: 'left' },
  { key: 'phone', width: 80, align: 'left' },
  { key: 'type', width: 150, align: 'center' },
  { key: 'assignee', width: 130, align: 'left' },
  { key: 'setter', width: 130, align: 'left' },
  { key: 'memo', width: 200, align: 'left' },
];

export default function RecallListView({ callListData, supaRecalls = [], members = [], currentUser = '', isAdmin = false, setCallFlowScreen }) {
  const isMobile = useIsMobile();
  const [sortBy, setSortBy] = useState("date");
  const [filterAssignee, setFilterAssignee] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showAssigneeSugg, setShowAssigneeSugg] = useState(false);

  const {
    columns,
    gridTemplateColumns,
    contentMinWidth,
    onResizeStart,
    onHeaderContextMenu,
    contextMenu,
    setAlign,
    resetAll,
    closeMenu,
  } = useColumnConfig('recall', RECALL_COLS, { padding: 28 });

  const assigneeSuggestions = members.filter(m =>
    !assigneeQuery || m.toLowerCase().includes(assigneeQuery.toLowerCase())
  );
  const handleAssigneeInput = (v) => {
    setAssigneeQuery(v);
    if (!v) setFilterAssignee('');
    setShowAssigneeSugg(true);
  };
  const handleAssigneeSelect = (name) => {
    setAssigneeQuery(name);
    setFilterAssignee(name);
    setShowAssigneeSugg(false);
  };
  const handleAssigneeClear = () => {
    setAssigneeQuery('');
    setFilterAssignee('');
    setShowAssigneeSugg(false);
  };

  // Collect recall items (Supabaseのみ)
  const recallItems = (supaRecalls || []).map(r => ({
    _source: 'supabase',
    _supaRecord: r,
    company: r._item.company || '企業名不明',
    phone: r._item.phone || '',
    representative: r._item.representative || '',
    address: r._item.address || '',
    status: r.status,
    recallDate: r._memoObj.recall_date || '',
    recallTime: r._memoObj.recall_time || '',
    assignee: r._memoObj.assignee || '',
    setter: r.getter_name || '',
    note: r._memoObj.note || '',
    listInfo: null,
    _list_name: r._list_name || '',
    _list_industry: r._list_industry || '',
    _client_name: r._client_name || '',
  }));

  // 全メンバーの再コールを全員に表示
  const baseRecallItems = recallItems;
  const filteredRecallItems = filterAssignee
    ? baseRecallItems.filter(item => item.assignee === filterAssignee)
    : baseRecallItems;

  const sorted = [...filteredRecallItems].sort((a, b) => {
    if (sortBy === "date") return (a.recallDate + a.recallTime).localeCompare(b.recallDate + b.recallTime);
    if (sortBy === "assignee") return (a.assignee || "未設定").localeCompare(b.assignee || "未設定");
    return 0;
  });

  const today = new Date().toISOString().slice(0, 10);
  const nowDt = new Date();
  const isOverdue = (date, time) => { if (!date) return false; return new Date(`${date}T${time || '00:00'}:00`) <= nowDt; };

  const inputStyle = { padding: "6px 10px", borderRadius: 6, background: C.white, border: "1px solid " + C.border, color: C.textDark, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" };

  const headerLabels = ['予定日時', '企業名', '代表者', '電話番号', '種別', '担当', '設定者', 'メモ'];

  return (
    <div style={{ animation: "fadeIn 0.3s ease", height: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column' }}>
      {/* ページヘッダー */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Recall</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>コールバック・再架電管理</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto', overflowY: 'hidden', background: "#fff", borderRadius: 4, border: '1px solid #E5E7EB' }}>
        <div style={{ padding: isMobile ? '8px 10px' : '10px 14px', borderBottom: '1px solid ' + C.borderLight, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>再コール一覧</span>
            <span style={{ fontSize: 10, color: C.textLight }}>{sorted.length}{filterAssignee ? `/${baseRecallItems.length}` : ''}件</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 担当者フィルター combobox */}
            {<div style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid ' + C.navy, borderRadius: 6, background: C.white,
              }}>
                {filterAssignee && (
                  <div style={{
                    background: '#0D2247', color: '#fff', fontSize: 10, fontWeight: 700,
                    padding: '0 8px', display: 'flex', alignItems: 'center',
                    whiteSpace: 'nowrap', alignSelf: 'stretch', borderRadius: '3px 0 0 3px',
                  }}>
                    {filterAssignee}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="担当者で絞り込み..."
                  value={assigneeQuery}
                  onChange={e => handleAssigneeInput(e.target.value)}
                  onFocus={() => setShowAssigneeSugg(true)}
                  onBlur={() => setTimeout(() => setShowAssigneeSugg(false), 150)}
                  style={{ ...inputStyle, border: 'none', outline: 'none', minWidth: 130, background: 'transparent' }}
                />
                {filterAssignee && (
                  <button onMouseDown={handleAssigneeClear} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: C.textLight, padding: '4px 8px', fontSize: 13, lineHeight: 1,
                  }}>✕</button>
                )}
              </div>
              {showAssigneeSugg && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                  background: C.white, border: '1px solid ' + C.navy + '40',
                  borderRadius: 6, boxShadow: '0 4px 12px rgba(26,58,92,0.15)',
                  zIndex: 200, maxHeight: 200, overflowY: 'auto', minWidth: '100%',
                }}>
                  <div
                    onMouseDown={handleAssigneeClear}
                    style={{
                      padding: '7px 12px', fontSize: 11, color: C.navy,
                      cursor: 'pointer', fontWeight: 600,
                      borderBottom: '1px solid ' + C.borderLight,
                      background: !filterAssignee ? C.navy + '08' : 'transparent',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.navy + '10'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = !filterAssignee ? C.navy + '08' : 'transparent'; }}
                  >
                    全員（全件表示）
                  </div>
                  {assigneeSuggestions.map(m => (
                    <div
                      key={m}
                      onMouseDown={() => handleAssigneeSelect(m)}
                      style={{
                        padding: '7px 12px', fontSize: 11, color: C.navy,
                        cursor: 'pointer',
                        background: m === filterAssignee ? '#0D224715' : 'transparent',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#0D224720'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = m === filterAssignee ? '#0D224715' : 'transparent'; }}
                    >
                      {m}
                    </div>
                  ))}
                  {assigneeSuggestions.length === 0 && (
                    <div style={{ padding: '7px 12px', fontSize: 11, color: C.textLight }}>候補なし</div>
                  )}
                </div>
              )}
            </div>}
            {/* ソート */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
              <option value="date">日時順</option>
              <option value="assignee">担当者別</option>
            </select>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ minWidth: contentMinWidth }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.textLight, fontSize: 13 }}>再コール予定はありません</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns, padding: isMobile ? '6px 10px' : '8px 14px', background: '#0D2247', borderBottom: '1px solid #E5E7EB', borderLeft: '3px solid transparent', fontSize: isMobile ? 10 : 11, fontWeight: 600, color: '#fff', verticalAlign: 'middle', flexShrink: 0 }}>
                {headerLabels.map((label, idx) => (
                  <span
                    key={columns[idx].key}
                    onContextMenu={e => onHeaderContextMenu(e, idx)}
                    style={{ position: 'relative', textAlign: columns[idx].align, paddingRight: 6 }}
                  >
                    {label}
                    <ColumnResizeHandle colIndex={idx} onResizeStart={onResizeStart} />
                  </span>
                ))}
              </div>
              {sorted.map((item, i) => {
                const past = isOverdue(item.recallDate, item.recallTime);
                return (
                  <div key={i} onClick={() => {
                      if (setCallFlowScreen && item._source === 'supabase') {
                        const _list = callListData.find(l => l._supaId === item._supaRecord?.list_id);
                        if (_list) {
                          // 再コール一覧の表示順で前後ナビゲーションできるよう、全アイテムのIDリストを渡す
                          const recallNavList = sorted
                            .filter(s => s._source === 'supabase' && s._supaRecord?.list_id && s._supaRecord?.item_id)
                            .map(s => ({ itemId: s._supaRecord.item_id, listSupaId: s._supaRecord.list_id }));
                          setCallFlowScreen({ list: _list, defaultItemId: item._supaRecord.item_id, defaultListMode: false, recallNavList });
                          return;
                        }
                      }
                    }}
                    style={{ display: 'grid', gridTemplateColumns, padding: isMobile ? '6px 10px' : '8px 14px', fontSize: isMobile ? 10 : 11, alignItems: 'center', borderBottom: '1px solid #E5E7EB', borderLeft: '3px solid transparent', background: past ? '#fff5f5' : i % 2 === 0 ? '#fff' : '#F8F9FA', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; e.currentTarget.style.borderLeft = '3px solid #0D2247'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = past ? '#fff5f5' : 'transparent'; e.currentTarget.style.borderLeft = '3px solid transparent'; }}
                    >
                    <div style={{ textAlign: columns[0].align }}>
                      <div style={{ fontWeight: 700, color: past ? '#e53e3e' : C.navy, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{item.recallTime || '--:--'}</div>
                      <div style={{ fontSize: 9, color: C.textLight }}>{item.recallDate ? item.recallDate.slice(5).replace('-', '/') : '日時未設定'}</div>
                    </div>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: columns[1].align }}>{item.company}</span>
                    <span style={{ color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, textAlign: columns[2].align }}>{item.representative}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: columns[3].align }}>{item.phone}</span>
                    <div style={{ display: 'flex', justifyContent: columns[4].align === 'left' ? 'flex-start' : columns[4].align === 'right' ? 'flex-end' : 'center', width: '100%' }}>
                      <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: '#1E40AF1a', color: '#1E40AF', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {item.status === 'ceo_recall' || item.status === '社長再コール' ? '社長' : '受付'}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: columns[5].align }}>{item.assignee || '—'}</span>
                    <span style={{ fontSize: 10, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: columns[6].align }}>{item.setter || '—'}</span>
                    <span title={item.note || ''} style={{ fontSize: 10, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: item.note ? 'normal' : 'italic', textAlign: columns[7].align }}>{item.note || '—'}</span>
                  </div>
                );
              })}
            </>
          )}
          </div>
        </div>
      </div>
      {contextMenu.visible && (
        <AlignmentContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          currentAlign={columns[contextMenu.colIndex]?.align || 'left'}
          onSelect={align => setAlign(contextMenu.colIndex, align)}
          onReset={resetAll}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
