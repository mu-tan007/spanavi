import { useMemo } from 'react';
import { C } from '../../../constants/colors';

const NAVY = '#0D2247';

const THRESHOLD = 500; // 進捗率500%以上で「追加リスト投入推奨」

export default function ListAlert({ callListData = [] }) {
  const flagged = useMemo(() => {
    return (callListData || [])
      .filter(l => !l.is_archived)
      .filter(l => (l.call_progress_pct || 0) >= THRESHOLD)
      .sort((a, b) => (b.call_progress_pct || 0) - (a.call_progress_pct || 0));
  }, [callListData]);

  if (flagged.length === 0) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C', borderBottom: '2px solid #EF4444', paddingBottom: 6, marginBottom: 14 }}>
        追加リスト投入推奨 <span style={{ fontSize: 10, fontWeight: 500, color: C.textLight, marginLeft: 8 }}>進捗率 {THRESHOLD}% 以上（再架電頻度が高く、新規接触機会が少ない状態）</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
        {flagged.map(l => (
          <div
            key={l.id || l._supaId}
            style={{
              background: '#FEF2F2', border: '1px solid #FCA5A5', borderLeft: '4px solid #EF4444',
              borderRadius: 4, padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.name || '(名称なし)'}
                </div>
                <div style={{ fontSize: 10, color: C.textMid, marginTop: 2 }}>
                  {l.client || l.industry || ''} {typeof l.companyCount === 'number' ? `・${l.companyCount}社` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: '#B91C1C', fontWeight: 700 }}>進捗率</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#B91C1C', fontFamily: "'JetBrains Mono'", fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(l.call_progress_pct || 0)}<span style={{ fontSize: 12, fontWeight: 600 }}>%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
