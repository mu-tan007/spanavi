import { useMemo } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import KeymanRejectionsPanel from './KeymanRejectionsPanel';
import IndustryStatusComboPanel from './IndustryStatusComboPanel';
import { OverdueReceptionPanel, OverdueKeymanPanel, ReapproachCandidatesPanel } from './DashboardMigratedPanels';
import { useUrlState } from '../../../hooks/useUrlState';
import { useEngagements } from '../../../hooks/useEngagements';
import { FilterButton, salesAgencyEngagementOptions } from './smartQueueHelpers';

const SUBTABS = [
  { value: 'keyman_reject',     label: '① キーマン断り一覧' },
  { value: 'industry_combo',    label: '② 業種×ステータス' },
  { value: 'overdue_reception', label: '③ 受付再コール超過' },
  { value: 'overdue_keyman',    label: '④ キーマン再コール超過' },
  { value: 'reapproach',        label: '⑤ 再アプローチ候補' },
];

export default function SpecialQueryPanel({ setCallFlowScreen, callListData }) {
  const [sub, setSub] = useUrlState('sq_sub', 'keyman_reject', {
    allowed: ['keyman_reject', 'industry_combo', 'overdue_reception', 'overdue_keyman', 'reapproach'],
  });
  const [categoryId, setCategoryId] = useUrlState('sq_cat', null);
  const [engIdsRaw, setEngIdsRaw]   = useUrlState('sq_eng', '', {}); // CSV
  const engIds = useMemo(() => (engIdsRaw ? engIdsRaw.split(',').filter(Boolean) : []), [engIdsRaw]);
  const setEngIds = (next) => setEngIdsRaw(next.length === 0 ? '' : next.join(','));

  const { engagements: allEngagements, categories: allCategories } = useEngagements();
  const categoryOptions = useMemo(
    () => (allCategories || []).slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [allCategories]
  );
  const salesAgencyEngagements = useMemo(() => salesAgencyEngagementOptions(allEngagements), [allEngagements]);

  // 商材選択時は配下の engagement のみ表示
  const visibleEngagements = useMemo(() => {
    if (!categoryId) return salesAgencyEngagements;
    return salesAgencyEngagements.filter(e => {
      const eng = (allEngagements || []).find(x => x.id === e.id);
      return eng?.category_id === categoryId;
    });
  }, [categoryId, salesAgencyEngagements, allEngagements]);

  // 商材未選択時は同名 engagement (=商材違いで複数存在) を1ボタンに集約。
  // 商材選択時は1商材1 engagement なのでそのまま。
  const typeButtons = useMemo(() => {
    if (categoryId) {
      return visibleEngagements.map(e => ({ key: e.id, label: e.name, ids: [e.id] }));
    }
    const groups = new Map();
    for (const e of visibleEngagements) {
      if (!groups.has(e.name)) groups.set(e.name, { key: e.name, label: e.name, ids: [] });
      groups.get(e.name).ids.push(e.id);
    }
    return Array.from(groups.values());
  }, [visibleEngagements, categoryId]);

  const toggleEngGroup = (ids) => {
    const allSelected = ids.every(id => engIds.includes(id));
    if (allSelected) {
      setEngIds(engIds.filter(x => !ids.includes(x)));
    } else {
      const next = new Set(engIds);
      ids.forEach(id => next.add(id));
      setEngIds(Array.from(next));
    }
  };

  // 各サブパネルに渡す共通フィルタ
  const filterProps = { categoryId, engIds, allEngagements };

  return (
    <div>
      {/* 共通フィルタ: 商材・タイプ */}
      <div style={{
        background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
        padding: '10px 16px', marginBottom: space[3],
        display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>商材:</span>
        <FilterButton active={!categoryId} onClick={() => setCategoryId(null)}>全て</FilterButton>
        {categoryOptions.map(c => (
          <FilterButton key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</FilterButton>
        ))}

        <span style={{ color: color.border }}>|</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>タイプ:</span>
        <FilterButton active={engIds.length === 0} onClick={() => setEngIds([])}>全て</FilterButton>
        {typeButtons.map(opt => (
          <FilterButton
            key={opt.key}
            active={opt.ids.some(id => engIds.includes(id))}
            onClick={() => toggleEngGroup(opt.ids)}
          >{opt.label}</FilterButton>
        ))}
      </div>

      {/* サブタブ */}
      <div style={{
        display: 'flex', gap: space[1], marginBottom: space[3],
        borderBottom: `1px solid ${color.border}`, flexWrap: 'wrap',
      }}>
        {SUBTABS.map(t => {
          const active = sub === t.value;
          return (
            <button key={t.value} onClick={() => setSub(t.value)} style={{
              padding: '8px 16px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${active ? color.navy : 'transparent'}`,
              fontSize: font.size.xs,
              fontWeight: active ? font.weight.bold : font.weight.semibold,
              color: active ? color.navy : color.textMid, cursor: 'pointer',
              fontFamily: font.family.sans, transition: 'all 0.12s', marginBottom: -1,
            }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = color.navy; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = color.textMid; }}
            >{t.label}</button>
          );
        })}
      </div>

      {sub === 'keyman_reject'     && <KeymanRejectionsPanel     setCallFlowScreen={setCallFlowScreen} callListData={callListData} {...filterProps} />}
      {sub === 'industry_combo'    && <IndustryStatusComboPanel  setCallFlowScreen={setCallFlowScreen} callListData={callListData} {...filterProps} />}
      {sub === 'overdue_reception' && <OverdueReceptionPanel     setCallFlowScreen={setCallFlowScreen} callListData={callListData} {...filterProps} />}
      {sub === 'overdue_keyman'    && <OverdueKeymanPanel        setCallFlowScreen={setCallFlowScreen} callListData={callListData} {...filterProps} />}
      {sub === 'reapproach'        && <ReapproachCandidatesPanel setCallFlowScreen={setCallFlowScreen} callListData={callListData} {...filterProps} />}
    </div>
  );
}
