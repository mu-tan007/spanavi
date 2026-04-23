import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import SpanaviLogo from '../common/SpanaviLogo';

// クライアント・ポータルのログイン画面。社内ログイン (/login) とは別 URL。
// Supabase Auth は email+password なので、ユーザー ID を受け取って内部で
// {username}@portal.spanavi.local に合成してサインインする。
const EMAIL_DOMAIN = 'portal.spanavi.local';

export default function ClientLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const uname = username.trim().toLowerCase();
    // 入力が既に email 形式ならそのまま使う (旧招待メールアカウント互換)
    const email = uname.includes('@') ? uname : `${uname}@${EMAIL_DOMAIN}`;
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email, password,
    });
    setSubmitting(false);
    if (authErr) {
      setError('ID またはパスワードが正しくありません');
      return;
    }
    const role = data?.user?.user_metadata?.role;
    if (role !== 'client') {
      await supabase.auth.signOut();
      setError('このアカウントはクライアント・ポータル用ではありません。');
      return;
    }
    window.location.href = '/client';
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.offWhite, fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '32px 36px', width: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <SpanaviLogo size={32} textSize={20} gap={10} uidSuffix="client-login" />
        </div>
        <div style={{ fontSize: 11, color: C.textLight, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center' }}>
          Client Portal
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: C.textMid }}>ユーザー ID
            <input
              type="text" required autoCapitalize="none" autoComplete="username"
              value={username} onChange={e => setUsername(e.target.value)}
              placeholder="例: fullerene2026"
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 11, color: C.textMid }}>パスワード
            <input
              type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              style={inputStyle}
            />
          </label>
          {error && (
            <div style={{ fontSize: 11, color: '#c0392b', background: '#FEF2F2', padding: '8px 10px', borderRadius: 3, border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={submitting}
            style={{
              padding: '10px 14px', fontSize: 13, fontWeight: 600,
              background: submitting ? C.textLight : C.navy, color: C.white,
              border: 'none', borderRadius: 4, cursor: submitting ? 'default' : 'pointer',
              marginTop: 6,
            }}
          >{submitting ? 'ログイン中...' : 'ログイン'}</button>
        </form>

      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  border: `1px solid ${C.border}`, borderRadius: 3, outline: 'none',
  fontFamily: "'Noto Sans JP', sans-serif", marginTop: 4,
  boxSizing: 'border-box',
};
