import { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '../../lib/pushNotification';
import RewardSettings from '../admin/RewardSettings';
import OrganizationSettings from '../admin/OrganizationSettings';
import EngagementSettings from '../admin/EngagementSettings';
import SlackZoomSettings from '../admin/SlackZoomSettings';
import ClientManagement from '../admin/ClientManagement';
import IndustryRuleSettings from '../admin/IndustryRuleSettings';
import CallStatusSettings from '../admin/CallStatusSettings';
import RewardMasterView from './RewardMasterView';
import MyPageView from './MyPageView';
import GoalSettingsPanel from '../admin/GoalSettingsPanel';
import PageHeader from '../common/PageHeader';
import { useEngagements } from '../../hooks/useEngagements';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';

// メンバー管理は MASP > Members に統合済み（Phase 0-B で削除）
const TABS = [
  { id: 'org',      label: '組織設定',              icon: '' },
  { id: 'engagement', label: '事業設定',           icon: '' },
  { id: 'kpi',      label: 'KPI 目標',              icon: '' },
  { id: 'reward',   label: '報酬・給与設定',         icon: '' },
  { id: 'calling',  label: '架電設定',              icon: '' },
  { id: 'slack',    label: 'Slack / Zoom設定',       icon: '' },
  { id: 'clients',  label: 'クライアント・リスト管理', icon: '' },
];

// 「全社」スコープを表す UI 専用の仮想 engagement（DB には存在しない）。
// 全社を選択しているときだけ「組織設定」タブを表示する。
const COMPANY_WIDE_ID = '__company_wide__';
const COMPANY_WIDE_ENGAGEMENT = { id: COMPANY_WIDE_ID, name: '全社', slug: COMPANY_WIDE_ID, display_order: 0 };
// 対象事業セレクタに出す事業 slug のホワイトリスト
const ADMIN_ENGAGEMENT_SLUGS = ['seller_sourcing', 'spartia_career'];

// ────────────────────────────────────────────────
// Toast
// ────────────────────────────────────────────────
function ToastContainer({ toasts }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '12px 20px', borderRadius: 4, fontSize: 13, fontWeight: 600,
          background: t.type === 'error' ? '#FEF2F2' : '#ECFDF5',
          color: t.type === 'error' ? '#DC2626' : '#065F46',
          border: `1px solid ${t.type === 'error' ? '#FECACA' : '#A7F3D0'}`,
          animation: 'fadeIn 0.2s ease',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function AdminView({ isAdmin, setCurrentTab, rewardMaster, setRewardMaster, members = [], appoData = [], now, onDataRefetch, userId, orgId }) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = localStorage.getItem('admin_activeTab');
      // 旧 'members' タブが localStorage に残っている場合は kpi に再マップ
      if (!stored || stored === 'members') return 'kpi';
      return stored;
    } catch { return 'kpi'; }
  });
  const _setActiveTab = (tab) => {
    setActiveTab(tab);
    try { localStorage.setItem('admin_activeTab', tab); } catch {}
  };
  const [viewingMember, setViewingMember] = useState(null); // マイページモーダル用
  const [toasts, setToasts] = useState([]);

  // 事業セレクタ (各タブの設定は事業ごとに独立)
  // 「全社」 + ホワイトリスト事業（Sourcing / スパキャリ）を選択肢として並べる。
  const { engagements } = useEngagements();
  const selectableEngagements = useMemo(
    () => {
      const fromDb = (engagements || [])
        .filter(e => ADMIN_ENGAGEMENT_SLUGS.includes(e.slug))
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      return [COMPANY_WIDE_ENGAGEMENT, ...fromDb];
    },
    [engagements]
  );
  const [selectedEngagementId, setSelectedEngagementId] = useState(() => {
    try { return localStorage.getItem('admin_selectedEngagementId') || COMPANY_WIDE_ID; } catch { return COMPANY_WIDE_ID; }
  });
  // 事業リスト取得後、未選択なら「全社」を自動選択
  useEffect(() => {
    if (!selectedEngagementId && selectableEngagements.length > 0) {
      setSelectedEngagementId(COMPANY_WIDE_ID);
    }
  }, [selectableEngagements, selectedEngagementId]);
  const handleSelectEngagement = (id) => {
    setSelectedEngagementId(id);
    try { localStorage.setItem('admin_selectedEngagementId', id); } catch {}
  };
  const selectedEngagement = selectableEngagements.find(e => e.id === selectedEngagementId) || null;
  const isCompanyWide = selectedEngagementId === COMPANY_WIDE_ID;
  // 「全社」スコープでは組織設定タブのみ、個別事業ではそれ以外のタブのみ表示する。
  const visibleTabs = useMemo(
    () => TABS.filter(t => isCompanyWide ? t.id === 'org' : t.id !== 'org'),
    [isCompanyWide]
  );
  // スコープ切替時に表示外のタブが選ばれていたら自動で適切なタブに戻す
  useEffect(() => {
    if (isCompanyWide && activeTab !== 'org') {
      _setActiveTab('org');
    } else if (!isCompanyWide && activeTab === 'org') {
      _setActiveTab('kpi');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompanyWide]);

  // Push notification state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  useEffect(() => { isPushSubscribed().then(setPushEnabled); }, []);
  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush(userId);
        setPushEnabled(false);
      } else {
        await subscribeToPush(userId, orgId);
        setPushEnabled(true);
      }
    } catch (err) {
      alert(err.message === 'Notification permission denied'
        ? '通知の許可が必要です。ブラウザの設定から通知を許可してください。'
        : 'プッシュ通知の設定に失敗しました');
    } finally {
      setPushLoading(false);
    }
  };

  // Ctrl+←/→ は事業（engagement）タブ切替に変更されたため、ページ内 subtab 切替は廃止

  // isAdmin でなければ リスト一覧 にリダイレクト
  useEffect(() => {
    if (!isAdmin && setCurrentTab) {
      setCurrentTab('lists');
    }
  }, [isAdmin, setCurrentTab]);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
        アクセス権限がありません。
      </div>
    );
  }

  const viewingMemberData = viewingMember
    ? members.find(m => m.name === viewingMember)
    : null;


  return (
    <div style={{ paddingBottom: 48, animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        eyebrow="Admin · 設定"
        title="Admin Settings"
        description="管理者設定 — 代表のみアクセス可能"
        style={{ marginBottom: 24 }}
        right={
          <>
            <span style={{ fontSize: 12, color: '#6B7280' }}>プッシュ通知</span>
            <button
              onClick={handleTogglePush}
              disabled={pushLoading}
              style={{
                padding: '5px 14px', borderRadius: 14, border: 'none',
                background: pushEnabled ? GOLD : '#E5E5E5',
                color: pushEnabled ? '#fff' : '#9CA3AF',
                fontSize: 11, fontWeight: 700, cursor: pushLoading ? 'wait' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {pushLoading ? '処理中...' : pushEnabled ? 'ON' : 'OFF'}
            </button>
          </>
        }
      />

      {/* 事業セレクタ (設定は事業ごとに独立) */}
      {selectableEngagements.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #E5E5E5', borderRadius: 4,
          padding: '10px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>対象事業:</span>
          {selectableEngagements.map(e => {
            const active = selectedEngagementId === e.id;
            return (
              <button
                key={e.id}
                onClick={() => handleSelectEngagement(e.id)}
                style={{
                  padding: '5px 14px', fontSize: 12,
                  background: active ? NAVY : '#fff',
                  color: active ? '#fff' : '#6B7280',
                  border: `1px solid ${active ? NAVY : '#E5E5E5'}`,
                  borderRadius: 4, cursor: 'pointer', fontWeight: active ? 600 : 400,
                  fontFamily: "'Noto Sans JP',sans-serif",
                }}
              >{e.name}</button>
            );
          })}
          <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>
            ※ 各タブの設定はこの事業スコープで適用されます
          </span>
        </div>
      )}

      {/* タブバー */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E5E5', background: '#fff', borderRadius: '4px 4px 0 0', overflow: isMobile ? 'auto' : 'hidden', marginBottom: 0 }}>
        {visibleTabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => _setActiveTab(tab.id)}
              style={{
                flex: isMobile ? 'none' : 1, padding: isMobile ? '10px 10px' : '13px 16px', border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: 'transparent',
                color: active ? NAVY : '#9CA3AF',
                fontWeight: active ? 700 : 400,
                fontSize: 13, fontFamily: "'Noto Sans JP'",
                borderBottom: active ? `2px solid ${NAVY}` : '2px solid transparent',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* タブコンテンツ */}
      <div style={{ background: '#fff', borderRadius: '0 0 4px 4px', border: '1px solid #E5E5E5', borderTop: 'none', padding: isMobile ? '16px 12px' : '24px 28px', marginBottom: 0 }}>
        {activeTab === 'org' && isCompanyWide && (
          <OrganizationSettings onToast={showToast} />
        )}
        {activeTab === 'engagement' && (
          <EngagementSettings engagementId={selectedEngagementId} onToast={showToast} />
        )}
        {activeTab === 'kpi' && (
          <GoalSettingsPanel isAdmin={isAdmin} onToast={showToast} />
        )}
        {activeTab === 'reward'  && (
          <>
            <RewardSettings onToast={showToast} />
            <div style={{ height: 1, background: '#E5E5E5', margin: '28px 0' }} />
            <RewardMasterView rewardMaster={rewardMaster} setRewardMaster={setRewardMaster} />
          </>
        )}
        {activeTab === 'calling' && (
          <>
            <IndustryRuleSettings onToast={showToast} />
            <div style={{ height: 1, background: '#E5E5E5', margin: '28px 0' }} />
            <CallStatusSettings onToast={showToast} />
          </>
        )}
        {activeTab === 'slack'   && <SlackZoomSettings onToast={showToast} />}
        {activeTab === 'clients' && <ClientManagement  onToast={showToast} />}
      </div>

      {/* メンバーマイページ モーダル */}
      {viewingMember && (
        <div
          onClick={() => setViewingMember(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 8000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            overflowY: 'auto', padding: '24px 16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff', borderRadius: 4, width: '100%', maxWidth: 900,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)', position: 'relative',
            }}
          >
            {/* モーダルヘッダー */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px', borderBottom: '1px solid #E5E5E5',
              background: '#fff', borderRadius: '4px 4px 0 0',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                {viewingMember} のマイページ
              </div>
              <button
                onClick={() => setViewingMember(null)}
                style={{
                  background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
                  color: '#9CA3AF', lineHeight: 1, padding: '0 4px',
                }}
              >✕</button>
            </div>
            {/* マイページ本体 */}
            <div style={{ padding: '0 0 24px' }}>
              <MyPageView
                currentUser={viewingMember}
                userId={viewingMemberData?.user_id || viewingMember}
                members={members}
                now={now || new Date()}
                appoData={appoData}
                isAdmin={true}
              />
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
