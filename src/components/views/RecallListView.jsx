import { useState } from "react";
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { dialPhone } from '../../utils/phone';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import { useIsMobile } from '../../hooks/useIsMobile';
import PageHeader from '../common/PageHeader';

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

export default function RecallListView({ callListData, supaRecalls = [], members = [], currentUser = '', isAdmin = false, isManagerRole = false, setCallFlowScreen }) {
  const isMobile = useIsMobile();
  const canSeeAll = isAdmin || isManagerRole;
  const [sortBy, setSortBy] = useState("date");
  const [filterAssignee, setFilterAssignee] = useState(canSeeAll ? '' : currentUser);
  const [assigneeQuery, setAssigneeQuery] = useState(canSeeAll ? '' : currentUser);
  const [showAssigneeSugg, setShowAssigneeSugg] = useState(false);

  const {
    columns,
    gridTemplateColumns,
    contentMinWidth,
    onResizeStart,
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

  // 管理者・チームリーダーは全員分表示、一般ユーザーは自分の分のみ
  const baseRecallItems = canSeeAll ? recallItems : recallItems.filter(item => item.assignee === currentUser);
  const filteredRecallItems = (canSeeAll && filterAssignee)
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

  const headerLabels = ['予定日時', '企業名', '代表者', '電話番号', '種別', '担当', '設定者', 'メモ'];

  return (
    <div style={{ animation: "fadeIn 0.3s ease", height: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        eyebrow="Sourcing · Recall"
        title="Recall"
        description="再コール・社長お断り14日経過の管理"
        style={{ marginBottom: 24 }}
      />
      <Card padding="none" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{
          padding: isMobile ? '8px 10px' : '10px 14px',
          borderBottom: `1px solid ${color.borderLight}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>再コール一覧</span>
            <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
              {sorted.length}{filterAssignee ? `/${baseRecallItems.length}` : ''}件
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 担当者フィルター combobox（管理者・チームリーダーのみ） */}
            {canSeeAll && <div style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: `1px solid ${color.navy}`, borderRadius: radius.lg, background: color.white,
              }}>
                {filterAssignee && (
                  <div style={{
                    background: color.navy, color: color.white,
                    fontSize: font.size.xs - 1, fontWeight: font.weight.bold,
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
                  style={{
                    padding: '6px 10px',
                    borderRadius: radius.lg,
                    background: 'transparent',
                    border: 'none',
                    color: color.textDark,
                    fontSize: font.size.xs,
                    fontFamily: font.family.sans,
                    outline: 'none',
                    minWidth: 130,
                  }}
                />
                {filterAssignee && (
                  <button onMouseDown={handleAssigneeClear} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: color.textLight, padding: '4px 8px', fontSize: font.size.base, lineHeight: 1,
                  }}>✕</button>
                )}
              </div>
              {showAssigneeSugg && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                  background: color.white, border: `1px solid ${alpha(color.navy, 0.25)}`,
                  borderRadius: radius.lg, boxShadow: shadow.md,
                  zIndex: 200, maxHeight: 200, overflowY: 'auto', minWidth: '100%',
                }}>
                  <div
                    onMouseDown={handleAssigneeClear}
                    style={{
                      padding: '7px 12px', fontSize: font.size.xs, color: color.navy,
                      cursor: 'pointer', fontWeight: font.weight.semibold,
                      borderBottom: `1px solid ${color.borderLight}`,
                      background: !filterAssignee ? alpha(color.navy, 0.03) : 'transparent',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = alpha(color.navy, 0.06); }}
                    onMouseLeave={e => { e.currentTarget.style.background = !filterAssignee ? alpha(color.navy, 0.03) : 'transparent'; }}
                  >
                    全員（全件表示）
                  </div>
                  {assigneeSuggestions.map(m => (
                    <div
                      key={m}
                      onMouseDown={() => handleAssigneeSelect(m)}
                      style={{
                        padding: '7px 12px', fontSize: font.size.xs, color: color.navy,
                        cursor: 'pointer',
                        background: m === filterAssignee ? alpha(color.navy, 0.08) : 'transparent',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = alpha(color.navy, 0.12); }}
                      onMouseLeave={e => { e.currentTarget.style.background = m === filterAssignee ? alpha(color.navy, 0.08) : 'transparent'; }}
                    >
                      {m}
                    </div>
                  ))}
                  {assigneeSuggestions.length === 0 && (
                    <div style={{ padding: '7px 12px', fontSize: font.size.xs, color: color.textLight }}>候補なし</div>
                  )}
                </div>
              )}
            </div>}
            {/* ソート */}
            <Select
              size="sm"
              fullWidth={false}
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              options={[
                { value: 'date', label: '日時順' },
                { value: 'assignee', label: '担当者別' },
              ]}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ minWidth: contentMinWidth }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: color.textLight, fontSize: font.size.base }}>再コール予定はありません</div>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns,
                padding: isMobile ? '6px 10px' : '8px 14px',
                background: color.navy,
                borderBottom: `1px solid ${color.border}`,
                borderLeft: '3px solid transparent',
                fontSize: isMobile ? 10 : font.size.xs,
                fontWeight: font.weight.semibold, color: color.white,
                verticalAlign: 'middle', flexShrink: 0,
              }}>
                {headerLabels.map((label, idx) => (
                  <span
                    key={columns[idx].key}
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
                          setCallFlowScreen({ list: _list, defaultItemId: item._supaRecord.item_id, defaultListMode: false, singleItemMode: true });
                          return;
                        }
                      }
                    }}
                    style={{
                      display: 'grid', gridTemplateColumns,
                      padding: isMobile ? '6px 10px' : '8px 14px',
                      fontSize: isMobile ? 10 : font.size.xs,
                      alignItems: 'center',
                      borderBottom: `1px solid ${color.border}`,
                      borderLeft: '3px solid transparent',
                      background: past ? alpha(color.danger, 0.05) : i % 2 === 0 ? color.white : color.cream,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = alpha(color.navyLight, 0.08); e.currentTarget.style.borderLeft = `3px solid ${color.navy}`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = past ? alpha(color.danger, 0.05) : 'transparent'; e.currentTarget.style.borderLeft = '3px solid transparent'; }}
                    >
                    <div style={{ textAlign: columns[0].align }}>
                      <div style={{ fontWeight: font.weight.bold, color: past ? color.danger : color.navy, fontFamily: font.family.mono, fontSize: font.size.xs }}>{item.recallTime || '--:--'}</div>
                      <div style={{ fontSize: 9, color: color.textLight }}>{item.recallDate ? item.recallDate.slice(5).replace('-', '/') : '日時未設定'}</div>
                    </div>
                    <div style={{ minWidth: 0, textAlign: columns[1].align }}>
                      <div style={{ fontWeight: font.weight.medium, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</div>
                      {item._list_name && (
                        <div style={{ fontSize: 9, color: color.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {item._list_name}
                        </div>
                      )}
                    </div>
                    <span style={{ color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, textAlign: columns[2].align }}>{item.representative}</span>
                    <span style={{ fontFamily: font.family.mono, fontSize: 10, color: color.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: columns[3].align }}>{item.phone}</span>
                    <div style={{ display: 'flex', justifyContent: columns[4].align === 'left' ? 'flex-start' : columns[4].align === 'right' ? 'flex-end' : 'center', width: '100%' }}>
                      <Badge variant="primary" size="sm">
                        {item.status === 'ceo_recall' || item.status === '社長再コール' ? '社長' : '受付'}
                      </Badge>
                    </div>
                    <span style={{ fontSize: 10, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: columns[5].align }}>{item.assignee || '—'}</span>
                    <span style={{ fontSize: 10, color: color.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: columns[6].align }}>{item.setter || '—'}</span>
                    <span title={item.note || ''} style={{ fontSize: 10, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: item.note ? 'normal' : 'italic', textAlign: columns[7].align }}>{item.note || '—'}</span>
                  </div>
                );
              })}
            </>
          )}
          </div>
        </div>
      </Card>
    </div>
  );
}
