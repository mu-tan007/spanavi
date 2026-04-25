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
        background: 'linear-gradient(135deg, #0D2247 0%, #1E40AF 100%)',
        color: '#fff', borderRadius: 6, padding: '12px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 14, position: 'relative',
        boxShadow: '0 2px 8px rgba(13, 34, 71, 0.15)',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Bell size={18} color="#FFD700" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
          プッシュ通知を ON にしませんか？
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.5 }}>
          チームメンバーがアポを取った瞬間、事前確認が必要なアポなどを即座に受け取れます。
        </div>
        {error && (
          <div style={{ fontSize: 10, color: '#FCA5A5', marginTop: 4, fontWeight: 600 }}>{error}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={handleEnable}
          disabled={enabling}
          style={{
            padding: '7px 18px', borderRadius: 4, border: 'none',
            background: '#C8A84B', color: '#0D2247',
            fontSize: 12, fontWeight: 700, cursor: enabling ? 'wait' : 'pointer',
            fontFamily: "'Noto Sans JP', sans-serif",
            opacity: enabling ? 0.7 : 1,
          }}
        >
          {enabling ? '設定中…' : 'ON にする'}
        </button>
        <button
          onClick={handleDismiss}
          title="閉じる（後で MyPage から ON にできます）"
          style={{
            padding: 6, borderRadius: 4, border: 'none', background: 'transparent',
            color: 'rgba(255, 255, 255, 0.7)', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
