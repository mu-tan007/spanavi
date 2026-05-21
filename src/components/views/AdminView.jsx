import { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '../../lib/pushNotification';
import RewardSettings from '../admin/RewardSettings';
import OrganizationSettings from '../admin/OrganizationSettings';
import EngagementSettings from '../admin/EngagementSettings';
import SlackZoomSettings from '../admin/SlackZoomSettings';
import ClientManagement from '../admin/ClientManagement';
import EngagementClassification from '../admin/EngagementClassification';
import IndustryRuleSettings from '../admin/IndustryRuleSettings';
import CallStatusSettings from '../admin/CallStatusSettings';
import PermissionSettings from '../admin/PermissionSettings';
import RewardMasterView from './RewardMasterView';
import MyPageView from './MyPageView';
import GoalSettingsPanel from '../admin/GoalSettingsPanel';
import PageHeader from '../common/PageHeader';
import { useEngagements } from '../../hooks/useEngagements';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';

const NAVY = color.navy;
const GOLD = color.gold;

// メンバー管理は MASP > Members に統合済み（Phase 0-B で削除）
const TABS = [
  { id: 'org',         label: '組織設定',              icon: '' },
  { id: 'permissions', label: '権限管理',              icon: '' },
  { id: 'engagement',  label: '事業設定',           icon: '' },
  { id: 'kpi',         label: 'KPI 目標',              icon: '' },
  { id: 'reward',      label: '報酬・給与設定',         icon: '' },
  { id: 'calling',     label: '架電設定',              icon: '' },
  { id: 'slack',       label: 'Slack / Zoom設定',       icon: '' },
  { id: 'clients',     label: 'クライアント・リスト管理', icon: '' },
  { id: 'classification', label: 'タイプ 仕分け',       icon: '' },
];

// 全社スコープでのみ表示するタブ。事業セレクタを「全社」にしたときのみ並ぶ。
const COMPANY_WIDE_TABS = new Set(['org', 'permissions']);

// 「全社」スコープを表す UI 専用の仮想 product（DB には存在しない）。
// 全社を選択しているときだけ「組織設定」タブを表示する。
const COMPANY_WIDE_ID = '__company_wide__';
const COMPANY_WIDE_PRODUCT = { id: COMPANY_WIDE_ID, name: '全社', slug: COMPANY_WIDE_ID, display_order: 0 };
// 対象事業セレクタに出す事業（product）slug のホワイトリスト
const ADMIN_PRODUCT_SLUGS = ['sales_agency', 'spartia_career_biz'];
// product slug → 配下の代表 engagement slug（管理設定はこの engagement に紐付けて保存）
const PRODUCT_TO_PRIMARY_ENGAGEMENT = {
  sales_agency: 'seller_sourcing',
  spartia_career_biz: 'spartia_career',
};

// ────────────────────────────────────────────────
// Toast
// ────────────────────────────────────────────────
function ToastContainer({ toasts }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: space[6], right: space[6], zIndex: 9999, display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: `${space[3]}px ${space[5]}px`, borderRadius: radius.md, fontSize: font.size.base, fontWeight: font.weight.semibold,
          background: t.type === 'error' ? color.dangerSoft : color.successSoft,
          color: t.type === 'error' ? color.danger : '#065F46',
          border: `1px solid ${t.type === 'error' ? alpha(color.danger, 0.25) : alpha(color.success, 0.30)}`,
          animation: 'fadeIn 0.2s ease',
          boxShadow: shadow.sm,
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
  // 「全社」 + ホワイトリスト事業（営業代行 / スパキャリ）を選択肢として並べる。
  const { engagements, products } = useEngagements();
  const selectableProducts = useMemo(
    () => {
      const fromDb = (products || [])
        .filter(p => ADMIN_PRODUCT_SLUGS.includes(p.slug))
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      return [COMPANY_WIDE_PRODUCT, ...fromDb];
    },
    [products]
  );
  const [selectedProductId, setSelectedProductId] = useState(() => {
    try { return localStorage.getItem('admin_selectedProductId') || COMPANY_WIDE_ID; } catch { return COMPANY_WIDE_ID; }
  });
  // 事業リスト取得後、未選択なら「全社」を自動選択
  useEffect(() => {
    if (!selectedProductId && selectableProducts.length > 0) {
      setSelectedProductId(COMPANY_WIDE_ID);
    }
  }, [selectableProducts, selectedProductId]);
  const handleSelectProduct = (id) => {
    setSelectedProductId(id);
    try { localStorage.setItem('admin_selectedProductId', id); } catch {}
  };
  const selectedProduct = selectableProducts.find(p => p.id === selectedProductId) || null;
  const isCompanyWide = selectedProductId === COMPANY_WIDE_ID;
  // 選択中 product 配下の代表 engagement（タブ設定の保存先として使う）
  const selectedEngagementId = useMemo(() => {
    if (isCompanyWide) return COMPANY_WIDE_ID;
    const slug = PRODUCT_TO_PRIMARY_ENGAGEMENT[selectedProduct?.slug];
    if (!slug) return COMPANY_WIDE_ID;
    return (engagements || []).find(e => e.slug === slug)?.id || COMPANY_WIDE_ID;
  }, [selectedProduct, engagements, isCompanyWide]);
  // 「全社」スコープでは全社向けタブ(組織設定/権限管理)のみ、個別事業ではそれ以外のタブのみ表示する。
  const visibleTabs = useMemo(
    () => TABS.filter(t => isCompanyWide ? COMPANY_WIDE_TABS.has(t.id) : !COMPANY_WIDE_TABS.has(t.id)),
    [isCompanyWide]
  );
  // スコープ切替時に表示外のタブが選ばれていたら自動で適切なタブに戻す
  useEffect(() => {
    if (isCompanyWide && !COMPANY_WIDE_TABS.has(activeTab)) {
      _setActiveTab('org');
    } else if (!isCompanyWide && COMPANY_WIDE_TABS.has(activeTab)) {
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
      <div style={{ padding: space[10], textAlign: 'center', color: color.gray400, fontSize: font.size.md }}>
        アクセス権限がありません。
      </div>
    );
  }

  const viewingMemberData = viewingMember
    ? members.find(m => m.name === viewingMember)
    : null;


  return (
    <div style={{ paddingBottom: space[12], animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="管理者設定"
        description="管理者設定 — 代表のみアクセス可能"
        style={{ marginBottom: space[6] }}
        right={
          <>
            <span style={{ fontSize: font.size.sm, color: color.textMid }}>プッシュ通知</span>
            <button
              onClick={handleTogglePush}
              disabled={pushLoading}
              style={{
                padding: `5px ${space[3] + 2}px`, borderRadius: 14, border: 'none',
                background: pushEnabled ? GOLD : color.border,
                color: pushEnabled ? color.white : color.gray400,
                fontSize: font.size.xs, fontWeight: font.weight.bold, cursor: pushLoading ? 'wait' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {pushLoading ? '処理中...' : pushEnabled ? 'ON' : 'OFF'}
            </button>
          </>
        }
      />

      {/* 事業セレクタ (設定は事業ごとに独立) */}
      {selectableProducts.length > 0 && (
        <div style={{
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
          padding: `${space[2.5]}px ${space[4]}px`, marginBottom: space[3],
          display: 'flex', alignItems: 'center', gap: space[2.5], flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>対象事業:</span>
          {selectableProducts.map(p => {
            const active = selectedProductId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectProduct(p.id)}
                style={{
                  padding: `5px ${space[3] + 2}px`, fontSize: font.size.sm,
                  background: active ? NAVY : color.white,
                  color: active ? color.white : color.textMid,
                  border: `1px solid ${active ? NAVY : color.border}`,
                  borderRadius: radius.md, cursor: 'pointer', fontWeight: active ? font.weight.semibold : font.weight.normal,
                  fontFamily: font.family.sans,
                }}
              >{p.name}</button>
            );
          })}
          <span style={{ fontSize: 10, color: color.gray400, marginLeft: 'auto' }}>
            ※ 各タブの設定はこの事業スコープで適用されます
          </span>
        </div>
      )}

      {/* タブバー */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${color.border}`, background: color.white, borderRadius: `${radius.md}px ${radius.md}px 0 0`, overflow: isMobile ? 'auto' : 'hidden', marginBottom: 0 }}>
        {visibleTabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => _setActiveTab(tab.id)}
              style={{
                flex: isMobile ? 'none' : 1, padding: isMobile ? `${space[2.5]}px ${space[2.5]}px` : `13px ${space[4]}px`, border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: 'transparent',
                color: active ? NAVY : color.gray400,
                fontWeight: active ? font.weight.bold : font.weight.normal,
                fontSize: font.size.base, fontFamily: font.family.sans,
                borderBottom: active ? `2px solid ${NAVY}` : '2px solid transparent',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: space[1.5],
              }}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* タブコンテンツ */}
      <div style={{ background: color.white, borderRadius: `0 0 ${radius.md}px ${radius.md}px`, border: `1px solid ${color.border}`, borderTop: 'none', padding: isMobile ? `${space[4]}px ${space[3]}px` : `${space[6]}px 28px`, marginBottom: 0 }}>
        {activeTab === 'org' && isCompanyWide && (
          <OrganizationSettings onToast={showToast} />
        )}
        {activeTab === 'permissions' && isCompanyWide && (
          <PermissionSettings onToast={(t) => showToast(t.message, t.type || 'success')} />
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
            <div style={{ height: 1, background: color.border, margin: '28px 0' }} />
            <RewardMasterView rewardMaster={rewardMaster} setRewardMaster={setRewardMaster} />
          </>
        )}
        {activeTab === 'calling' && (
          <>
            <IndustryRuleSettings onToast={showToast} />
            <div style={{ height: 1, background: color.border, margin: '28px 0' }} />
            <CallStatusSettings onToast={showToast} />
          </>
        )}
        {activeTab === 'slack'   && <SlackZoomSettings onToast={showToast} />}
        {activeTab === 'clients' && <ClientManagement  onToast={showToast} />}
        {activeTab === 'classification' && <EngagementClassification onToast={showToast} />}
      </div>

      {/* メンバーマイページ モーダル */}
      {viewingMember && (
        <div
          onClick={() => setViewingMember(null)}
          style={{
            position: 'fixed', inset: 0, background: alpha('#000', 0.5),
            zIndex: 8000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            overflowY: 'auto', padding: `${space[6]}px ${space[4]}px`,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: color.white, borderRadius: radius.md, width: '100%', maxWidth: 900,
              boxShadow: shadow.md, position: 'relative',
            }}
          >
            {/* モーダルヘッダー */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${space[4]}px ${space[6]}px`, borderBottom: `1px solid ${color.border}`,
              background: color.white, borderRadius: `${radius.md}px ${radius.md}px 0 0`,
            }}>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY }}>
                {viewingMember} のマイページ
              </div>
              <button
                onClick={() => setViewingMember(null)}
                style={{
                  background: 'none', border: 'none', fontSize: font.size.xl, cursor: 'pointer',
                  color: color.gray400, lineHeight: 1, padding: `0 ${space[1]}px`,
                }}
              >✕</button>
            </div>
            {/* マイページ本体 */}
            <div style={{ padding: `0 0 ${space[6]}px` }}>
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
