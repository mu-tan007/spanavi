import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';
import { useEngagementClients } from '../../hooks/useEngagementClients';
import ClientSelector from '../common/ClientSelector';
import PageHeader from '../common/PageHeader';
import CallResultsTab from './deals/CallResultsTab';
import AppointmentsTab from './deals/AppointmentsTab';

const TABS = [
  { id: 'calls', label: '架電結果' },
  { id: 'appos', label: '獲得アポ詳細' },
];

export default function DealsView() {
  const { currentEngagement } = useEngagements();
  const { clients } = useEngagementClients(currentEngagement?.id);

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('calls');

  // Ctrl+←/→ でサブタブ切替
  useEffect(() => {
    const ids = TABS.map(t => t.id);
    const cycle = (dir) => setActiveTab(prev => {
      const i = ids.indexOf(prev);
      if (i === -1) return prev;
      return ids[(i + dir + ids.length) % ids.length];
    });
    const onEvt = e => cycle(e.detail.direction);
    const onKey = e => {
      if (!e.ctrlKey) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); cycle(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); cycle(1); }
    };
    window.addEventListener('spanavi-subtab-cycle', onEvt);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('spanavi-subtab-cycle', onEvt);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  if (!currentEngagement) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: C.offWhite, animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="Deals"
        description="架電結果と獲得アポの詳細をクライアント単位で確認"
      />

      {/* タブバー */}
      <div style={{
        display: 'flex', padding: '0 20px', borderBottom: `1px solid ${C.border}`,
        background: C.white, gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id} type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: 12, padding: '10px 16px',
                background: 'transparent', border: 'none',
                borderBottom: active ? `2px solid ${C.gold}` : '2px solid transparent',
                color: active ? C.navy : C.textMid,
                fontWeight: active ? 600 : 400, marginBottom: -1,
                cursor: 'pointer', fontFamily: "'Noto Sans JP',sans-serif",
              }}
            >{tab.label}</button>
          );
        })}
      </div>

      {/* クライアント選択 */}
      <ClientSelector
        clients={clients}
        selectedClientId={selectedClientId}
        onSelect={setSelectedClientId}
      />

      <div style={{ padding: '16px 20px', flex: 1, minHeight: 'calc(100vh - 260px)' }}>
        {activeTab === 'calls' && (
          <CallResultsTab
            engagementId={currentEngagement.id}
            client={selectedClient}
            clients={clients}
          />
        )}
        {activeTab === 'appos' && (
          <AppointmentsTab
            engagementId={currentEngagement.id}
            client={selectedClient}
            clients={clients}
          />
        )}
      </div>
    </div>
  );
}
