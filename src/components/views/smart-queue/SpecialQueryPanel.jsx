import { color, space, font } from '../../../constants/design';
import KeymanRejectionsPanel from './KeymanRejectionsPanel';
import IndustryStatusComboPanel from './IndustryStatusComboPanel';
import { OverdueReceptionPanel, OverdueKeymanPanel, ReapproachCandidatesPanel } from './DashboardMigratedPanels';
import { useUrlState } from '../../../hooks/useUrlState';

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

  return (
    <div>
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

      {sub === 'keyman_reject'     && <KeymanRejectionsPanel     setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
      {sub === 'industry_combo'    && <IndustryStatusComboPanel  setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
      {sub === 'overdue_reception' && <OverdueReceptionPanel     setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
      {sub === 'overdue_keyman'    && <OverdueKeymanPanel        setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
      {sub === 'reapproach'        && <ReapproachCandidatesPanel setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
    </div>
  );
}
