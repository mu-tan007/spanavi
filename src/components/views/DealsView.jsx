import React, { useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';
import { useEngagementClients } from '../../hooks/useEngagementClients';
import { invokeAdminImpersonateClient } from '../../lib/supabaseWrite';
import ClientSelector from '../common/ClientSelector';
import PageHeader from '../common/PageHeader';
import CallResultsTab from './deals/CallResultsTab';
import AppointmentsTab from './deals/AppointmentsTab';

const TABS = [
  { id: 'calls', label: '架電結果' },
  { id: 'appos', label: '獲得アポ詳細' },
];

export default function DealsView({ isAdmin = false, currentUser = '' }) {
  const { currentEngagement } = useEngagements();
  const { clients } = useEngagementClients(currentEngagement?.id);

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('calls');
  const [impersonating, setImpersonating] = useState(false);

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const handleImpersonate = async () => {
    if (!selectedClient?.id) return;
    setImpersonating(true);
    const { data, error } = await invokeAdminImpersonateClient(selectedClient.id, '/client');
    setImpersonating(false);
    if (error) {
      const msg = error.message || error.error || 'エラーが発生しました';
      alert('代理ログインに失敗しました: ' + msg);
      return;
    }
    if (data?.error) {
      // Edge Function 側からの拒否（権限なし、auth_user_id なし等）
      alert('代理ログインに失敗しました: ' + data.error);
      return;
    }
    if (data?.url) {
      // 新タブで開く（同一オリジンなので、開いた先でセッションが切り替わる点に注意）
      window.open(data.url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!currentEngagement) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: C.offWhite, animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="Deals"
        description="クライアント別 架電・アポ実績"
        style={{ marginBottom: 24 }}
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

      {/* クライアント選択 + 代理ログインボタン */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', padding: '0 20px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ClientSelector
            clients={clients}
            selectedClientId={selectedClientId}
            onSelect={setSelectedClientId}
          />
        </div>
        {isAdmin && selectedClient && (
          <button
            onClick={handleImpersonate}
            disabled={impersonating}
            title={`「${selectedClient.name}」のクライアントポータルを開く（代理ログイン）`}
            style={{
              padding: '8px 14px', borderRadius: 4,
              border: '1px solid ' + C.navy,
              background: impersonating ? C.cream : C.white,
              color: C.navy, fontSize: 11, fontWeight: 600,
              cursor: impersonating ? 'wait' : 'pointer',
              fontFamily: "'Noto Sans JP'",
              whiteSpace: 'nowrap',
              flexShrink: 0,
              marginRight: 4,
            }}
          >
            {impersonating ? '生成中...' : '代理ログイン →'}
          </button>
        )}
      </div>

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
