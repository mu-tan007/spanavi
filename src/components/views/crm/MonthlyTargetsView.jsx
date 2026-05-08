import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Input } from '../../ui';
import {
  fetchClientMonthlyTargets,
  upsertClientMonthlyTarget,
} from '../../../lib/supabaseWrite';
import { useIsMobile } from '../../../hooks/useIsMobile';
import {
  NAVY, GRAY_200, GRAY_50,
  currentYearMonth, getMonthRange, formatMonthLabel,
} from './utils';

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
        border: `1px solid ${dirty ? color.gold : color.border}`,
        borderRadius: radius.sm,
        fontSize: font.size.sm,
        fontFamily: font.family.mono,
        fontVariantNumeric: 'tabular-nums',
        outline: 'none',
        background: isCurrent ? '#FFFBEB' : color.white,
        color: color.navy,
      }}
    />
  );
}

export default function MonthlyTargetsView({ clientData = [] }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [mobileSelectedYM, setMobileSelectedYM] = useState(null);

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

  // 月別目標は「支援中」ステータスのクライアントのみ表示
  const filtered = clientData.filter(c => {
    if (c.status !== '支援中') return false;
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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4],
        padding: '14px 18px', background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2.5] }}>
          <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>月別目標管理</span>
          <span style={{ fontSize: font.size.sm, color: color.textLight }}>{filtered.length}社 ・ {months.length}ヶ月分</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Input
            size="sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="企業名・業界..."
            fullWidth={false}
            containerStyle={{ width: 180 }}
          />
        </div>
      </div>

      {/* モバイル時: 月選択 + クライアントカード */}
      {isMobile ? (() => {
        const currentSel = mobileSelectedYM || currentYM;
        const monthlyTotal = monthTotals[currentSel] || 0;
        return (
          <div>
            {/* 月セレクタ（横スクロール） */}
            <div style={{
              display: 'flex', gap: 4, marginBottom: space[3],
              overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4,
            }}>
              {months.map((ym, i) => {
                const active = currentSel === ym;
                const isCur = ym === currentYM;
                return (
                  <button
                    key={ym}
                    onClick={() => setMobileSelectedYM(ym)}
                    style={{
                      flexShrink: 0, padding: '6px 12px', borderRadius: radius.md,
                      border: `1px solid ${active ? color.navy : color.border}`,
                      background: active ? color.navy : (isCur ? '#FFFBEB' : color.white),
                      color: active ? color.white : (isCur ? color.gold : color.textMid),
                      fontSize: font.size.sm, fontWeight: font.weight.semibold, cursor: 'pointer',
                      fontFamily: font.family.mono, whiteSpace: 'nowrap',
                    }}
                  >{formatMonthLabel(ym, i > 0 ? months[i - 1] : null)}</button>
                );
              })}
            </div>
            {/* 月合計 */}
            <div style={{
              padding: '10px 14px', marginBottom: space[2],
              background: color.navy, color: color.white, borderRadius: radius.md,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold }}>{currentSel} の月合計</span>
              <span style={{
                fontSize: font.size.lg, fontWeight: font.weight.bold,
                fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums',
              }}>{monthlyTotal} 件</span>
            </div>
            {/* クライアントカード */}
            {filtered.length === 0 ? (
              <div style={{
                padding: '40px 0', textAlign: 'center', color: color.textLight, fontSize: font.size.sm,
                background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
              }}>
                対象クライアントがありません
              </div>
            ) : filtered.map(c => {
              const key = `${c._supaId}_${currentSel}`;
              const value = targetMap[key] ?? '';
              return (
                <div key={c._supaId} style={{
                  background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
                  padding: '10px 12px', marginBottom: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{
                    fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8,
                  }}>{c.company}</span>
                  <CellInput
                    value={value}
                    isCurrent={currentSel === currentYM}
                    onSave={v => handleSave(c._supaId, currentSel, v)}
                  />
                </div>
              );
            })}
          </div>
        );
      })() : (
      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflowX: 'auto', overflowY: 'hidden', background: color.white }}>
        {/* ヘッダー行 */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols,
          padding: '8px 16px', background: color.navy,
          fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.white,
        }}>
          <span>企業名</span>
          {months.map((ym, i) => {
            const isCurrent = ym === currentYM;
            return (
              <span key={ym} style={{
                textAlign: 'center',
                color: isCurrent ? '#FFD66B' : color.white,
                fontWeight: isCurrent ? font.weight.bold : font.weight.semibold,
                fontFamily: font.family.mono,
                fontSize: font.size.xs,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatMonthLabel(ym, i > 0 ? months[i - 1] : null)}
              </span>
            );
          })}
        </div>

        {/* ボディ */}
        {filtered.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
            データがありません
          </div>
        ) : (
          filtered.map((c, i) => (
            <div key={c._supaId || i} style={{
              display: 'grid', gridTemplateColumns: gridCols,
              padding: '6px 16px', fontSize: font.size.sm, alignItems: 'center',
              borderBottom: `1px solid ${color.border}`,
              background: i % 2 === 0 ? color.white : color.gray50,
            }}>
              <span style={{
                fontWeight: font.weight.semibold, color: color.navy,
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
            padding: '8px 16px', fontSize: font.size.sm, alignItems: 'center',
            borderTop: `2px solid ${color.navy}`,
            background: '#F0F4FA',
            fontWeight: font.weight.bold,
            color: color.navy,
          }}>
            <span>合計</span>
            {months.map(ym => {
              const isCurrent = ym === currentYM;
              return (
                <span key={ym} style={{
                  textAlign: 'center',
                  fontFamily: font.family.mono,
                  fontVariantNumeric: 'tabular-nums',
                  color: isCurrent ? color.gold : color.navy,
                }}>
                  {monthTotals[ym] || 0}
                </span>
              );
            })}
          </div>
        )}
      </div>
      )}

      {!isMobile && (
        <div style={{ marginTop: space[3], fontSize: font.size.xs, color: color.textLight }}>
          セルをクリックして数値を入力 → Enter キー or 別セルへフォーカス移動で保存。当月は黄色背景で強調表示。
        </div>
      )}
    </div>
  );
}
