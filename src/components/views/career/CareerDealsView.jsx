import React, { useState } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
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
    return <div style={{ padding: space[10], textAlign: 'center', color: color.textMid }}>読み込み中...</div>;
  }

  const openDeals = deals.filter(d => d.closed_status !== 'lost');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: color.offWhite, margin: -28, marginTop: 0, marginBottom: 0 }}>
      <div style={{ padding: '14px 20px 0', background: color.white }}>
        <div style={{ fontSize: font.size.xs - 1, color: color.textLight, letterSpacing: font.letterSpacing.widest, textTransform: 'uppercase', marginBottom: 2 }}>
          スパキャリ · Pipeline
        </div>
        <h1 style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, margin: '0 0 2px', color: color.navy, fontFamily: font.family.display }}>
          Deals
        </h1>
        <p style={{ fontSize: font.size.xs, color: color.textMid, margin: '0 0 12px' }}>
          商談パイプライン — 応募獲得〜契約成立まで
        </p>
      </div>

      <div style={{
        display: 'flex', padding: '0 20px', borderBottom: `1px solid ${color.border}`,
        background: color.white, gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: font.size.sm, padding: '10px 16px',
                background: 'transparent', border: 'none',
                borderBottom: active ? `2px solid ${color.gold}` : '2px solid transparent',
                color: active ? color.navy : color.textMid,
                fontWeight: active ? font.weight.semibold : font.weight.normal, marginBottom: -1,
                cursor: 'pointer', fontFamily: font.family.sans,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = color.navy; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = color.textMid; }}
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
