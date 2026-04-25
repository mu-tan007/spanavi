import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { C } from '../../constants/colors';
import { subscribeToPush, isPushSubscribed } from '../../lib/pushNotification';
import { getOrgId } from '../../lib/orgContext';

const DISMISS_KEY = 'spanavi_push_banner_dismissed_v1';

/**
 * Dashboard 上部に表示するプッシュ通知ON誘導バナー。
 * 表示条件:
 *   - ブラウザがPush APIをサポート
 *   - 未購読
 *   - ユーザーが「閉じる」を押していない（localStorage）
 */
export default function PushNotificationBanner({ userId }) {
  const [show, setShow] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // SSR/非対応環境では出さない
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    // ユーザーが「閉じる」を押していたら出さない
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    // ブラウザがブロック設定なら出さない（手動でブラウザ設定を変えるしかないため誘導は逆効果）
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;

    // 既に購読済みなら出さない
    isPushSubscribed().then(subscribed => {
      if (!subscribed) setShow(true);
    });
  }, []);

  const handleEnable = async () => {
    if (!userId) return;
    setEnabling(true);
    setError(null);
    try {
      await subscribeToPush(userId, getOrgId());
      setShow(false);
    } catch (err) {
      setError(
        err?.message === 'Notification permission denied'
          ? '通知がブロックされています。ブラウザ設定から許可してください。'
          : 'ON にできませんでした: ' + (err?.message || '')
      );
    } finally {
      setEnabling(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      style={{
        background: '#F8F9FA',
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.navy}`,
        borderRadius: 4, padding: '10px 14px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12, position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bell size={16} color={C.textMid} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 2 }}>
          プッシュ通知を ON にしませんか？
        </div>
        <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.5 }}>
          チームメンバーがアポを取った瞬間、事前確認が必要なアポなどを即座に受け取れます。
        </div>
        {error && (
          <div style={{ fontSize: 10, color: '#B91C1C', marginTop: 4, fontWeight: 600 }}>{error}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={handleEnable}
          disabled={enabling}
          style={{
            padding: '6px 14px', borderRadius: 3, border: `1px solid ${C.navy}`,
            background: C.navy, color: '#fff',
            fontSize: 11, fontWeight: 600, cursor: enabling ? 'wait' : 'pointer',
            fontFamily: "'Noto Sans JP', sans-serif",
            opacity: enabling ? 0.6 : 1,
          }}
        >
          {enabling ? '設定中…' : 'ON にする'}
        </button>
        <button
          onClick={handleDismiss}
          title="閉じる（後で MyPage から ON にできます）"
          style={{
            padding: 4, borderRadius: 3, border: 'none', background: 'transparent',
            color: C.textLight, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
