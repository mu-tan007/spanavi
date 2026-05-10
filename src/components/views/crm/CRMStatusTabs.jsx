import { C } from '../../../constants/colors';
import { NAVY, GRAY_200, STATUS_GROUPS, statusStyle, statusCategoryStyle } from './utils';

export default function CRMStatusTabs({ statusFilter, setStatusFilter, statusCounts, totalCount }) {
  const baseBtn = {
    padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: "'Noto Sans JP'",
  };

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <button
        onClick={() => setStatusFilter('all')}
        style={{
          ...baseBtn,
          border: '1px solid ' + (statusFilter === 'all' ? NAVY : GRAY_200),
          background: statusFilter === 'all' ? NAVY : '#fff',
          color: statusFilter === 'all' ? '#fff' : C.textMid,
        }}
      >
        全て <span style={{ fontSize: 10, opacity: 0.7 }}>{totalCount}</span>
      </button>

      {STATUS_GROUPS.map(group => {
        const cs = statusCategoryStyle(group.category);
        return (
          <div
            key={group.category}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px 4px 6px',
              borderRadius: 4, border: `1px dashed ${cs.color}`,
              background: cs.bg,
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
              color: cs.color, padding: '1px 5px', borderRadius: 2,
              background: '#fff', border: `1px solid ${cs.color}`,
            }}>{group.category}</span>
            {group.statuses.map(st => {
              const sc = statusStyle(st);
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    ...baseBtn,
                    border: '1px solid ' + (active ? sc.color : GRAY_200),
                    background: active ? sc.bg : '#fff',
                    color: active ? sc.color : C.textMid,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }}></span>
                  {st} <span style={{ fontSize: 10, opacity: 0.7 }}>{statusCounts[st] || 0}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
