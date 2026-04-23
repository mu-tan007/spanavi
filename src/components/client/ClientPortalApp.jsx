import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { C } from '../../constants/colors';
import ClientDealsView from './ClientDealsView';
import ClientSetPasswordPage from './ClientSetPasswordPage';
import SpanaviLogo from '../common/SpanaviLogo';

// ログイン済みクライアント専用の最小シェル。
// - user_metadata.role === 'client' でなければ /login へ戻す (社内ログイン)
// - 自社の client レコード (id, name) を読み込んで Deals ビューに渡す
export default function ClientPortalApp() {
  const { session, loading: authLoading, signOut } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!session) { setLoading(false); return; }
    const role = session.user?.user_metadata?.role;
    if (role !== 'client') { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      // RLS で自分の client 行だけが見える
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

  if (authLoading || loading) {
    return <CenteredMessage>読み込み中...</CenteredMessage>;
  }
  if (!session) return <Navigate to="/client/login" replace />;

  const role = session.user?.user_metadata?.role;
  if (role !== 'client') {
    // 社内ユーザーは誤って /client に来ても戻す
    return <Navigate to="/" replace />;
  }

  // 招待メール経由 or パスワード未設定なら、パスワード設定画面を強制
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
    <div style={{ minHeight: '100vh', background: C.offWhite, fontFamily: "'Noto Sans JP', sans-serif" }}>
      {/* シンプルなトップバー */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        height: 54, background: C.white, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SpanaviLogo size={26} textSize={17} gap={8} uidSuffix="portal-hdr" />
          <span style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
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
  );
}

function CenteredMessage({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.offWhite, fontFamily: "'Noto Sans JP', sans-serif",
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
