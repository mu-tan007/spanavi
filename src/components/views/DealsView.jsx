import React, { useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';
import { useDealStages } from '../../hooks/useDealStages';
import { useDeals } from '../../hooks/useDeals';
import { useEngagementClients } from '../../hooks/useEngagementClients';
import ClientSelector from '../common/ClientSelector';
import DealsKanbanTab from './deals/DealsKanbanTab';
import DealsListTab from './deals/DealsListTab';
import DealsLostTab from './deals/DealsLostTab';
import DealsFunnelTab from './deals/DealsFunnelTab';
import DealsClientSharingTab from './deals/DealsClientSharingTab';
import DealDetailModal from './deals/DealDetailModal';
import PageHeader from '../common/PageHeader';

const TABS = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'list', label: 'List' },
  { id: 'lost', label: 'Lost Deals' },
  { id: 'funnel', label: 'Funnel Analysis' },
  { id: 'sharing', label: 'Client Sharing' },
];

export default function DealsView() {
  const { currentEngagement } = useEngagements();
  const { activeStages, stages, loading: stagesLoading } = useDealStages(currentEngagement?.slug);
  const { clients } = useEngagementClients(currentEngagement?.id);

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('kanban');
  const [selectedDeal, setSelectedDeal] = useState(null);

  const { deals, loading: dealsLoading, updateDealStage, updateDeal } = useDeals({
    engagementId: currentEngagement?.id,
    clientId: selectedClientId,
  });

  if (!currentEngagement) return null;
  if (stagesLoading || dealsLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>
        読み込み中...
      </div>
    );
  }

  // Kanbanは open のみ、他タブは全件 (Lost含む)
  const openDeals = deals.filter(d => d.closed_status !== 'lost');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: C.offWhite }}>
      <PageHeader
        compact
        eyebrow="Sourcing · Pipeline"
        title="Deals"
        description="商談パイプライン — アポ獲得後の進捗管理"
      />

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
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <ClientSelector
        clients={clients}
        selectedClientId={selectedClientId}
        onSelect={setSelectedClientId}
      />

      <div style={{ flex: 1, minHeight: 'calc(100vh - 260px)' }}>
        {activeTab === 'kanban' && (
          <DealsKanbanTab
            deals={openDeals}
            stages={activeStages}
            onCardClick={setSelectedDeal}
            onStageChange={updateDealStage}
          />
        )}
        {activeTab === 'list' && (
          <DealsListTab deals={deals} stages={stages} onRowClick={setSelectedDeal} />
        )}
        {activeTab === 'lost' && <DealsLostTab deals={deals} />}
        {activeTab === 'funnel' && <DealsFunnelTab deals={deals} stages={stages} />}
        {activeTab === 'sharing' && <DealsClientSharingTab />}
      </div>

      {selectedDeal && (
        <DealDetailModal
          deal={selectedDeal}
          stages={stages}
          onClose={() => setSelectedDeal(null)}
          onUpdate={updateDeal}
        />
      )}
    </div>
  );
}
