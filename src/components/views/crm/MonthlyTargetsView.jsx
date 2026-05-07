import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import {
  fetchClientMonthlyTargets,
  upsertClientMonthlyTarget,
} from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

// 当月の 'YYYY-MM' を取得
function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 中心月から前後の月配列を生成
function getMonthRange(centerYM, monthsBefore, monthsAfter) {
  const [y, m] = centerYM.split('-').map(Number);
  const result = [];
  for (let i = -monthsBefore; i <= monthsAfter; i++) {
    const date = new Date(y, m - 1 + i, 1);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    result.push(`${yy}-${mm}`);
  }
  return result;
}

// '2026-05' → '5月' / 年が変わるところは '2027/1月'
function formatMonthLabel(ym, prevYm) {
  const [y, m] = ym.split('-');
  const ym2 = ym.slice(5).replace(/^0/, '') + '月';
  if (!prevYm) return `${y.slice(2)}/${ym2}`;
  if (prevYm.slice(0, 4) !== y) return `${y.slice(2)}/${ym2}`;
  return ym2;
}

function CellInput({ value, isCurrent, onSave }) {
  const [val, setVal] = useState(value ?? '');
  useEffect(() => { setVal(value ?? ''); }, [value]);

  const dirty = String(val) !== String(value ?? '');

  return (
    <input
      type="number"
      min={0}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        if (dirty) onSave(val);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.target.blur();
      }}
      style={{
        width: 50, height: 28, textAlign: 'center',
        border: '1px solid ' + (dirty ? C.gold : GRAY_200),
        borderRadius: 3,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        fontVariantNumeric: 'tabular-nums',
        outline: 'none',
        background: isCurrent ? '#FFFBEB' : '#fff',
        color: NAVY,
      }}
    />
  );
}

export default function MonthlyTargetsView({ clientData = [] }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const currentYM = useMemo(() => currentYearMonth(), []);
  // 前月 〜 11ヶ月先までの13ヶ月を表示
  const months = useMemo(() => getMonthRange(currentYM, 1, 11), [currentYM]);
  const fromYM = months[0];
  const toYM = months[months.length - 1];

  const { data: targets = [] } = useQuery({
    queryKey: ['crm-monthly-targets', fromYM, toYM],
    queryFn: async () => {
      const { data } = await fetchClientMonthlyTargets(fromYM, toYM);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const targetMap = useMemo(() => {
    const map = {};
    targets.forEach(t => {
      map[`${t.client_id}_${t.year_month}`] = t.target_count;
    });
    return map;
  }, [targets]);

  // 集計: 各月の合計
  const monthTotals = useMemo(() => {
    const totals = {};
    months.forEach(ym => { totals[ym] = 0; });
    targets.forEach(t => {
      if (totals[t.year_month] !== undefined) totals[t.year_month] += t.target_count;
    });
    return totals;
  }, [targets, months]);

  const filtered = clientData.filter(c => {
    if (search && !c.company.includes(search) && !c.industry.includes(search)) return false;
    return true;
  });

  const handleSave = async (clientId, yearMonth, value) => {
    const num = Math.max(0, Number(value) || 0);
    const { data } = await upsertClientMonthlyTarget(clientId, yearMonth, num);
    if (data) {
      queryClient.invalidateQueries({ queryKey: ['crm-monthly-targets', fromYM, toYM] });
    }
  };

  // 列幅: 企業名 240px, 月セル各60px
  const gridCols = `240px repeat(${months.length}, 60px)`;

  return (
    <div>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
        padding: '14px 18px', background: '#fff', borderRadius: 4,
        border: '1px solid ' + GRAY_200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>月別目標管理</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{filtered.length}社 ・ {months.length}ヶ月分</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="企業名・業界..."
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid ' + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', width: 180 }}
          />
        </div>
      </div>

      {/* テーブル */}
      <div style={{ border: '1px solid ' + GRAY_200, borderRadius: 4, overflowX: 'auto', overflowY: 'hidden', background: '#fff' }}>
        {/* ヘッダー行 */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols,
          padding: '8px 16px', background: NAVY,
          fontSize: 11, fontWeight: 600, color: '#fff',
        }}>
          <span>企業名</span>
          {months.map((ym, i) => {
            const isCurrent = ym === currentYM;
            return (
              <span key={ym} style={{
                textAlign: 'center',
                color: isCurrent ? '#FFD66B' : '#fff',
                fontWeight: isCurrent ? 700 : 600,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatMonthLabel(ym, i > 0 ? months[i - 1] : null)}
              </span>
            );
          })}
        </div>

        {/* ボディ */}
        {filtered.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: C.textLight, fontSize: 12 }}>
            データがありません
          </div>
        ) : (
          filtered.map((c, i) => (
            <div key={c._supaId || i} style={{
              display: 'grid', gridTemplateColumns: gridCols,
              padding: '6px 16px', fontSize: 11, alignItems: 'center',
              borderBottom: '1px solid ' + GRAY_200,
              background: i % 2 === 0 ? '#fff' : GRAY_50,
            }}>
              <span style={{
                fontWeight: 600, color: NAVY,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {c.company}
              </span>
              {months.map(ym => {
                const key = `${c._supaId}_${ym}`;
                const value = targetMap[key] ?? '';
                return (
                  <span key={ym} style={{ textAlign: 'center' }}>
                    <CellInput
                      value={value}
                      isCurrent={ym === currentYM}
                      onSave={v => handleSave(c._supaId, ym, v)}
                    />
                  </span>
                );
              })}
            </div>
          ))
        )}

        {/* フッター: 月合計 */}
        {filtered.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: gridCols,
            padding: '8px 16px', fontSize: 11, alignItems: 'center',
            borderTop: '2px solid ' + NAVY,
            background: '#F0F4FA',
            fontWeight: 700,
            color: NAVY,
          }}>
            <span>合計</span>
            {months.map(ym => {
              const isCurrent = ym === currentYM;
              return (
                <span key={ym} style={{
                  textAlign: 'center',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontVariantNumeric: 'tabular-nums',
                  color: isCurrent ? C.gold : NAVY,
                }}>
                  {monthTotals[ym] || 0}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: C.textLight }}>
        セルをクリックして数値を入力 → Enter キー or 別セルへフォーカス移動で保存。当月は黄色背景で強調表示。
      </div>
    </div>
  );
}
