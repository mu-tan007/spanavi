import React, { useState } from 'react';
import { C } from '../../../constants/colors';
import { useEngagements } from '../../../hooks/useEngagements';
import { useDealStages } from '../../../hooks/useDealStages';
import { useCareerDeals } from '../../../hooks/useCareerDeals';
import { useTeams } from '../../../hooks/useTeams';
import TeamSelector from '../../common/TeamSelector';
import CareerDealsKanbanTab from './CareerDealsKanbanTab';
import CareerDealsListTab from './CareerDealsListTab';
import CareerDealsLostTab from './CareerDealsLostTab';
import CareerDealsFunnelTab from './CareerDealsFunnelTab';
import CareerDealDetailModal from './CareerDealDetailModal';

const TABS = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'list', label: 'List' },
  { id: 'lost', label: 'Lost Deals' },
  { id: 'funnel', label: 'Funnel Analysis' },
];

export default function CareerDealsView() {
  const { currentEngagement } = useEngagements();
  const { activeStages, stages, loading: stagesLoading } = useDealStages(currentEngagement?.slug);
  const { teams } = useTeams(currentEngagement?.id);

  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [activeTab, setActiveTab] = useState('kanban');
  const [selectedDeal, setSelectedDeal] = useState(null);

  const { deals, loading: dealsLoading, updateDealStage, updateDeal } = useCareerDeals({
    engagementId: currentEngagement?.id,
    teamId: selectedTeamId,
  });

  if (!currentEngagement) return null;
  if (stagesLoading || dealsLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>;
  }

  const openDeals = deals.filter(d => d.closed_status !== 'lost');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: C.offWhite, margin: -28, marginTop: 0, marginBottom: 0 }}>
      <div style={{ padding: '14px 20px 0', background: C.white }}>
        <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>
          スパキャリ · Pipeline
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 2px', color: C.navy, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
          Deals
        </h1>
        <p style={{ fontSize: 11, color: C.textMid, margin: '0 0 12px' }}>
          商談パイプライン — 応募獲得〜契約成立まで
        </p>
      </div>

      <div style={{
        display: 'flex', padding: '0 20px', borderBottom: `1px solid ${C.border}`,
        background: C.white, gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: 12, padding: '10px 16px',
                background: 'transparent', border: 'none',
                borderBottom: active ? `2px solid ${C.gold}` : '2px solid transparent',
                color: active ? C.navy : C.textMid,
                fontWeight: active ? 600 : 400, marginBottom: -1,
                cursor: 'pointer', fontFamily: "'Noto Sans JP',sans-serif",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.navy; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.textMid; }}
            >{tab.label}</button>
          );
        })}
      </div>

      <TeamSelector teams={teams} selectedTeamId={selectedTeamId} onSelect={setSelectedTeamId} />

      <div style={{ flex: 1, minHeight: 'calc(100vh - 260px)' }}>
        {activeTab === 'kanban' && (
          <CareerDealsKanbanTab
            deals={openDeals}
            stages={activeStages}
            onCardClick={setSelectedDeal}
            onStageChange={updateDealStage}
          />
        )}
        {activeTab === 'list' && (
          <CareerDealsListTab deals={deals} stages={stages} onRowClick={setSelectedDeal} />
        )}
        {activeTab === 'lost' && <CareerDealsLostTab deals={deals} />}
        {activeTab === 'funnel' && <CareerDealsFunnelTab deals={deals} stages={stages} />}
      </div>

      {selectedDeal && (
        <CareerDealDetailModal
          deal={selectedDeal}
          stages={stages}
          teams={teams}
          onClose={() => setSelectedDeal(null)}
          onUpdate={updateDeal}
        />
      )}
    </div>
  );
}
