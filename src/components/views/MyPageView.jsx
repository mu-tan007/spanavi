import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { C } from '../../constants/colors';
import { getProfileImageUrl, uploadProfileImage, updateMemberAvatarUrl, updateMember } from '../../lib/supabaseWrite';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '../../lib/pushNotification';
import { getOrgId } from '../../lib/orgContext';

// 組織共通の個人プロフィール画面。事業を跨いで同じ内容が表示される。
// 事業ごとの実績・研修・KPI・Payroll は各事業の Dashboard に配置 (Sourcing Dashboard 等)。
export default function MyPageView({ currentUser, userId, members, isAdmin = false }) {
  const isMobile = useIsMobile();

  // 自分のメンバー行を探す
  const memberInfo = useMemo(
    () => (Array.isArray(members) ? members.find(m => (typeof m === 'object' ? m.name : m) === currentUser) : null),
    [members, currentUser]
  );

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
      const url = await uploadProfileImage(userId, file);
      setProfileImage(url);
      if (memberInfo?._supaId || memberInfo?.id) {
        await updateMemberAvatarUrl(memberInfo._supaId || memberInfo.id, url);
      }
    } catch (err) {
      setUploadError(err?.message || 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  // Zoom Phone 番号
  const [zoomPhone, setZoomPhone] = useState('');
  const [zoomPhoneEditing, setZoomPhoneEditing] = useState(false);
  const [zoomPhoneSaving, setZoomPhoneSaving] = useState(false);
  useEffect(() => {
    if (memberInfo?.zoomPhoneNumber !== undefined) setZoomPhone(memberInfo.zoomPhoneNumber || '');
  }, [memberInfo?.zoomPhoneNumber]);
  const handleSaveZoomPhone = async () => {
    if (!memberInfo?._supaId && !memberInfo?.id) return;
    setZoomPhoneSaving(true);
    await updateMember(memberInfo._supaId || memberInfo.id, { ...memberInfo, zoomPhoneNumber: zoomPhone.trim() });
    setZoomPhoneSaving(false);
    setZoomPhoneEditing(false);
  };

  // プッシュ通知
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
        await subscribeToPush(userId, getOrgId());
        setPushEnabled(true);
      }
    } catch (err) {
      alert(err?.message === 'Notification permission denied'
        ? '通知の許可が必要です。ブラウザの設定から通知を許可してください。'
        : 'プッシュ通知の設定に失敗しました');
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* プロフィールカード */}
      <div style={{
        background: `linear-gradient(135deg, ${C.navyDeep}, ${C.navy})`, borderRadius: 12,
        padding: isMobile ? '20px 18px' : '28px 32px', marginBottom: 16,
        color: C.white, display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? 14 : 24, flexDirection: isMobile ? 'column' : 'row',
      }}>
        {/* アバター */}
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: `${C.white}20`, border: `2px solid ${C.gold}60`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 800, color: C.white,
            overflow: 'hidden', flexShrink: 0,
          }}>
            {profileImage
              ? <img src={profileImage} alt={currentUser} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (currentUser || '?')[0]}
          </div>
          <label style={{
            position: 'absolute', bottom: -2, right: -2,
            padding: '3px 7px', borderRadius: 10, background: C.gold, color: C.navyDeep,
            fontSize: 9, fontWeight: 700, cursor: uploading ? 'wait' : 'pointer',
          }}>
            {uploading ? '…' : '編集'}
            <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>

        {/* 基本情報 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{currentUser}</div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: C.goldLight, flexWrap: 'wrap' }}>
            {memberInfo?.team && <span>{memberInfo.team}</span>}
            {memberInfo?.rank && <span>{memberInfo.rank}</span>}
            {memberInfo?.position && <span>{memberInfo.position}</span>}
            {isAdmin && <span style={{ color: C.gold }}>admin</span>}
          </div>
          {uploadError && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#FCA5A5' }}>{uploadError}</div>
          )}
        </div>
      </div>

      {/* 基本情報カード */}
      <InfoCard title="基本情報">
        <InfoRow label="氏名" value={currentUser} />
        <InfoRow label="メール" value={memberInfo?.email || '—'} mono />
        <InfoRow label="入社日" value={memberInfo?.start_date || '—'} mono />
        {memberInfo?.university && <InfoRow label="大学" value={memberInfo.university} />}
        {memberInfo?.grade != null && <InfoRow label="学年" value={`${memberInfo.grade} 年`} />}
        {memberInfo?.team && <InfoRow label="所属チーム" value={memberInfo.team} />}
        {memberInfo?.position && <InfoRow label="ポジション" value={memberInfo.position} />}
        {memberInfo?.rank && <InfoRow label="ランク" value={memberInfo.rank} />}
      </InfoCard>

      {/* 連携・通知設定 */}
      <InfoCard title="連携 / 通知設定">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: C.textDark, fontWeight: 600 }}>Zoom Phone 番号</div>
              <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>架電時に相手に表示される番号</div>
            </div>
            {zoomPhoneEditing ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={zoomPhone}
                  onChange={e => setZoomPhone(e.target.value)}
                  placeholder="例: 0312345678"
                  style={{
                    padding: '6px 10px', borderRadius: 4, border: `1px solid ${C.border}`,
                    fontSize: 12, fontFamily: "'JetBrains Mono', monospace", width: 180,
                  }}
                />
                <button onClick={handleSaveZoomPhone} disabled={zoomPhoneSaving}
                  style={primaryBtn}>{zoomPhoneSaving ? '保存中...' : '保存'}</button>
                <button onClick={() => setZoomPhoneEditing(false)} style={secondaryBtn}>キャンセル</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: C.navy, fontWeight: 600 }}>
                  {zoomPhone || '未設定'}
                </span>
                {isAdmin && (
                  <button onClick={() => setZoomPhoneEditing(true)} style={secondaryBtn}>編集</button>
                )}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: C.borderLight }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: C.textDark, fontWeight: 600 }}>プッシュ通知</div>
              <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>重要な通知をブラウザで受け取る</div>
            </div>
            <button
              onClick={handleTogglePush}
              disabled={pushLoading}
              style={{
                padding: '6px 16px', borderRadius: 14, border: 'none',
                background: pushEnabled ? C.gold : C.border,
                color: pushEnabled ? '#fff' : C.textLight,
                fontSize: 11, fontWeight: 700, cursor: pushLoading ? 'wait' : 'pointer',
              }}
            >{pushLoading ? '処理中...' : pushEnabled ? 'ON' : 'OFF'}</button>
          </div>
        </div>
      </InfoCard>

      <div style={{ fontSize: 10, color: C.textLight, marginTop: 20, textAlign: 'center' }}>
        日々の実績や KPI の入力は、各事業タブの「Dashboard」からご確認ください。
      </div>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div style={{
      background: C.white, borderRadius: 4, border: `1px solid ${C.border}`,
      padding: '16px 20px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 12, letterSpacing: '0.04em' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.borderLight}` }}>
      <div style={{ minWidth: 120, fontSize: 11, color: C.textMid, fontWeight: 600 }}>{label}</div>
      <div style={{
        fontSize: 12, color: C.textDark,
        fontFamily: mono ? "'JetBrains Mono', monospace" : "'Noto Sans JP', sans-serif",
      }}>{value}</div>
    </div>
  );
}

const primaryBtn = {
  padding: '6px 12px', fontSize: 11, fontWeight: 600,
  background: C.navy, color: C.white, border: 'none', borderRadius: 4, cursor: 'pointer',
};
const secondaryBtn = {
  padding: '6px 12px', fontSize: 11, fontWeight: 600,
  background: C.white, color: C.navy, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
};
