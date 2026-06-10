import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { LoginShell, SHELL_C, inputStyle, labelStyle, makeBtnStyle } from '../../common/LoginShell';

// スパキャリ受講生専用ログイン画面。社内ログイン (/login) とは別 URL。
// 受講生は普通のメールアドレス (例: koyama@ma-sp.co) でログイン。
// ログイン成功後、users.role === 'student' でない場合はサインアウトしてエラー表示。
export default function SpacareerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (authErr) {
      setSubmitting(false);
      setError('メールアドレスまたはパスワードが正しくありません');
      return;
    }

    // ログイン成功後、users.role === 'student' を確認
    const userId = data?.user?.id;
    if (!userId) {
      await supabase.auth.signOut({ scope: 'local' });
      setSubmitting(false);
      setError('ログインに失敗しました。再度お試しください。');
      return;
    }
    const { data: userRow } = await supabase
      .from('users').select('role').eq('id', userId).maybeSingle();
    let role = userRow?.role;
    if (!role) {
      // フォールバック: members.rank も確認
      const { data: memberRow } = await supabase
        .from('members').select('rank').eq('user_id', userId).maybeSingle();
      role = memberRow?.rank;
    }
    if (role !== 'student') {
      await supabase.auth.signOut({ scope: 'local' });
      setSubmitting(false);
      setError('このアカウントはスパキャリ受講生用ではありません。\n運営向けログインは別ページからアクセスしてください。');
      return;
    }

    setSubmitting(false);
    // 別アカウントでログインしていた残骸の profile キャッシュを破棄してからハードロード。
    // (残ったままだと AuthProvider が cachedProfile で loading=false 即時化し、
    //  getSession() 解決前に SpacareerClientApp の auth gate が session=null と誤判定して
    //  /spacareer/login にループバックする)
    try { sessionStorage.removeItem('_sp_profile'); } catch {}
    window.location.href = '/spacareer';
  };

  return (
    <LoginShell
      eyebrow="Spacareer Portal"
      subtitle="受講生メールアドレスとパスワードでログイン"
    >
      <form onSubmit={handleSubmit} autoComplete="off">
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>
            メールアドレス<span style={{ color: SHELL_C.errorRed, marginLeft: 2 }}>*</span>
          </div>
          <input
            className="sp-login-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            required
            autoCapitalize="none"
            autoComplete="email"
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
          <div style={{ marginBottom: 12, fontSize: 12, color: SHELL_C.errorRed, whiteSpace: 'pre-wrap' }}>
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
          パスワードがわからない場合は<br />担当トレーナーまたは運営にお問い合わせください。
        </div>
      </form>
    </LoginShell>
  );
}
