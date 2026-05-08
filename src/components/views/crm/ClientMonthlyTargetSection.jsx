import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import { color, space, radius, font } from '../../../constants/design';
import {
  fetchClientMonthlyTargets,
  upsertClientMonthlyTarget,
} from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, currentYearMonth, getMonthRange, formatMonthLabel } from './utils';

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
      onBlur={() => { if (dirty) onSave(val); }}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
      style={{
        width: 60, height: 26, textAlign: 'center',
        border: `1px solid ${dirty ? color.gold : color.border}`,
        borderRadius: radius.sm,
        fontSize: font.size.xs,
        fontFamily: font.family.mono,
        fontVariantNumeric: 'tabular-nums',
        outline: 'none',
        background: isCurrent ? '#FFFBEB' : color.white,
        color: color.navy,
      }}
    />
  );
}

export default function ClientMonthlyTargetSection({ clientId }) {
  const queryClient = useQueryClient();
  const currentYM = useMemo(() => currentYearMonth(), []);
  // 当月から+5ヶ月の6ヶ月分（クライアント詳細では年間計画の確認用に短めに）
  const months = useMemo(() => getMonthRange(currentYM, 0, 5), [currentYM]);
  const fromYM = months[0];
  const toYM = months[months.length - 1];

  // 全期間取得（CRM 月別目標タブと同じキャッシュを使えるよう同じ key にする）
  const { data: targets = [] } = useQuery({
    queryKey: ['crm-monthly-targets', fromYM, toYM],
    queryFn: async () => {
      const { data } = await fetchClientMonthlyTargets(fromYM, toYM);
      return data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!clientId,
  });

  const targetMap = useMemo(() => {
    const map = {};
    targets
      .filter(t => t.client_id === clientId)
      .forEach(t => { map[t.year_month] = t.target_count; });
    return map;
  }, [targets, clientId]);

  const handleSave = async (yearMonth, value) => {
    const num = Math.max(0, Number(value) || 0);
    const { data } = await upsertClientMonthlyTarget(clientId, yearMonth, num);
    if (data) {
      queryClient.invalidateQueries({ queryKey: ['crm-monthly-targets'] });
    }
  };

  if (!clientId) return null;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', rowGap: 6, columnGap: 8, alignItems: 'center' }}>
        {months.map((ym, i) => {
          const isCurrent = ym === currentYM;
          const value = targetMap[ym] ?? '';
          return (
            <div key={ym} style={{ display: 'contents' }}>
              <span style={{
                fontSize: font.size.xs,
                fontFamily: font.family.mono,
                fontVariantNumeric: 'tabular-nums',
                color: isCurrent ? color.gold : color.textMid,
                fontWeight: isCurrent ? font.weight.bold : font.weight.normal,
                textAlign: 'right',
              }}>
                {formatMonthLabel(ym, i > 0 ? months[i - 1] : null)}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CellInput
                  value={value}
                  isCurrent={isCurrent}
                  onSave={v => handleSave(ym, v)}
                />
                <span style={{ fontSize: 10, color: color.textLight }}>件</span>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 9, color: color.textLight }}>
        さらに先の月は CRM &gt; 月別目標タブで一括管理できます
      </div>
    </div>
  );
}
