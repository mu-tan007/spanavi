import { useState } from "react";
import { C } from '../../constants/colors';
import { dialPhone } from '../../utils/phone';

export default function RecallListView({ callListData, supaRecalls = [], members = [], currentUser = '', isAdmin = false, setCallFlowScreen }) {
  const [sortBy, setSortBy] = useState("date");
  const [filterAssignee, setFilterAssignee] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showAssigneeSugg, setShowAssigneeSugg] = useState(false);

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

  return (
    <div style={{ animation: "fadeIn 0.3s ease", height: 'calc(100vh - 210px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.white, borderRadius: 10, border: '1px solid ' + C.borderLight }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + C.borderLight, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
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
                    background: C.gold, color: C.white, fontSize: 10, fontWeight: 700,
                    padding: '0 8px', display: 'flex', alignItems: 'center',
                    whiteSpace: 'nowrap', alignSelf: 'stretch', borderRadius: '5px 0 0 5px',
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
                        background: m === filterAssignee ? C.gold + '15' : 'transparent',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.gold + '20'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = m === filterAssignee ? C.gold + '15' : 'transparent'; }}
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
          {sorted.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.textLight, fontSize: 13 }}>再コール予定はありません</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '78px 1.4fr 0.7fr 100px 50px 0.65fr 0.65fr 1.5fr', padding: '5px 14px', background: C.offWhite, borderBottom: '1px solid ' + C.borderLight, fontSize: 9, fontWeight: 700, color: C.textLight, letterSpacing: 0.5, flexShrink: 0 }}>
                <span>予定日時</span><span>企業名</span><span>代表者</span><span>電話番号</span><span>種別</span><span>担当</span><span>設定者</span><span>メモ</span>
              </div>
              {sorted.map((item, i) => {
                const past = isOverdue(item.recallDate, item.recallTime);
                return (
                  <div key={i} onClick={() => {
                      if (setCallFlowScreen && item._source === 'supabase') {
                        const _list = callListData.find(l => l._supaId === item._supaRecord?.list_id);
                        if (_list) { setCallFlowScreen({ list: _list, defaultItemId: item._supaRecord.item_id, defaultListMode: false }); return; }
                      }
                    }}
                    style={{ display: 'grid', gridTemplateColumns: '78px 1.4fr 0.7fr 100px 50px 0.65fr 0.65fr 1.5fr', padding: '8px 14px', fontSize: 11, alignItems: 'center', borderBottom: '1px solid ' + C.borderLight, borderLeft: '3px solid transparent', background: past ? '#fff5f5' : 'transparent', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; e.currentTarget.style.borderLeft = '3px solid #0D2247'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = past ? '#fff5f5' : 'transparent'; e.currentTarget.style.borderLeft = '3px solid transparent'; }}
                    >
                    <div>
                      <div style={{ fontWeight: 700, color: past ? '#e53e3e' : C.navy, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{item.recallTime || '--:--'}</div>
                      <div style={{ fontSize: 9, color: C.textLight }}>{item.recallDate ? item.recallDate.slice(5).replace('-', '/') : '日時未設定'}</div>
                    </div>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</span>
                    <span style={{ color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>{item.representative}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.phone}</span>
                    <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: C.gold + '10', color: C.gold, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {item.status === 'ceo_recall' || item.status === '社長再コール' ? '社長' : '受付'}
                    </span>
                    <span style={{ fontSize: 10, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.assignee || '—'}</span>
                    <span style={{ fontSize: 10, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.setter || '—'}</span>
                    <span title={item.note || ''} style={{ fontSize: 10, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: item.note ? 'normal' : 'italic' }}>{item.note || '—'}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
