import { useState, useEffect, useCallback } from 'react';
import MemberManagement from '../admin/MemberManagement';
import RewardSettings from '../admin/RewardSettings';
import SlackZoomSettings from '../admin/SlackZoomSettings';
import ClientManagement from '../admin/ClientManagement';
import RewardMasterView from './RewardMasterView';
import MyPageView from './MyPageView';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';

const TABS = [
  { id: 'members',  label: 'メンバー管理',          icon: '' },
  { id: 'reward',   label: '報酬・給与設定',         icon: '' },
  { id: 'slack',    label: 'Slack / Zoom設定',       icon: '' },
  { id: 'clients',  label: 'クライアント・リスト管理', icon: '' },
  { id: 'mypage_viewer', label: 'メンバーMyPage',   icon: '' },
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
          padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: t.type === 'error' ? '#FEF2F2' : '#ECFDF5',
          color: t.type === 'error' ? '#DC2626' : '#065F46',
          border: `1px solid ${t.type === 'error' ? '#FECACA' : '#A7F3D0'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function AdminView({ isAdmin, setCurrentTab, rewardMaster, setRewardMaster, members = [], appoData = [], now }) {
  const [activeTab, setActiveTab] = useState('members');
  const [selectedMember, setSelectedMember] = useState(null);
  const [toasts, setToasts] = useState([]);

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

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', paddingBottom: 48 }}>
      {/* ヘッダー */}
      <div style={{ background: NAVY, borderRadius: 12, padding: '24px 32px', marginBottom: 24 }}>
        <div style={{ width: 40, height: 3, background: GOLD, borderRadius: 2, marginBottom: 12 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>管理者設定</h1>
            <p style={{ fontSize: 12, color: GOLD, margin: '2px 0 0' }}>代表のみアクセス可能</p>
          </div>
        </div>
      </div>

      {/* タブバー */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E5E5', background: '#fff', borderRadius: '10px 10px 0 0', overflow: 'hidden', marginBottom: 0 }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '13px 16px', border: 'none', cursor: 'pointer',
                background: 'transparent',
                color: active ? NAVY : '#9CA3AF',
                fontWeight: active ? 700 : 400,
                fontSize: 13, fontFamily: "'Noto Sans JP'",
                borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span style={{ display: 'none', ['@media (min-width: 600px)']: { display: 'inline' } }}>{tab.label}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* タブコンテンツ */}
      <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', border: '1px solid #E5E5E5', borderTop: 'none', padding: '24px 28px', marginBottom: 0 }}>
        {activeTab === 'members' && <MemberManagement onToast={showToast} />}
        {activeTab === 'reward'  && (
          <>
            <RewardSettings onToast={showToast} />
            <div style={{ height: 1, background: '#E5E5E5', margin: '28px 0' }} />
            <RewardMasterView rewardMaster={rewardMaster} setRewardMaster={setRewardMaster} />
          </>
        )}
        {activeTab === 'slack'   && <SlackZoomSettings onToast={showToast} />}
        {activeTab === 'clients' && <ClientManagement  onToast={showToast} />}
        {activeTab === 'mypage_viewer' && (
          <div style={{ display: 'flex', gap: 0, minHeight: 500 }}>
            {/* Member picker */}
            <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #E5E5E5', marginRight: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #E5E5E5' }}>
                メンバー一覧 ({members.filter(m => m.name).length}名)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {members.filter(m => m.name && m.is_active !== false).map(m => (
                  <button key={m.name} onClick={() => setSelectedMember(m.name)} style={{
                    display: 'block', width: '100%', padding: '8px 10px',
                    border: 'none', borderRadius: 4,
                    background: selectedMember === m.name ? NAVY + '10' : 'transparent',
                    borderLeft: selectedMember === m.name ? `3px solid ${GOLD}` : '3px solid transparent',
                    textAlign: 'left', cursor: 'pointer', transition: 'all 0.1s',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: selectedMember === m.name ? 700 : 400, color: NAVY }}>{m.name}</div>
                    <div style={{ fontSize: 9, color: '#9CA3AF' }}>{m.team ? m.team + 'チーム' : ''}</div>
                  </button>
                ))}
              </div>
            </div>
            {/* MyPage view */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedMember ? (
                <MyPageView
                  currentUser={selectedMember}
                  userId={members.find(m => m.name === selectedMember)?._supaId || selectedMember}
                  members={members}
                  now={now || new Date()}
                  appoData={appoData}
                  isAdmin={true}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#9CA3AF', fontSize: 13 }}>
                  左のリストからメンバーを選択してください
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
