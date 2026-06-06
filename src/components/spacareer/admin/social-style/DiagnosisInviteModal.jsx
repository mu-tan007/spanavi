import React, { useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Input, Card } from '../../../ui';
import { supabase } from '../../../../lib/supabase';

// ============================================================
// スパキャリ受講生 招待モーダル
// ----------------------------------------------------------------
// 仕様書: tasks/spacareer-social-style-onboarding.md Phase 2
//
// 旧 DiagnosisInviteModal（メアド + Slack 文面コピペ）から
// 「氏名 + メアド → 招待メール自動送信」フローに刷新。
//
// Edge Function `spacareer-invite-customer` を呼ぶと:
//   - auth.users 招待メール送信（Resend: noreply@spanavi.jp）
//   - members(rank='student') + spacareer_customers 作成
//   - spacareer_social_style_responses 行を customer_id 紐付きで先回し挿入
// ============================================================

export default function DiagnosisInviteModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { customer_id, member_id, email, existing_user }

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName) { setError('お名前を入力してください'); return; }
    if (!trimmedEmail) { setError('メールアドレスを入力してください'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('正しいメールアドレス形式で入力してください');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('spacareer-invite-customer', {
        body: { name: trimmedName, email: trimmedEmail },
      });
      if (fnError) throw new Error(fnError.message || JSON.stringify(fnError));
      if (data?.error) throw new Error(data.error);
      setResult(data);
      if (onCreated) onCreated(data);
    } catch (e) {
      console.error('[CustomerInviteModal] submit error:', e);
      setError(e?.message || '招待に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setEmail('');
    setError(null);
    setResult(null);
    onClose && onClose();
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: space[4],
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: color.white,
          borderRadius: radius.lg,
          boxShadow: shadow.xl,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          background: color.navy,
          color: color.white,
          padding: `${space[4]}px ${space[5]}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, letterSpacing: font.letterSpacing.wide }}>
              受講生を招待
            </div>
            <div style={{ fontSize: font.size.xs, opacity: 0.85, marginTop: 4 }}>
              お名前とメールアドレスを入力すると、招待メールが自動送信されます
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent', color: color.white, border: 'none',
              fontSize: font.size.xl, cursor: 'pointer', lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: space[5], display: 'flex', flexDirection: 'column', gap: space[4] }}>
          {!result && (
            <>
              <Input
                label="お名前"
                required
                placeholder="例: 山田 太郎"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={submitting}
                hint="本人確認用に必要です。後から管理画面で編集できます。"
              />
              <Input
                label="メールアドレス"
                required
                type="email"
                placeholder="example@company.co.jp"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={submitting}
                hint="このアドレスに招待メールが届きます（差出人: noreply@spanavi.jp）"
              />
            </>
          )}

          {error && (
            <div style={{
              padding: space[3],
              background: alpha(color.danger, 0.08),
              border: `1px solid ${alpha(color.danger, 0.3)}`,
              borderRadius: radius.md,
              color: color.danger,
              fontSize: font.size.sm,
              whiteSpace: 'pre-wrap',
            }}>
              {error}
            </div>
          )}

          {result && (
            <Card padding="md" title="招待を送信しました" variant="subtle">
              <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed }}>
                <strong>{result.email}</strong> 宛に
                {result.existing_user ? 'パスワード再設定リンク' : '初回ログイン用の招待リンク'}
                を送信しました。
              </div>
              <div style={{
                marginTop: space[3],
                padding: space[3],
                background: color.cream,
                borderRadius: radius.md,
                fontSize: font.size.xs,
                color: color.textMid,
                lineHeight: font.lineHeight.relaxed,
              }}>
                受講生はメール内のリンクからパスワードを設定するとログインでき、
                <strong>ログイン直後にソーシャルスタイル診断（全30問）が自動的に表示</strong>されます。
                診断完了までは他のメニューに進めません。
              </div>
              <div style={{ marginTop: space[3], display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
                <Button variant="outline" size="sm" onClick={() => { setResult(null); setName(''); setEmail(''); }}>
                  続けて別の受講生を招待
                </Button>
                <Button variant="primary" size="sm" onClick={handleClose}>
                  閉じる
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div style={{
            padding: `${space[3]}px ${space[5]}px`,
            borderTop: `1px solid ${color.borderLight}`,
            background: color.cream,
            display: 'flex', justifyContent: 'flex-end', gap: space[2],
          }}>
            <Button variant="outline" onClick={handleClose} disabled={submitting}>キャンセル</Button>
            <Button variant="primary" onClick={handleSubmit} loading={submitting}>
              招待メールを送信する
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
