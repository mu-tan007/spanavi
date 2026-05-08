import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
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
        border: `1px solid ${color.border}`,
        borderLeft: `3px solid ${color.navy}`,
        borderRadius: radius.md,
        padding: `${space[2.5]}px 14px`,
        marginBottom: space[4],
        display: 'flex', alignItems: 'center', gap: space[3],
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bell size={16} color={color.textMid} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: font.size.sm, fontWeight: font.weight.semibold,
          color: color.navy, marginBottom: 2,
        }}>
          プッシュ通知を ON にしませんか？
        </div>
        <div style={{
          fontSize: font.size.xs, color: color.textMid, lineHeight: font.lineHeight.normal,
        }}>
          チームメンバーがアポを取った瞬間、事前確認が必要なアポなどを即座に受け取れます。
        </div>
        {error && (
          <div style={{
            fontSize: 10, color: '#B91C1C',
            marginTop: space[1], fontWeight: font.weight.semibold,
          }}>{error}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexShrink: 0 }}>
        <Button
          size="sm"
          loading={enabling}
          onClick={handleEnable}
          disabled={enabling}
        >
          {enabling ? '設定中…' : 'ON にする'}
        </Button>
        <button
          onClick={handleDismiss}
          title="閉じる（後で MyPage から ON にできます）"
          style={{
            padding: space[1], borderRadius: radius.sm,
            border: 'none', background: 'transparent',
            color: color.textLight, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
