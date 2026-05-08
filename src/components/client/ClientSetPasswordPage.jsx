import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Button, Input } from '../ui';
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
      background: color.offWhite, fontFamily: font.family.sans,
    }}>
      <div style={{
        background: color.white,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: `${space[8]}px ${space[8] + space[1]}px`,
        width: 380,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: space[4] }}>
          <SpanaviLogo size={32} textSize={20} gap={10} uidSuffix="client-setpw" />
        </div>
        <div style={{
          fontSize: font.size.xs,
          color: color.textLight,
          letterSpacing: font.letterSpacing.widest,
          textTransform: 'uppercase',
          marginBottom: space[1],
          textAlign: 'center',
        }}>
          Client Portal
        </div>
        <h1 style={{
          fontSize: font.size.xl,
          fontWeight: font.weight.semibold,
          color: color.navy,
          margin: `0 0 ${space[3]}px`,
          fontFamily: font.family.display + ',' + font.family.sans,
          textAlign: 'center',
        }}>
          パスワード設定
        </h1>
        <p style={{
          fontSize: font.size.xs,
          color: color.textMid,
          marginBottom: space[5],
        }}>
          初回ログインです。Spanavi クライアント・ポータル用のパスワードを設定してください。次回以降はこのパスワードでログインします。
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: space[2] + 2 }}>
          <Input
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            label="新しいパスワード (8文字以上)"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Input
            type="password"
            required
            autoComplete="new-password"
            label="確認用パスワード"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
          {error && (
            <div style={{
              fontSize: font.size.xs,
              color: color.danger,
              background: color.dangerSoft,
              padding: `${space[2]}px ${space[2] + 2}px`,
              borderRadius: radius.sm,
              border: `1px solid ${alpha(color.danger, 0.25)}`,
            }}>
              {error}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            loading={submitting}
            disabled={submitting}
            style={{ marginTop: space[1] + 2 }}
          >
            {submitting ? '設定中...' : 'パスワードを設定してログイン'}
          </Button>
        </form>
      </div>
    </div>
  );
}
