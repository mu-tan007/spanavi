import React, { useState } from 'react';
import { C } from '../../constants/colors';
import PageHeader from '../common/PageHeader';
import CallResultsTab from '../views/deals/CallResultsTab';
import AppointmentsTab from '../views/deals/AppointmentsTab';

const TABS = [
  { id: 'calls', label: '架電結果' },
  { id: 'appos', label: '獲得アポ詳細' },
];

// クライアント向け最小 Deals ページ。client はサーバー側で RLS により制約済み。
export default function ClientDealsView({ client }) {
  const [activeTab, setActiveTab] = useState('calls');

  // Ctrl+←/→ は事業タブ切替に統一されたため subtab 切替ショートカットは廃止

  if (!client) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: C.offWhite, animation: 'fadeIn 0.3s ease', borderRadius: 4, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <PageHeader
        bleed={false}
        title="Deals"
        description={`${client.name} の架電結果と獲得アポの詳細`}
      />

      <div style={{
        display: 'flex', padding: '0 20px', borderBottom: `1px solid ${C.border}`,
        background: C.white, gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
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

      <div style={{ padding: '16px 20px', minHeight: 'calc(100vh - 220px)' }}>
        {activeTab === 'calls' && <CallResultsTab client={{ id: client.id, name: client.name }} />}
        {activeTab === 'appos' && <AppointmentsTab client={{ id: client.id, name: client.name }} />}
      </div>
    </div>
  );
}
