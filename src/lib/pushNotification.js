import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(userId, orgId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications not supported');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const { endpoint, keys } = subscription.toJSON();

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    org_id: orgId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' });

  if (error) throw error;
  return subscription;
}

export async function unsubscribeFromPush(userId) {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await subscription.unsubscribe();
    const { endpoint } = subscription.toJSON();
    await supabase.from('push_subscriptions').delete().match({ user_id: userId, endpoint });
  }
}

export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}

/**
 * 古いService Workerが残ってpushが受信されない場合の完全リセット。
 * 1) 既存の購読を解除（DB含む）
 * 2) すべてのService Workerをunregister
 * 3) 再subscribeで新しいSWに紐づく購読を作る
 */
export async function resetPushSubscription(userId, orgId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications not supported');
  }

  // 1. 既存購読を解除
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const { endpoint } = sub.toJSON();
      await sub.unsubscribe();
      if (userId) {
        await supabase.from('push_subscriptions').delete().match({ user_id: userId, endpoint });
      }
    }
  } catch (err) {
    console.warn('[push reset] unsubscribe failed (continuing):', err);
  }

  // 2. すべての SW を unregister
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(r => r.unregister().catch(() => {})));

  // 3. 少し待って Workbox が新しい SW を登録するのを待つ
  // ページ再読み込みで新SWが確実に登録されるのが王道
  return { needsReload: true };
}
