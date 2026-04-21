import React from 'react';
import { C } from '../../../constants/colors';
import CareerDealCard from './CareerDealCard';

export default function CareerDealsKanbanTab({ deals, stages, onCardClick, onStageChange }) {
  const dealsByStage = stages.reduce((acc, s) => { acc[s.id] = deals.filter(d => d.stage === s.id); return acc; }, {});

  return (
    <div style={{ padding: 16, minHeight: '100%', overflowX: 'auto', background: C.offWhite }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, 190px)`,
        gap: 10,
        minWidth: Math.max(stages.length, 1) * 200,
      }}>
        {stages.map(stage => {
          const list = dealsByStage[stage.id] || [];
          return (
            <div key={stage.id}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', marginBottom: 8,
                background: C.white, border: `1px solid ${C.border}`, borderRadius: 4,
              }}>
                <span style={{ color: C.navy, fontWeight: 600, fontSize: 11 }}>{stage.label}</span>
                <span style={{ color: C.textMid, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>{list.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map(deal => (
                  <CareerDealCard
                    key={deal.id}
                    deal={deal}
                    stages={stages}
                    onClick={() => onCardClick(deal)}
                    onStageChange={newStage => onStageChange(deal.id, newStage)}
                  />
                ))}
                {list.length === 0 && (
                  <div style={{
                    fontSize: 10, color: C.textLight, textAlign: 'center',
                    padding: 14, border: `1px dashed ${C.border}`, borderRadius: 4,
                    background: C.white,
                  }}>なし</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
