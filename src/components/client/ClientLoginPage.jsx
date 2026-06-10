import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { LoginShell, SHELL_C, inputStyle, labelStyle, makeBtnStyle } from '../common/LoginShell';

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
    const email = uname.includes('@') ? uname : `${uname}@${EMAIL_DOMAIN}`;
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (authErr) {
      setError('ID またはパスワードが正しくありません');
      return;
    }
    const role = data?.user?.user_metadata?.role;
    if (role !== 'client') {
      await supabase.auth.signOut({ scope: 'local' });
      setError('このアカウントはクライアント・ポータル用ではありません。');
      return;
    }
    window.location.href = '/client';
  };

  return (
    <LoginShell
      eyebrow="Client Portal"
      subtitle="ユーザー ID とパスワードでサインイン"
    >
      <form onSubmit={handleSubmit} autoComplete="off">
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>
            ユーザー ID<span style={{ color: SHELL_C.errorRed, marginLeft: 2 }}>*</span>
          </div>
          <input
            className="sp-login-input"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="半角英数字"
            required
            autoCapitalize="none"
            autoComplete="username"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>
            パスワード<span style={{ color: SHELL_C.errorRed, marginLeft: 2 }}>*</span>
          </div>
          <input
            className="sp-login-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            style={inputStyle}
          />
        </div>
        {error && (
          <div style={{ marginBottom: 12, fontSize: 12, color: SHELL_C.errorRed }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          className="sp-login-btn"
          disabled={submitting}
          style={makeBtnStyle(submitting)}
          onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = SHELL_C.navyHover }}
          onMouseLeave={e => { e.currentTarget.style.background = SHELL_C.navy }}
        >
          {submitting ? 'ログイン中...' : 'ログイン'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: SHELL_C.textMutedOnDark, lineHeight: 1.7 }}>
          ID やパスワードがわからない場合は<br />担当者にお問い合わせください。
        </div>
      </form>
    </LoginShell>
  );
}
