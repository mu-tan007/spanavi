import React, { useState } from 'react';
import { color, space, radius, font } from '../../constants/design';
import PageHeader from '../common/PageHeader';
import CallResultsTab from '../views/deals/CallResultsTab';
import AppointmentsTab from '../views/deals/AppointmentsTab';
import RejectionCandidatesTab from '../views/deals/RejectionCandidatesTab';
import BuyerMatchingNeedsTab from '../views/deals/BuyerMatchingNeedsTab';

const BASE_TABS = [
  { id: 'calls',     label: '架電結果' },
  { id: 'appos',     label: '獲得アポ詳細' },
  { id: 'rejection', label: '再アプローチ候補' },
];

// クライアント向け最小 Deals ページ。client はサーバー側で RLS により制約済み。
// canEditDossier: 代理ログイン中（MASPメンバーがクライアントとして閲覧）= true。
// adminAccessToken: 代理ログイン中の MASP メンバー編集経路で使う admin の access_token。
export default function ClientDealsView({ client, canEditDossier = false, adminAccessToken = null }) {
  const [activeTab, setActiveTab] = useState('calls');

  // Ctrl+←/→ は事業タブ切替に統一されたため subtab 切替ショートカットは廃止

  if (!client) return null;

  // 買い手マッチング（matching）の架電リストを持つクライアントだけ
  // 「ニーズヒアリング」タブを出す（リスト駆動）
  const TABS = client.hasMatchingList
    ? [...BASE_TABS, { id: 'needs', label: 'ニーズヒアリング' }]
    : BASE_TABS;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: color.offWhite,
      animation: 'fadeIn 0.3s ease',
      borderRadius: radius.md,
      border: `1px solid ${color.border}`,
      overflow: 'hidden',
    }}>
      <PageHeader
        bleed={false}
        title="Deals"
        description={`${client.name} の架電結果と獲得アポの詳細`}
      />

      <div style={{
        display: 'flex',
        padding: `0 ${space[5]}px`,
        borderBottom: `1px solid ${color.border}`,
        background: color.white,
        gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: font.size.sm,
                padding: `${space[2] + 2}px ${space[4]}px`,
                background: 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${color.gold}` : '2px solid transparent',
                color: active ? color.navy : color.textMid,
                fontWeight: active ? font.weight.semibold : font.weight.normal,
                marginBottom: -1,
                cursor: 'pointer',
                fontFamily: font.family.sans,
              }}
            >{tab.label}</button>
          );
        })}
      </div>

      <div style={{ padding: `${space[4]}px ${space[5]}px`, minHeight: 'calc(100vh - 220px)' }}>
        {activeTab === 'calls' && <CallResultsTab client={{ id: client.id, name: client.name }} />}
        {activeTab === 'appos' && (
          <AppointmentsTab
            client={{ id: client.id, name: client.name }}
            canEditDossier={canEditDossier}
            adminAccessToken={adminAccessToken}
          />
        )}
        {activeTab === 'rejection' && (
          <RejectionCandidatesTab client={{ id: client.id, name: client.name }} />
        )}
        {activeTab === 'needs' && (
          <BuyerMatchingNeedsTab client={{ id: client.id, name: client.name, org_id: client.org_id }} />
        )}
      </div>
    </div>
  );
}
