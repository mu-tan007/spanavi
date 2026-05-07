import { C } from '../../../constants/colors';
import { NAVY, GRAY_200, STATUS_LIST, statusStyle } from './utils';

export default function CRMStatusTabs({ statusFilter, setStatusFilter, statusCounts, totalCount }) {
  const baseBtn = {
    padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: "'Noto Sans JP'",
  };

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
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
      {STATUS_LIST.map(st => {
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
}
