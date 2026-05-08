import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { supabase } from '../../lib/supabase';
import { useIsMobile } from '../../hooks/useIsMobile';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import {
  getProfileImageUrl, uploadProfileImage, updateMemberAvatarUrl,
  updateMember, updateMemberProfile,
} from '../../lib/supabaseWrite';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed, resetPushSubscription } from '../../lib/pushNotification';
import { getOrgId } from '../../lib/orgContext';

// 組織共通の個人プロフィール画面。事業を跨いで同じ内容が表示される。
export default function MyPageView({ currentUser, userId, members, isAdmin = false, onDataRefetch }) {
  const isMobile = useIsMobile();

  // 自分のメンバー情報を user_id で検索（名前変更後も追従するため）
  // user_id が無い場合は名前で fallback（後方互換）
  const memberInfo = useMemo(() => {
    if (!Array.isArray(members)) return null;
    if (userId) {
      const byUserId = members.find(m => typeof m === 'object' && m.user_id === userId);
      if (byUserId) return byUserId;
    }
    return members.find(m => (typeof m === 'object' ? m.name : m) === currentUser) || null;
  }, [members, currentUser, userId]);

  // プロフィール画像
  const [profileImage, setProfileImage] = useState(() => getProfileImageUrl(userId));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      // uploadProfileImage は { url, error } を返す
      const { url, error: uploadErr } = await uploadProfileImage(userId, file);
      if (uploadErr || !url) {
        throw uploadErr || new Error('アップロード結果が空でした');
      }
      setProfileImage(url);
      // members.id (UUID) で更新
      const memberId = memberInfo?._supaId || memberInfo?.id;
      if (memberId) {
        const updateErr = await updateMemberAvatarUrl(memberId, url);
        if (updateErr) throw updateErr;
      }
      // members 配列を再取得して画面全体に反映
      if (typeof onDataRefetch === 'function') {
        try { await onDataRefetch(); } catch (e) { console.warn('[MyPage] onDataRefetch failed:', e); }
      }
    } catch (err) {
      console.error('[MyPage] avatar upload error:', err);
      setUploadError(err?.message || 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  // 基本情報の編集（本人またはadmin）
  const supaId = memberInfo?._supaId || memberInfo?.id;
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone_number: '', start_date: '' });
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileSavedAt, setProfileSavedAt] = useState(null);

  useEffect(() => {
    if (!memberInfo) return;
    setProfileForm({
      name: memberInfo.name || currentUser || '',
      email: memberInfo.email || '',
      phone_number: memberInfo.phone_number || '',
      start_date: memberInfo.start_date || memberInfo.joinDate || '',
    });
  }, [memberInfo, currentUser]);

  const handleSaveProfile = async () => {
    if (!supaId) return;
    setProfileSaving(true);
    setProfileError(null);
    const error = await updateMemberProfile(supaId, profileForm);
    setProfileSaving(false);
    if (error) {
      setProfileError(error.message || '保存に失敗しました');
      return;
    }
    setProfileEditing(false);
    setProfileSavedAt(Date.now());
    // members 配列が古いままだと閲覧モードで旧値が見えるので、上位に再 fetch を依頼
    if (typeof onDataRefetch === 'function') {
      try { await onDataRefetch(); } catch (e) { console.warn('[MyPage] onDataRefetch failed:', e); }
    }
  };

  const handleCancelProfile = () => {
    setProfileEditing(false);
    setProfileError(null);
    setProfileForm({
      name: memberInfo?.name || currentUser || '',
      email: memberInfo?.email || '',
      phone_number: memberInfo?.phone_number || '',
      start_date: memberInfo?.start_date || memberInfo?.joinDate || '',
    });
  };

  // Zoom Phone 番号
  const [zoomPhone, setZoomPhone] = useState('');
  const [zoomPhoneEditing, setZoomPhoneEditing] = useState(false);
  const [zoomPhoneSaving, setZoomPhoneSaving] = useState(false);
  useEffect(() => {
    if (memberInfo?.zoomPhoneNumber !== undefined) setZoomPhone(memberInfo.zoomPhoneNumber || '');
  }, [memberInfo?.zoomPhoneNumber]);
  const handleSaveZoomPhone = async () => {
    if (!supaId) return;
    setZoomPhoneSaving(true);
    await updateMember(supaId, { ...memberInfo, zoomPhoneNumber: zoomPhone.trim() });
    setZoomPhoneSaving(false);
    setZoomPhoneEditing(false);
    if (typeof onDataRefetch === 'function') {
      try { await onDataRefetch(); } catch (e) { console.warn('[MyPage] onDataRefetch failed:', e); }
    }
  };

  // プッシュ通知
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushTestSending, setPushTestSending] = useState(false);
  const [pushTestResult, setPushTestResult] = useState(null);
  useEffect(() => { isPushSubscribed().then(setPushEnabled); }, []);

  // SW からの push-received メッセージをリッスン（デバッグ用）
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handler = (e) => {
      if (e.data?.kind === 'push-received') {
        console.log('[Push] Service Worker received push:', e.data);
        setPushTestResult(`✓ デバイスで受信確認: ${e.data.data?.title || ''}`);
        setTimeout(() => setPushTestResult(null), 8000);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // 自分が所属する事業 × 通知種類のマトリクス
  // 形: [{ id, name, masterEnabled, types: [{ typeId, label, userEnabled }] }]
  const [userEngagements, setUserEngagements] = useState([]);
  const [prefSaving, setPrefSaving] = useState(null); // 'eng:{id}:_all' または 'eng:{id}:{typeId}'

  useEffect(() => {
    if (!supaId || !userId) return;
    let cancelled = false;
    (async () => {
      const orgId = getOrgId();
      const [assignmentsRes, catalogRes, hiddenRes] = await Promise.all([
        supabase.from('member_engagements')
          .select('engagement_id, engagement:engagements!inner(id, name, slug, status)')
          .eq('member_id', supaId)
          .eq('engagement.status', 'active'),
        supabase.from('notification_type_catalog')
          .select('id, label_jp, default_recipients_scope, display_order, is_active')
          .eq('is_active', true)
          .order('display_order'),
        supabase.from('org_hidden_notification_types')
          .select('notification_type').eq('org_id', orgId),
      ]);
      const engs = (assignmentsRes.data || [])
        .map(a => a.engagement)
        .filter(Boolean)
        .filter(e => e.slug !== 'masp');
      const hiddenTypes = new Set((hiddenRes.data || []).map(r => r.notification_type));
      const catalog = (catalogRes.data || []).filter(c => !hiddenTypes.has(c.id));
      if (engs.length === 0) { if (!cancelled) setUserEngagements([]); return; }

      const engIds = engs.map(e => e.id);
      const [orgRulesRes, prefsRes] = await Promise.all([
        supabase.from('engagement_notification_settings')
          .select('engagement_id, notification_type, enabled')
          .in('engagement_id', engIds),
        supabase.from('push_notification_preferences')
          .select('engagement_id, notification_type, enabled')
          .eq('user_id', userId)
          .eq('org_id', orgId)
          .in('engagement_id', engIds),
      ]);

      // 事業 × 通知種類で組織側の有効/無効を判定
      const orgRule = {}; // engId -> { typeId -> enabled }
      (orgRulesRes.data || []).forEach(r => {
        if (!orgRule[r.engagement_id]) orgRule[r.engagement_id] = {};
        orgRule[r.engagement_id][r.notification_type] = r.enabled;
      });

      // 個人の opt-out
      const userPref = {}; // engId -> { typeId -> enabled }
      (prefsRes.data || []).forEach(r => {
        if (!userPref[r.engagement_id]) userPref[r.engagement_id] = {};
        userPref[r.engagement_id][r.notification_type] = r.enabled;
      });

      if (cancelled) return;
      setUserEngagements(engs.map(e => {
        const masterEnabled = userPref[e.id]?.['_all'] !== false;
        const types = catalog
          .filter(c => orgRule[e.id]?.[c.id] !== false) // 組織側 OFF は表示しない（デフォルト ON）
          .map(c => ({
            typeId: c.id,
            label: c.label_jp,
            userEnabled: userPref[e.id]?.[c.id] !== false,
          }));
        return { id: e.id, name: e.name, masterEnabled, types };
      }));
    })();
    return () => { cancelled = true; };
  }, [supaId, userId]);

  const upsertPref = async (engagementId, notificationType, nextEnabled) => {
    const key = `${engagementId}:${notificationType}`;
    setPrefSaving(key);
    const orgId = getOrgId();
    // 楽観更新
    setUserEngagements(prev => prev.map(e => {
      if (e.id !== engagementId) return e;
      if (notificationType === '_all') return { ...e, masterEnabled: nextEnabled };
      return { ...e, types: e.types.map(t => t.typeId === notificationType ? { ...t, userEnabled: nextEnabled } : t) };
    }));
    const { error } = await supabase
      .from('push_notification_preferences')
      .upsert({
        user_id: userId,
        engagement_id: engagementId,
        org_id: orgId,
        notification_type: notificationType,
        enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,engagement_id,notification_type' });
    setPrefSaving(null);
    if (error) {
      console.error('[MyPage] upsertPref error:', error);
      // ロールバック
      setUserEngagements(prev => prev.map(e => {
        if (e.id !== engagementId) return e;
        if (notificationType === '_all') return { ...e, masterEnabled: !nextEnabled };
        return { ...e, types: e.types.map(t => t.typeId === notificationType ? { ...t, userEnabled: !nextEnabled } : t) };
      }));
    }
  };

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush(userId);
        setPushEnabled(false);
      } else {
        await subscribeToPush(userId, getOrgId());
        setPushEnabled(true);
      }
    } catch (err) {
      alert(err?.message === 'Notification permission denied'
        ? '通知の許可が必要です。ブラウザの設定から通知を許可してください。'
        : 'プッシュ通知の設定に失敗しました: ' + (err?.message || ''));
    } finally {
      setPushLoading(false);
    }
  };

  // ローカル通知テスト（Push経由ではなく Notification API を直接呼ぶ）
  // サーバー/FCM/SW を一切経由せず、ブラウザ/OS が通知UIを出せるか判定する
  const handleLocalNotificationTest = async () => {
    if (typeof Notification === 'undefined') {
      setPushTestResult('✗ Notification API 非対応');
      return;
    }
    if (Notification.permission === 'denied') {
      setPushTestResult('✗ ブラウザで通知がブロックされています');
      return;
    }
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        setPushTestResult('✗ 通知が許可されませんでした');
        return;
      }
    }
    // ① まず new Notification() で直接テスト（SW非経由）
    try {
      const n = new Notification('🔔 直接通知テスト #1', {
        body: 'これが見えればOSの通知は完全に正常',
        icon: '/pwa-192x192.png',
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {
      console.error('[notif] direct fail:', e);
    }
    // ② 次に SW 経由でテスト
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('🔔 SW通知テスト #2', {
        body: 'これが見えればSWからの通知も正常',
        icon: '/pwa-192x192.png',
        requireInteraction: true,
      });
      setPushTestResult('✓ 2種類の通知を発火 — Win+N で通知センターも確認してください');
      setTimeout(() => setPushTestResult(null), 15000);
    } catch (err) {
      setPushTestResult('✗ SW通知失敗: ' + (err?.message || ''));
    }
  };

  const handleResetPush = async () => {
    if (!confirm('プッシュ通知を完全にリセットして再設定します。\n\nページが自動で再読み込みされます。よろしいですか？')) return;
    setPushLoading(true);
    try {
      await resetPushSubscription(userId, getOrgId());
      // ページ再読み込みで新しい SW が登録される
      window.location.reload();
    } catch (err) {
      alert('リセットに失敗しました: ' + (err?.message || ''));
      setPushLoading(false);
    }
  };

  const handleTestPush = async () => {
    if (!pushEnabled || !userId) return;
    setPushTestSending(true);
    setPushTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          type: 'test',
          title: '🔔 テスト通知',
          body: 'プッシュ通知は正常に動作しています',
          user_ids: [userId],
          org_id: getOrgId(),
        },
      });
      if (error) throw error;
      if (data?.sent > 0) {
        setPushTestResult(`✓ 送信成功（${data.sent}件）— 通知が表示されない場合はブラウザ通知設定とOS通知許可をご確認ください`);
      } else if (data?.failures && data.failures.length > 0) {
        const f = data.failures[0];
        setPushTestResult(`✗ 送信失敗 (${f.endpoint_origin}: HTTP ${f.status}) ${f.body || ''}`.slice(0, 200));
      } else if (data?.message) {
        setPushTestResult(`✗ ${data.message}`);
      } else {
        setPushTestResult('✗ 送信先なし');
      }
    } catch (err) {
      setPushTestResult('✗ ' + (err?.message || '送信失敗'));
    } finally {
      setPushTestSending(false);
      setTimeout(() => setPushTestResult(null), 12000);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* プロフィールカード */}
      <div style={{
        background: `linear-gradient(135deg, ${color.navyDeep}, ${color.navy})`,
        borderRadius: radius.xl,
        padding: isMobile ? '20px 18px' : '28px 32px', marginBottom: space[4],
        color: color.white, display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? space[3.5] || 14 : space[6], flexDirection: isMobile ? 'column' : 'row',
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: alpha(color.white, 0.12),
            border: `2px solid ${alpha(color.gold, 0.38)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: font.size['3xl'], fontWeight: font.weight.black, color: color.white,
            overflow: 'hidden', flexShrink: 0,
          }}>
            {profileImage
              ? <img src={profileImage} alt={currentUser} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (currentUser || '?')[0]}
          </div>
          <label style={{
            position: 'absolute', bottom: -2, right: -2,
            padding: '3px 7px', borderRadius: radius.lg,
            background: color.gold, color: color.navyDeep,
            fontSize: 9, fontWeight: font.weight.bold,
            cursor: uploading ? 'wait' : 'pointer',
          }}>
            {uploading ? '…' : '編集'}
            <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: font.size['2xl'] - 2, fontWeight: font.weight.black, marginBottom: 6 }}>{currentUser}</div>
          <div style={{ display: 'flex', gap: 14, fontSize: font.size.xs, color: color.goldLight, flexWrap: 'wrap' }}>
            {memberInfo?.position && <span>{memberInfo.position}</span>}
          </div>
          {uploadError && <div style={{ marginTop: 6, fontSize: font.size.xs - 1, color: '#FCA5A5' }}>{uploadError}</div>}
        </div>
      </div>

      {/* 基本情報カード */}
      <InfoCard
        title="基本情報"
        right={!profileEditing && supaId ? (
          <Button size="sm" variant="secondary" onClick={() => setProfileEditing(true)}>編集</Button>
        ) : null}
      >
        {profileEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <EditRow label="氏名">
              <Input
                size="sm"
                value={profileForm.name}
                onChange={e => setProfileForm(s => ({ ...s, name: e.target.value }))}
                containerStyle={{ maxWidth: 320 }}
              />
            </EditRow>
            <EditRow label="メールアドレス">
              <Input
                size="sm"
                type="email"
                value={profileForm.email}
                onChange={e => setProfileForm(s => ({ ...s, email: e.target.value }))}
                style={{ fontFamily: font.family.mono }}
                placeholder="example@example.com"
                containerStyle={{ maxWidth: 320 }}
              />
            </EditRow>
            <EditRow label="携帯番号">
              <Input
                size="sm"
                type="tel"
                value={profileForm.phone_number}
                onChange={e => setProfileForm(s => ({ ...s, phone_number: e.target.value }))}
                style={{ fontFamily: font.family.mono }}
                placeholder="090-1234-5678"
                containerStyle={{ maxWidth: 320 }}
              />
            </EditRow>
            <EditRow label="入社日">
              <Input
                size="sm"
                type="date"
                value={profileForm.start_date || ''}
                onChange={e => setProfileForm(s => ({ ...s, start_date: e.target.value }))}
                style={{ fontFamily: font.family.mono }}
                containerStyle={{ maxWidth: 320 }}
              />
            </EditRow>
            {profileError && <div style={{ fontSize: font.size.xs, color: color.danger, padding: '4px 0' }}>{profileError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button size="sm" variant="secondary" onClick={handleCancelProfile} disabled={profileSaving}>キャンセル</Button>
              <Button size="sm" onClick={handleSaveProfile} loading={profileSaving}>
                {profileSaving ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <InfoRow label="氏名" value={memberInfo?.name || currentUser || '—'} />
            <InfoRow label="メールアドレス" value={memberInfo?.email || '—'} mono />
            <InfoRow label="携帯番号" value={memberInfo?.phone_number || '—'} mono />
            <InfoRow label="入社日" value={memberInfo?.start_date || memberInfo?.joinDate || '—'} mono />
            {profileSavedAt && Date.now() - profileSavedAt < 4000 && (
              <div style={{ marginTop: 8, fontSize: font.size.xs - 1, color: color.success, fontWeight: font.weight.semibold }}>✓ 保存しました</div>
            )}
          </>
        )}
      </InfoCard>

      {/* 連携・通知設定 */}
      <InfoCard title="連携 / 通知設定">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold }}>Zoom Phone 番号</div>
              <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>架電時に相手に表示される番号</div>
            </div>
            {zoomPhoneEditing ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Input
                  size="sm"
                  fullWidth={false}
                  value={zoomPhone}
                  onChange={e => setZoomPhone(e.target.value)}
                  placeholder="例: 0312345678"
                  style={{ fontFamily: font.family.mono }}
                  containerStyle={{ width: 180 }}
                />
                <Button size="sm" onClick={handleSaveZoomPhone} loading={zoomPhoneSaving}>
                  {zoomPhoneSaving ? '保存中...' : '保存'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setZoomPhoneEditing(false)}>キャンセル</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: font.family.mono, fontSize: font.size.base, color: color.navy, fontWeight: font.weight.semibold }}>
                  {zoomPhone || '未設定'}
                </span>
                {isAdmin && <Button size="sm" variant="secondary" onClick={() => setZoomPhoneEditing(true)}>編集</Button>}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: color.borderLight }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold }}>プッシュ通知</div>
              <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>
                アポ獲得・日次レポートなどをブラウザで受け取る
                {typeof Notification !== 'undefined' && (
                  <span style={{
                    marginLeft: 6, fontFamily: font.family.mono,
                    color: Notification.permission === 'granted' ? color.success
                      : Notification.permission === 'denied' ? color.danger
                      : color.textLight,
                  }}>
                    [permission: {Notification.permission}]
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {pushEnabled && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleLocalNotificationTest}
                    style={{ fontSize: font.size.xs - 1 }}
                    title="サーバー経由せず、ブラウザ/OS の通知UI が出るか直接テスト"
                  >ローカル通知</Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleResetPush}
                    loading={pushLoading}
                    style={{ fontSize: font.size.xs - 1 }}
                    title="古いService Workerを削除して通知を再設定"
                  >{pushLoading ? '処理中…' : 'リセット'}</Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleTestPush}
                    loading={pushTestSending}
                    style={{ fontSize: font.size.xs - 1 }}
                    title="このデバイスにテスト通知を送信（サーバー経由）"
                  >{pushTestSending ? '送信中…' : 'テスト送信'}</Button>
                </>
              )}
              <button
                onClick={handleTogglePush}
                disabled={pushLoading}
                style={{
                  padding: '6px 16px', borderRadius: radius.pill, border: 'none',
                  background: pushEnabled ? color.navy : color.border,
                  color: pushEnabled ? color.white : color.textLight,
                  fontSize: font.size.xs, fontWeight: font.weight.bold,
                  cursor: pushLoading ? 'wait' : 'pointer',
                }}
              >{pushLoading ? '処理中...' : pushEnabled ? 'ON' : 'OFF'}</button>
            </div>
          </div>
          {pushTestResult && (
            <div style={{
              fontSize: font.size.xs - 1,
              color: pushTestResult.startsWith('✓') ? color.success : color.danger,
              textAlign: 'right', lineHeight: 1.5,
            }}>
              {pushTestResult}
            </div>
          )}

          {pushEnabled && userEngagements.length > 0 && (
            <>
              <div style={{ height: 1, background: color.borderLight, marginTop: 4 }} />
              <div>
                <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, marginBottom: 8 }}>
                  事業ごとの通知 ON/OFF
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {userEngagements.map(e => {
                    const masterKey = `${e.id}:_all`;
                    const masterBusy = prefSaving === masterKey;
                    return (
                      <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* 事業全体マスター */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                          <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold }}>{e.name}</div>
                          <button
                            onClick={() => upsertPref(e.id, '_all', !e.masterEnabled)}
                            disabled={masterBusy}
                            style={{
                              padding: '4px 14px', borderRadius: radius.pill, border: 'none',
                              background: e.masterEnabled ? color.navy : color.border,
                              color: e.masterEnabled ? color.white : color.textLight,
                              fontSize: font.size.xs - 1, fontWeight: font.weight.bold,
                              cursor: masterBusy ? 'wait' : 'pointer',
                              opacity: masterBusy ? 0.6 : 1,
                              minWidth: 56,
                            }}
                          >{masterBusy ? '…' : (e.masterEnabled ? 'ON' : 'OFF')}</button>
                        </div>

                        {/* 通知種類別 ON/OFF（マスター ON のときのみ表示） */}
                        {e.masterEnabled && e.types.length > 0 && (
                          <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 4, borderLeft: `2px solid ${color.borderLight}` }}>
                            {e.types.map(t => {
                              const tKey = `${e.id}:${t.typeId}`;
                              const tBusy = prefSaving === tKey;
                              return (
                                <div key={t.typeId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0 2px 8px' }}>
                                  <div style={{ fontSize: font.size.xs, color: color.textMid }}>{t.label}</div>
                                  <button
                                    onClick={() => upsertPref(e.id, t.typeId, !t.userEnabled)}
                                    disabled={tBusy}
                                    style={{
                                      padding: '2px 10px', borderRadius: radius.pill, border: 'none',
                                      background: t.userEnabled ? color.navy : color.border,
                                      color: t.userEnabled ? color.white : color.textLight,
                                      fontSize: 9, fontWeight: font.weight.bold,
                                      cursor: tBusy ? 'wait' : 'pointer',
                                      opacity: tBusy ? 0.6 : 1,
                                      minWidth: 48,
                                    }}
                                  >{tBusy ? '…' : (t.userEnabled ? 'ON' : 'OFF')}</button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </InfoCard>

      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 20, textAlign: 'center' }}>
        日々の実績や KPI の入力は、各事業タブの「Dashboard」からご確認ください。
      </div>
    </div>
  );
}

function InfoCard({ title, children, right }) {
  return (
    <Card padding="none" style={{ marginBottom: space[4] }}>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{
            fontSize: font.size.sm, fontWeight: font.weight.bold,
            color: color.navy, letterSpacing: font.letterSpacing.wide,
          }}>{title}</div>
          {right}
        </div>
        {children}
      </div>
    </Card>
  );
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${color.borderLight}` }}>
      <div style={{ minWidth: 120, fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{
        fontSize: font.size.sm, color: color.textDark,
        fontFamily: mono ? font.family.mono : font.family.sans,
      }}>{value}</div>
    </div>
  );
}

function EditRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
      <div style={{ minWidth: 120, fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
