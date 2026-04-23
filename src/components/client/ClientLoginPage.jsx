import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';

// クライアント・ポータルのログイン画面。社内ログイン (/login) とは別 URL。
export default function ClientLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (authErr) {
      setError(authErr.message || 'ログインに失敗しました');
      return;
    }
    const role = data?.user?.user_metadata?.role;
    if (role !== 'client') {
      await supabase.auth.signOut();
      setError('このアカウントはクライアント・ポータル用ではありません。');
      return;
    }
    // サーバー側 (RLS) で client 参照を再確認してから遷移
    window.location.href = '/client';
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.offWhite, fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '32px 36px', width: 360 }}>
        <div style={{ fontSize: 11, color: C.textLight, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
          Client Portal
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: C.navy, margin: '0 0 16px', fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
          Spanavi ログイン
        </h1>
        <p style={{ fontSize: 11, color: C.textMid, marginBottom: 20 }}>
          招待メールに記載のメールアドレスと、初回設定時のパスワードでログインしてください。
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: C.textMid }}>メールアドレス
            <input
              type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
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

        <div style={{ marginTop: 16, fontSize: 10, color: C.textLight, textAlign: 'center' }}>
          招待リンクからパスワードを未設定の場合は、メール内のリンクをご利用ください。
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textMid, textAlign: 'center' }}>
          社内メンバー (MASP) の方は <a href="/login" style={{ color: C.navyLight, textDecoration: 'underline' }}>こちらからログイン</a>
        </div>
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
