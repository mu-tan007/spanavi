import { useState } from "react";
import { color, radius, font, shadow, alpha, space } from '../../constants/design';
import { Select, DataTable } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useUrlState } from '../../hooks/useUrlState';
import PageHeader from '../common/PageHeader';

const KEYMAN_STATUSES = new Set(['キーマン再コール', '社長再コール', 'keyman_recall']);
const isKeymanRecall = (status) => KEYMAN_STATUSES.has(status);

export default function RecallListView({ callListData, supaRecalls = [], members = [], currentUser = '', isAdmin = false, isManagerRole = false, setCallFlowScreen }) {
  const isMobile = useIsMobile();
  const canSeeAll = isAdmin || isManagerRole;
  const [subTab, setSubTab] = useUrlState('recall_subtab', 'reception');
  const [sortBy, setSortBy] = useState("date");
  const [filterAssignee, setFilterAssignee] = useState(canSeeAll ? '' : currentUser);
  const [assigneeQuery, setAssigneeQuery] = useState(canSeeAll ? '' : currentUser);
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

  const baseRecallItems = canSeeAll ? recallItems : recallItems.filter(item => item.assignee === currentUser);
  const receptionCount = baseRecallItems.filter(item => !isKeymanRecall(item.status)).length;
  const keymanCount = baseRecallItems.filter(item => isKeymanRecall(item.status)).length;
  const subTabFiltered = subTab === 'keyman'
    ? baseRecallItems.filter(item => isKeymanRecall(item.status))
    : baseRecallItems.filter(item => !isKeymanRecall(item.status));
  const filteredRecallItems = (canSeeAll && filterAssignee)
    ? subTabFiltered.filter(item => item.assignee === filterAssignee)
    : subTabFiltered;

  const sorted = [...filteredRecallItems].sort((a, b) => {
    if (sortBy === "date") return (a.recallDate + a.recallTime).localeCompare(b.recallDate + b.recallTime);
    if (sortBy === "assignee") return (a.assignee || "未設定").localeCompare(b.assignee || "未設定");
    return 0;
  });

  const nowDt = new Date();
  const isOverdue = (date, time) => { if (!date) return false; return new Date(`${date}T${time || '00:00'}:00`) <= nowDt; };

  const handleRowClick = (item) => {
    if (setCallFlowScreen && item._source === 'supabase') {
      const _list = callListData.find(l => l._supaId === item._supaRecord?.list_id);
      if (_list) {
        setCallFlowScreen({ list: _list, defaultItemId: item._supaRecord.item_id, defaultListMode: false, singleItemMode: true });
      }
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease", height: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="再架電"
        description="受付再コール・キーマン再コールの管理"
        style={{ marginBottom: space[3] }}
      />

      {/* サブタブ (受付再コール / キーマン再コール) */}
      <div style={{ display: 'flex', gap: 0, marginBottom: space[4], flexShrink: 0 }}>
        {[
          { id: 'reception', label: '受付再コール', count: receptionCount },
          { id: 'keyman', label: 'キーマン再コール', count: keymanCount },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              padding: '10px 24px', fontSize: font.size.sm, fontWeight: font.weight.bold,
              cursor: 'pointer', fontFamily: font.family.sans,
              border: `1px solid ${color.border}`,
              borderBottom: subTab === tab.id ? `2px solid ${color.navy}` : '2px solid transparent',
              background: subTab === tab.id ? color.white : color.cream,
              color: subTab === tab.id ? color.navy : color.textLight,
              borderRadius: `${radius.md}px ${radius.md}px 0 0`, marginRight: -1,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <span>{tab.label}</span>
            <span style={{
              fontSize: font.size.xs - 1, fontWeight: font.weight.bold,
              color: subTab === tab.id ? color.white : color.textLight,
              background: subTab === tab.id ? color.navy : alpha(color.navy, 0.08),
              borderRadius: radius.pill, padding: '1px 8px', minWidth: 22, textAlign: 'center',
            }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ツールバー (担当者フィルター + ソート) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>
            {subTab === 'keyman' ? 'キーマン再コール一覧' : '受付再コール一覧'}
          </span>
          <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
            {sorted.length}{filterAssignee ? `/${subTabFiltered.length}` : ''}件
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

      {/* DataTable */}
      <DataTable
        ariaLabel={subTab === 'keyman' ? 'キーマン再コール一覧' : '受付再コール一覧'}
        height="100%"
        rows={sorted}
        rowKey={(_, idx) => idx}
        emptyMessage={subTab === 'keyman' ? 'キーマン再コール予定はありません' : '受付再コール予定はありません'}
        onRowClick={handleRowClick}
        style={{ flex: 1, minHeight: 0 }}
        rowAccent={(item) => isOverdue(item.recallDate, item.recallTime) ? 'danger' : null}
        rowBackground={(item, idx) => {
          const past = isOverdue(item.recallDate, item.recallTime);
          if (past) return alpha(color.danger, 0.05);
          return idx % 2 === 1 ? color.cream : color.white;
        }}
        columns={[
          {
            key: 'datetime', label: '予定日時', width: 90, align: 'right',
            render: (item) => {
              const past = isOverdue(item.recallDate, item.recallTime);
              return (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: font.weight.bold, color: past ? color.danger : color.navy, fontFamily: font.family.mono, fontSize: font.size.xs }}>{item.recallTime || '--:--'}</div>
                  <div style={{ fontSize: 9, color: color.textLight }}>{item.recallDate ? item.recallDate.slice(5).replace('-', '/') : '日時未設定'}</div>
                </div>
              );
            },
          },
          {
            key: 'company', label: '企業名', width: 280, align: 'left',
            cellStyle: { whiteSpace: 'normal', overflow: 'visible' },
            render: (item) => (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: font.weight.medium, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</div>
                {item._list_name && (
                  <div style={{ fontSize: 9, color: color.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {item._list_name}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'rep', label: '代表者', width: 130, align: 'left',
            cellStyle: { color: color.textMid, fontSize: 10 },
          },
          {
            key: 'phone', label: '電話番号', width: 110, align: 'left',
            cellStyle: { fontFamily: font.family.mono, fontSize: 10, color: color.navy },
          },
          {
            key: 'assignee', label: '担当', width: 130, align: 'left',
            cellStyle: { fontSize: 10, color: color.textMid },
            render: (item) => item.assignee || '—',
          },
          {
            key: 'setter', label: '設定者', width: 130, align: 'left',
            cellStyle: { fontSize: 10, color: color.textLight },
            render: (item) => item.setter || '—',
          },
          {
            key: 'memo', label: 'メモ', width: 220, align: 'left',
            cellStyle: { fontSize: 10, color: color.textMid },
            render: (item) => item.note || '—',
          },
        ]}
      />
    </div>
  );
}
