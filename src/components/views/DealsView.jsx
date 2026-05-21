import React, { useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { useEngagements } from '../../hooks/useEngagements';
import { useEngagementClients } from '../../hooks/useEngagementClients';
import { useUrlState } from '../../hooks/useUrlState';
import { invokeAdminImpersonateClient } from '../../lib/supabaseWrite';
import ClientSelector from '../common/ClientSelector';
import PageHeader from '../common/PageHeader';
import CallResultsTab from './deals/CallResultsTab';
import AppointmentsTab from './deals/AppointmentsTab';

const TABS = [
  { id: 'calls', label: '架電結果' },
  { id: 'appos', label: '獲得アポ詳細' },
];
const TAB_IDS = TABS.map(t => t.id);

export default function DealsView({ isAdmin = false, currentUser = '' }) {
  const { currentEngagement } = useEngagements();
  const { clients } = useEngagementClients(currentEngagement?.id);

  // ハードリロード/共有URL対応のため URL クエリに同期
  const [selectedClientId, setSelectedClientId] = useUrlState('client', null);
  const [activeTab, setActiveTab] = useUrlState('tab', 'calls', { allowed: TAB_IDS });

  const [impersonating, setImpersonating] = useState(false);

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const handleImpersonate = async () => {
    if (!selectedClient?.id) return;
    setImpersonating(true);
    // 代理ログイン後にクライアントセッションが localStorage を上書きするため、
    // 先に現在の admin セッション (refresh_token) を退避しておく。
    // ClientPortalApp の「社内に戻る」ボタンが setSession() で復元する。
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.refresh_token) {
        localStorage.setItem('spanavi_admin_session_backup', JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          saved_at: Date.now(),
          impersonating_client_id: selectedClient.id,
          impersonating_client_name: selectedClient.name || '',
        }));
      }
    } catch (e) {
      console.warn('admin session backup failed', e);
    }
    const { data, error } = await invokeAdminImpersonateClient(selectedClient.id, '/client');
    setImpersonating(false);
    if (error) {
      const msg = error.message || error.error || 'エラーが発生しました';
      alert('代理ログインに失敗しました: ' + msg);
      return;
    }
    if (data?.error) {
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
    <div style={{ display: 'flex', flexDirection: 'column', background: color.offWhite, animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="案件"
        description="クライアント別 架電・アポ実績"
        style={{ marginBottom: 24 }}
      />

      {/* タブバー */}
      <div style={{
        display: 'flex', padding: '0 20px', borderBottom: `1px solid ${color.border}`,
        background: color.white, gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id} type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: font.size.sm, padding: '10px 16px',
                background: 'transparent', border: 'none',
                borderBottom: active ? `2px solid ${color.gold}` : '2px solid transparent',
                color: active ? color.navy : color.textMid,
                fontWeight: active ? font.weight.semibold : font.weight.normal, marginBottom: -1,
                cursor: 'pointer', fontFamily: font.family.sans,
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleImpersonate}
            disabled={impersonating}
            title={`「${selectedClient.name}」のクライアントポータルを開く（代理ログイン）`}
            style={{
              fontSize: font.size.xs,
              background: impersonating ? color.cream : color.white,
              cursor: impersonating ? 'wait' : 'pointer',
              flexShrink: 0,
              marginRight: 4,
            }}
          >
            {impersonating ? '生成中...' : '代理ログイン →'}
          </Button>
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
            canEditDossier={true}
          />
        )}
      </div>
    </div>
  );
}
