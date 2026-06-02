import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Button } from '../ui';
import ClientDealsView from './ClientDealsView';
import ClientSetPasswordPage from './ClientSetPasswordPage';
import SpanaviLogo from '../common/SpanaviLogo';
import { RecordingPlayerProvider } from '../common/RecordingPlayerProvider';

// クライアントポータル: 社内SpanaviAppと同じ世界観に揃える。
// - 背景: 薄グレー (社内と同じ)
// - ヘッダー: 高さ・余白・色を社内寄りに
// - 「社内に戻る」ボタン: 代理ログイン中のみ表示（管理者がDealsから入った場合）
const ADMIN_BACKUP_KEY = 'spanavi_admin_session_backup';
const ADMIN_BACKUP_TTL_MS = 12 * 60 * 60 * 1000; // 12時間で期限切れ

function readAdminBackup() {
  try {
    const raw = localStorage.getItem(ADMIN_BACKUP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.refresh_token || !data?.access_token) return null;
    if (data.saved_at && Date.now() - data.saved_at > ADMIN_BACKUP_TTL_MS) {
      localStorage.removeItem(ADMIN_BACKUP_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export default function ClientPortalApp() {
  const { session, loading: authLoading, signOut } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminBackup, setAdminBackup] = useState(() => readAdminBackup());
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    // backupがlocalStorageから消えたケース等を反映するため、定期的に再読込
    const id = setInterval(() => setAdminBackup(readAdminBackup()), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!session) { setLoading(false); return; }
    const role = session.user?.user_metadata?.role;
    if (role !== 'client') { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, org_id, status')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      setClient(data || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, session]);

  const handleReturnToAdmin = async () => {
    const backup = readAdminBackup();
    if (!backup) {
      alert('社内アカウントの情報が保存されていません。');
      return;
    }
    setRestoring(true);
    try {
      // 1) クライアントセッションを破棄
      await supabase.auth.signOut();
      // 2) 退避したadminセッションを復元
      const { error } = await supabase.auth.setSession({
        access_token: backup.access_token,
        refresh_token: backup.refresh_token,
      });
      if (error) {
        console.error('Failed to restore admin session:', error);
        alert('社内アカウントへの復帰に失敗しました。再ログインしてください。');
        localStorage.removeItem(ADMIN_BACKUP_KEY);
        window.location.href = '/login';
        return;
      }
      localStorage.removeItem(ADMIN_BACKUP_KEY);
      // 社内のDealsへ戻す（このタブが代理用に開かれた別タブなら、そのまま社内画面に切り替わる）
      window.location.href = '/dashboard';
    } catch (e) {
      console.error(e);
      setRestoring(false);
    }
  };

  if (authLoading || loading) {
    return <CenteredMessage>読み込み中...</CenteredMessage>;
  }
  if (!session) return <Navigate to="/client/login" replace />;

  const role = session.user?.user_metadata?.role;
  if (role !== 'client') {
    return <Navigate to="/" replace />;
  }

  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const isInviteLink = /type=invite/.test(hash) || /type=signup/.test(hash);
  const passwordSet = session.user?.user_metadata?.password_set === true;
  if (isInviteLink || !passwordSet) {
    return <ClientSetPasswordPage />;
  }
  if (!client) {
    return (
      <CenteredMessage>
        クライアント情報が取得できませんでした。管理者にお問い合わせください。
        <Button
          variant="primary"
          size="sm"
          onClick={async () => { await signOut(); window.location.href = '/client/login'; }}
          style={{ marginTop: space[2] }}
        >ログアウト</Button>
      </CenteredMessage>
    );
  }

  return (
    <RecordingPlayerProvider>
    <div style={{ minHeight: '100vh', background: color.offWhite, fontFamily: font.family.sans }}>
      {/* 代理ログイン中バナー: 通常ログインなら表示しない */}
      {adminBackup && (
        <div style={{
          background: `linear-gradient(90deg, ${color.navyLight} 0%, ${color.navyDark} 100%)`,
          color: color.white,
          padding: `${space[2]}px ${space[6]}px`,
          fontSize: font.size.sm,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: space[3], flexWrap: 'wrap',
        }}>
          <span style={{ letterSpacing: font.letterSpacing.wide }}>
            管理者として「{adminBackup.impersonating_client_name || client.name}」を代理表示中
          </span>
          <button
            onClick={handleReturnToAdmin}
            disabled={restoring}
            style={{
              padding: `5px ${space[3] + 2}px`,
              fontSize: font.size.xs,
              fontWeight: font.weight.semibold,
              background: color.white,
              color: color.navyDark,
              border: 'none',
              borderRadius: radius.sm,
              cursor: restoring ? 'not-allowed' : 'pointer',
              letterSpacing: font.letterSpacing.wide,
              opacity: restoring ? 0.6 : 1,
            }}
          >
            {restoring ? '復帰中...' : '← 社内アカウントに戻る'}
          </button>
        </div>
      )}

      {/* トップバー: 社内SpanaviAppのヘッダー寄り */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        height: 56,
        background: color.white,
        borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${space[6]}px`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
          <SpanaviLogo size={28} textSize={18} gap={9} uidSuffix="portal-hdr" />
          <span style={{
            fontSize: font.size.xs - 1,
            color: color.textLight,
            letterSpacing: font.letterSpacing.widest,
            textTransform: 'uppercase',
            borderLeft: `1px solid ${color.border}`,
            paddingLeft: space[3],
            marginLeft: space[1],
          }}>
            Client Portal
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[4] }}>
          <span style={{
            fontSize: font.size.sm,
            color: color.textMid,
            fontWeight: font.weight.semibold,
          }}>{client.name}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => { await signOut(); window.location.href = '/client/login'; }}
          >ログアウト</Button>
        </div>
      </header>

      <main style={{ padding: space[4] }}>
        <ClientDealsView
          client={client}
          canEditDossier={!!adminBackup}
          adminAccessToken={adminBackup?.access_token || null}
        />
      </main>
    </div>
    </RecordingPlayerProvider>
  );
}

function CenteredMessage({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // ログイン画面と同じ navy グラデーションで統一 (ローディング中のチラツキ防止)
      background: 'linear-gradient(135deg,#1456C7 0%,#1E3A8A 30%,#0D2247 60%,#081636 100%)',
      fontFamily: font.family.sans,
      textAlign: 'center',
      padding: space[6],
      color: 'rgba(255,255,255,0.75)',
      fontSize: font.size.base,
      flexDirection: 'column',
      gap: space[3],
    }}>
      {children}
    </div>
  );
}
