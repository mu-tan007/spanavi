import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import SpanaviLogo from '../common/SpanaviLogo';

// 招待メールから初回アクセスしたクライアントに、パスワードを設定させる画面。
// 成功したら user_metadata.password_set = true をセットして /client へ。
export default function ClientSetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('8文字以上のパスワードを設定してください'); return; }
    if (password !== confirm) { setError('確認用パスワードが一致しません'); return; }
    setSubmitting(true);
    const { error: updErr } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    });
    setSubmitting(false);
    if (updErr) { setError(updErr.message || 'パスワード設定に失敗しました'); return; }
    // URL ハッシュ (access_token など) をクリアしてポータルへ
    window.history.replaceState(null, '', '/client');
    window.location.href = '/client';
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.offWhite, fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '32px 36px', width: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <SpanaviLogo size={32} textSize={20} gap={10} uidSuffix="client-setpw" />
        </div>
        <div style={{ fontSize: 11, color: C.textLight, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4, textAlign: 'center' }}>
          Client Portal
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: C.navy, margin: '0 0 12px', fontFamily: "'Outfit','Noto Sans JP',sans-serif", textAlign: 'center' }}>
          パスワード設定
        </h1>
        <p style={{ fontSize: 11, color: C.textMid, marginBottom: 20 }}>
          初回ログインです。Spanavi クライアント・ポータル用のパスワードを設定してください。次回以降はこのパスワードでログインします。
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: C.textMid }}>新しいパスワード (8文字以上)
            <input type="password" required autoFocus autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 11, color: C.textMid }}>確認用パスワード
            <input type="password" required autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} />
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
          >{submitting ? '設定中...' : 'パスワードを設定してログイン'}</button>
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
