import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { C } from '../../constants/colors';
import ClientDealsView from './ClientDealsView';
import ClientSetPasswordPage from './ClientSetPasswordPage';
import SpanaviLogo from '../common/SpanaviLogo';
import { RecordingPlayerProvider } from '../common/RecordingPlayerProvider';

// クライアントポータル: 社内SpanaviAppと同じ世界観に揃える。
// - 背景: #F3F2F2 (社内と同じ薄グレー)
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
        <button onClick={async () => { await signOut(); window.location.href = '/client/login'; }}
          style={logoutBtn}>ログアウト</button>
      </CenteredMessage>
    );
  }

  return (
    <RecordingPlayerProvider>
    <div style={{ minHeight: '100vh', background: '#F3F2F2', fontFamily: "'Noto Sans JP', sans-serif" }}>
      {/* 代理ログイン中バナー: 通常ログインなら表示しない */}
      {adminBackup && (
        <div style={{
          background: 'linear-gradient(90deg, #1456C7 0%, #0D2247 100%)',
          color: '#fff',
          padding: '8px 24px',
          fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ letterSpacing: '0.04em' }}>
            管理者として「{adminBackup.impersonating_client_name || client.name}」を代理表示中
          </span>
          <button
            onClick={handleReturnToAdmin}
            disabled={restoring}
            style={{
              padding: '5px 14px', fontSize: 11, fontWeight: 600,
              background: '#fff', color: '#0D2247',
              border: 'none', borderRadius: 3,
              cursor: restoring ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
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
        height: 56, background: C.white, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SpanaviLogo size={28} textSize={18} gap={9} uidSuffix="portal-hdr" />
          <span style={{
            fontSize: 10, color: C.textLight, letterSpacing: '0.18em',
            textTransform: 'uppercase', borderLeft: `1px solid ${C.border}`,
            paddingLeft: 12, marginLeft: 4,
          }}>
            Client Portal
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>{client.name}</span>
          <button
            onClick={async () => { await signOut(); window.location.href = '/client/login'; }}
            style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 600,
              background: C.white, color: C.navy,
              border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
            }}
          >ログアウト</button>
        </div>
      </header>

      <main style={{ padding: 16 }}>
        <ClientDealsView client={client} />
      </main>
    </div>
    </RecordingPlayerProvider>
  );
}

function CenteredMessage({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F3F2F2', fontFamily: "'Noto Sans JP', sans-serif",
      textAlign: 'center', padding: 24, color: C.textMid, fontSize: 13,
      flexDirection: 'column', gap: 12,
    }}>
      {children}
    </div>
  );
}

const logoutBtn = {
  padding: '7px 14px', fontSize: 12, fontWeight: 600,
  background: '#032D60', color: '#fff', border: 'none', borderRadius: 4,
  cursor: 'pointer', marginTop: 8,
};
