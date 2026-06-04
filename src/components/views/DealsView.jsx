import React, { useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { useEngagements } from '../../hooks/useEngagements';
import { useEngagementClients } from '../../hooks/useEngagementClients';
import { useClientEngagements } from '../../hooks/useClientEngagements';
import { useUrlState } from '../../hooks/useUrlState';
import { getOrgId } from '../../lib/orgContext';
import { invokeAdminImpersonateClient } from '../../lib/supabaseWrite';
import ClientSelector from '../common/ClientSelector';
import PageHeader from '../common/PageHeader';
import CallResultsTab from './deals/CallResultsTab';
import AppointmentsTab from './deals/AppointmentsTab';
import RejectionCandidatesTab from './deals/RejectionCandidatesTab';

const TABS = [
  { id: 'calls',     label: '架電結果' },
  { id: 'appos',     label: '獲得アポ詳細' },
  { id: 'rejection', label: '再アプローチ候補' },
];
const TAB_IDS = TABS.map(t => t.id);

export default function DealsView({ isAdmin = false, currentUser = '' }) {
  const { currentEngagement } = useEngagements();
  const { clients } = useEngagementClients(currentEngagement?.id);

  // ハードリロード/共有URL対応のため URL クエリに同期
  const [selectedClientId, setSelectedClientId] = useUrlState('client', null);
  const [activeTab, setActiveTab] = useUrlState('tab', 'calls', { allowed: TAB_IDS });
  // 同一クライアントが複数 engagement (例 LST=売り手+買い手) を持つ場合のサブタブ
  const [subEngagementId, setSubEngagementId] = useUrlState('subEng', null);

  const [impersonating, setImpersonating] = useState(false);

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  // クライアントが扱う engagement 一覧 (appointments ベース)
  const orgId = getOrgId();
  const { engagements: clientEngagements } = useClientEngagements(selectedClientId, orgId);

  // 現サイドバー engagement が clientEngagements に含まれていれば最優先で選択
  // 含まれない場合は先頭の clientEngagements を採用
  // clientEngagements が空 (アポ未存在) なら currentEngagement にフォールバック
  const effectiveSubEngagementId = useMemo(() => {
    if (clientEngagements.length === 0) return currentEngagement?.id || null;
    if (subEngagementId && clientEngagements.some(e => e.id === subEngagementId)) {
      return subEngagementId;
    }
    if (currentEngagement && clientEngagements.some(e => e.id === currentEngagement.id)) {
      return currentEngagement.id;
    }
    return clientEngagements[0].id;
  }, [clientEngagements, subEngagementId, currentEngagement]);

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
        {isAdmin && selectedClient && (() => {
          const noPortalUser = !selectedClient.authUserId;
          const disabled = impersonating || noPortalUser;
          const label = impersonating
            ? '生成中...'
            : noPortalUser
              ? 'ポータル未招待'
              : '代理ログイン →';
          const title = noPortalUser
            ? `「${selectedClient.name}」のクライアントポータルユーザーが未作成のため代理ログインできません。クライアント管理画面からポータル招待を実行してください。`
            : `「${selectedClient.name}」のクライアントポータルを開く（代理ログイン）`;
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={handleImpersonate}
              disabled={disabled}
              title={title}
              style={{
                fontSize: font.size.xs,
                background: impersonating ? color.cream : color.white,
                cursor: impersonating ? 'wait' : noPortalUser ? 'not-allowed' : 'pointer',
                opacity: noPortalUser ? 0.55 : 1,
                flexShrink: 0,
                marginRight: 4,
              }}
            >
              {label}
            </Button>
          );
        })()}
      </div>

      {/* engagement サブタブ (兼業クライアント時のみ表示) */}
      {selectedClient && clientEngagements.length >= 2 && (
        <div style={{
          display: 'flex', gap: space[1], padding: `${space[2]}px ${space[5]}px 0`,
          alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: font.size.xs, color: color.textLight, marginRight: space[2] }}>商材:</span>
          {clientEngagements.map(eng => {
            const active = effectiveSubEngagementId === eng.id;
            return (
              <button
                key={eng.id} type="button"
                onClick={() => setSubEngagementId(eng.id)}
                style={{
                  fontSize: font.size.xs, padding: '4px 10px',
                  background: active ? color.navy : color.white,
                  color: active ? color.white : color.navy,
                  border: `1px solid ${color.navy}`,
                  borderRadius: radius.pill,
                  cursor: 'pointer', fontFamily: font.family.sans,
                  fontWeight: active ? font.weight.semibold : font.weight.normal,
                }}
              >{eng.name}</button>
            );
          })}
        </div>
      )}

      <div style={{ padding: '16px 20px', flex: 1, minHeight: 'calc(100vh - 260px)' }}>
        {activeTab === 'calls' && (
          <CallResultsTab
            engagementId={currentEngagement.id}
            client={selectedClient}
            clients={clients}
            filterEngagementId={selectedClient && clientEngagements.length >= 2 ? effectiveSubEngagementId : null}
          />
        )}
        {activeTab === 'appos' && (
          <AppointmentsTab
            engagementId={currentEngagement.id}
            client={selectedClient}
            clients={clients}
            canEditDossier={true}
            filterEngagementId={selectedClient && clientEngagements.length >= 2 ? effectiveSubEngagementId : null}
          />
        )}
        {activeTab === 'rejection' && (
          <RejectionCandidatesTab
            client={selectedClient}
            filterEngagementId={selectedClient && clientEngagements.length >= 2 ? effectiveSubEngagementId : null}
          />
        )}
      </div>
    </div>
  );
}
