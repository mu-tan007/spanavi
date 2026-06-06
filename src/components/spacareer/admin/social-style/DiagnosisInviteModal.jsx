import React, { useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Input, Card } from '../../../ui';
import { supabase } from '../../../../lib/supabase';

// ============================================================
// スパキャリ受講生 招待モーダル
// ----------------------------------------------------------------
// 仕様書: tasks/spacareer-social-style-onboarding.md Phase 2
//
// フロー:
//   1. 氏名+メアドを入力
//   2. Edge Function `spacareer-invite-customer` 呼び出し
//      - auth.users 作成（初期パスワード16文字発行）
//      - members(rank='student') + spacareer_customers + 診断行を一括生成
//      - send-email Edge Function 経由でログインURL/ID/パスワード3点を本文に含めた招待メール送信
//   3. 発行されたログイン情報3点を画面に表示（コピー可）
//      - メール送信失敗時は警告 + 手動コピペでSlack等で送付できる導線
// ============================================================

export default function DiagnosisInviteModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

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
      if (fnError) {
        // supabase-js は non-2xx 時に Response 本体を error.context に持つ。
        // そこから JSON を読み出して Edge Function 側の error メッセージを表示する。
        let detail = fnError.message || 'Edge Function でエラーが発生しました';
        try {
          if (fnError.context && typeof fnError.context.json === 'function') {
            const body = await fnError.context.json();
            if (body?.error) detail = `${detail}\n詳細: ${body.error}`;
          }
        } catch { /* noop */ }
        throw new Error(detail);
      }
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

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      /* noop */
    }
  };

  const handleClose = () => {
    setName('');
    setEmail('');
    setError(null);
    setResult(null);
    setCopiedField(null);
    onClose && onClose();
  };

  const buildClipboardSummary = () => {
    if (!result) return '';
    return (
      `${name || result.email} 様\n\n` +
      `この度はスパキャリにお申し込みいただき、誠にありがとうございます。\n` +
      `受講開始にあたり、専用のログイン情報をご案内いたします。\n\n` +
      `■ ログインURL\n${result.login_url}\n\n` +
      `■ ログインID（メールアドレス）\n${result.email}\n\n` +
      `■ 初期パスワード\n${result.initial_password}\n\n` +
      `ログイン後、最初に「ソーシャルスタイル診断」（全30問・約5分）にご回答ください。\n` +
      `セキュリティのため、初回ログイン後はパスワードの変更を推奨いたします。\n\n` +
      `スパキャリ事務局`
    );
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
          width: '100%', maxWidth: 620,
          background: color.white,
          borderRadius: radius.lg,
          boxShadow: shadow.xl,
          overflow: 'hidden',
          maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
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
              受講生を招待 / アカウント発行
            </div>
            <div style={{ fontSize: font.size.xs, opacity: 0.85, marginTop: 4 }}>
              氏名とメールアドレスを入力すると、初期パスワードを発行してログイン情報の招待メールを自動送信します
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
        <div style={{ padding: space[5], display: 'flex', flexDirection: 'column', gap: space[4], overflowY: 'auto' }}>
          {!result && (
            <>
              <Input
                label="お名前"
                required
                placeholder="例: 山田 太郎"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={submitting}
                hint="メール冒頭の宛名・受講生プロフィールの氏名として使用します"
              />
              <Input
                label="メールアドレス"
                required
                type="email"
                placeholder="example@company.co.jp"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={submitting}
                hint="このアドレスに「ログインURL / ID / 初期パスワード」を含む招待メールが届きます"
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
            <>
              {result.email_sent ? (
                <div style={{
                  padding: space[3],
                  background: alpha(color.success, 0.08),
                  border: `1px solid ${alpha(color.success, 0.3)}`,
                  borderRadius: radius.md,
                  color: color.textDark,
                  fontSize: font.size.sm,
                  lineHeight: font.lineHeight.relaxed,
                }}>
                  <strong>{result.email}</strong> 宛に招待メールを送信しました（差出人: 篠宮 shinomiya@ma-sp.co）。<br/>
                  下記のログイン情報は、念のため運営側でも控えとして保管できます。
                </div>
              ) : (
                <div style={{
                  padding: space[3],
                  background: alpha(color.warn, 0.1),
                  border: `1px solid ${alpha(color.warn, 0.4)}`,
                  borderRadius: radius.md,
                  color: color.textDark,
                  fontSize: font.size.sm,
                  lineHeight: font.lineHeight.relaxed,
                }}>
                  <strong>アカウントは発行されましたが、招待メールの自動送信に失敗しました。</strong><br/>
                  下記の「メール文面（コピー用）」をそのままSlack/メールで受講生にお送りください。<br/>
                  {result.email_error && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: font.size.xs, color: color.textMid }}>
                      送信エラー: {result.email_error}
                    </span>
                  )}
                </div>
              )}

              <Card variant="subtle" padding="md" title="ログイン情報">
                <CredentialRow
                  label="ログインURL"
                  value={result.login_url}
                  copied={copiedField === 'url'}
                  onCopy={() => handleCopy(result.login_url, 'url')}
                  mono
                />
                <CredentialRow
                  label="ログインID（メール）"
                  value={result.email}
                  copied={copiedField === 'email'}
                  onCopy={() => handleCopy(result.email, 'email')}
                  mono
                />
                <CredentialRow
                  label="初期パスワード"
                  value={result.initial_password}
                  copied={copiedField === 'pw'}
                  onCopy={() => handleCopy(result.initial_password, 'pw')}
                  mono
                  bold
                />
              </Card>

              <Card variant="subtle" padding="md" title="メール文面（コピー用）"
                description="メール送信に失敗した場合や、Slack 等で別送したい場合にご利用ください">
                <textarea
                  readOnly
                  value={buildClipboardSummary()}
                  rows={11}
                  style={{
                    width: '100%',
                    padding: space[3],
                    fontSize: font.size.sm,
                    fontFamily: font.family.sans,
                    color: color.textDark,
                    background: color.white,
                    border: `1px solid ${color.border}`,
                    borderRadius: radius.md,
                    resize: 'vertical',
                    lineHeight: font.lineHeight.normal,
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ marginTop: space[2], display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    size="sm"
                    variant={copiedField === 'msg' ? 'primary' : 'outline'}
                    onClick={() => handleCopy(buildClipboardSummary(), 'msg')}
                  >
                    {copiedField === 'msg' ? 'コピー済' : '文面をコピー'}
                  </Button>
                </div>
              </Card>

              {result.existing_user && (
                <div style={{
                  padding: space[2],
                  background: color.cream,
                  borderRadius: radius.md,
                  fontSize: font.size.xs,
                  color: color.textMid,
                  lineHeight: font.lineHeight.relaxed,
                }}>
                  ※ 同じメールアドレスが既に登録済みだったため、パスワードを上記の新しい値に再設定しました。
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
                <Button variant="outline" onClick={() => { setResult(null); setName(''); setEmail(''); setCopiedField(null); }}>
                  続けて別の受講生を招待
                </Button>
                <Button variant="primary" onClick={handleClose}>
                  閉じる
                </Button>
              </div>
            </>
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
              アカウント発行 + 招待メール送信
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CredentialRow({ label, value, copied, onCopy, mono, bold }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[2],
      padding: `${space[2]}px 0`,
      borderBottom: `1px solid ${color.borderLight}`,
    }}>
      <div style={{
        width: 140, flexShrink: 0,
        fontSize: font.size.xs, color: color.textMid,
        fontWeight: font.weight.semibold,
        letterSpacing: font.letterSpacing.wide,
      }}>{label}</div>
      <div style={{
        flex: 1, minWidth: 0,
        fontSize: font.size.sm,
        color: color.textDark,
        fontFamily: mono ? font.family.mono : undefined,
        fontWeight: bold ? font.weight.bold : font.weight.normal,
        wordBreak: 'break-all',
      }}>{value}</div>
      <Button size="sm" variant={copied ? 'primary' : 'outline'} onClick={onCopy}>
        {copied ? 'コピー済' : 'コピー'}
      </Button>
    </div>
  );
}
