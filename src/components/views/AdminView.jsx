import { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '../../lib/pushNotification';
import MemberManagement from '../admin/MemberManagement';
import RewardSettings from '../admin/RewardSettings';
import SlackZoomSettings from '../admin/SlackZoomSettings';
import ClientManagement from '../admin/ClientManagement';
import BrandingSettings from '../admin/BrandingSettings';
import IndustryRuleSettings from '../admin/IndustryRuleSettings';
import CallStatusSettings from '../admin/CallStatusSettings';
import RewardMasterView from './RewardMasterView';
import MyPageView from './MyPageView';
import BillingSettings from '../admin/BillingSettings';
import GoalSettingsPanel from '../admin/GoalSettingsPanel';
import PageHeader from '../common/PageHeader';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';

const TABS = [
  { id: 'members',  label: 'メンバー管理',          icon: '' },
  { id: 'kpi',      label: 'KPI 目標',              icon: '' },
  { id: 'reward',   label: '報酬・給与設定',         icon: '' },
  { id: 'calling',  label: '架電設定',              icon: '' },
  { id: 'slack',    label: 'Slack / Zoom設定',       icon: '' },
  { id: 'clients',  label: 'クライアント・リスト管理', icon: '' },
  { id: 'branding', label: 'ブランド設定',           icon: '' },
  { id: 'billing',  label: 'プラン・請求',           icon: '' },
];

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
    try { return localStorage.getItem('admin_activeTab') || 'members'; } catch { return 'members'; }
  });
  const _setActiveTab = (tab) => {
    setActiveTab(tab);
    try { localStorage.setItem('admin_activeTab', tab); } catch {}
  };
  const [viewingMember, setViewingMember] = useState(null); // マイページモーダル用
  const [toasts, setToasts] = useState([]);

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

  // Ctrl+←/→ でサブタブを切り替え（カスタムイベント + 直接キーボード両対応）
  useEffect(() => {
    const ids = TABS.map(t => t.id);
    const cycle = (direction) => {
      setActiveTab(prev => {
        const idx = ids.indexOf(prev);
        if (idx === -1) return prev;
        const next = ids[(idx + direction + ids.length) % ids.length];
        try { localStorage.setItem('admin_activeTab', next); } catch {}
        return next;
      });
    };
    const handleSubtabCycle = (e) => cycle(e.detail.direction);
    const handleKeyDown = (e) => {
      if (!e.ctrlKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); cycle(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); cycle(1); }
    };
    window.addEventListener('spanavi-subtab-cycle', handleSubtabCycle);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('spanavi-subtab-cycle', handleSubtabCycle);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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

      {/* タブバー */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E5E5', background: '#fff', borderRadius: '4px 4px 0 0', overflow: isMobile ? 'auto' : 'hidden', marginBottom: 0 }}>
        {TABS.map(tab => {
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
        {activeTab === 'members' && (
          <MemberManagement
            onToast={showToast}
            onViewMyPage={(name) => setViewingMember(name)}
            onDataRefetch={onDataRefetch}
          />
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
        {activeTab === 'branding' && <BrandingSettings onToast={showToast} />}
        {activeTab === 'billing'  && <BillingSettings onToast={showToast} />}
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
