import React, { useMemo, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Input, Card } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import { getOrgId } from '../../../../lib/orgContext';

// ============================================================
// ソーシャルスタイル診断 招待モーダル
// ----------------------------------------------------------------
// 仕様書: tasks/spacareer-spec.md §5.1, §7.4, §9.1
// - メールアドレスを入力 → 招待トークンを発行
// - 招待URL（トークン付き）と Slack 用文面を生成 → コピー
// - スパキャリ事業の運営は Slack ゲストチャンネル経由で URL を送付
// ============================================================

function generateToken() {
  // 32文字英数字（crypto優先、なければMath.random）
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function buildInviteUrl(token) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/spacareer/social-style?token=${token}`;
}

function buildSlackMessage({ email, url }) {
  const safeEmail = email || '受講予定者様';
  return (
    `${safeEmail} 様\n\n` +
    'この度はスパキャリへのお申し込みありがとうございます。\n' +
    'スパナビ受講開始にあたり、まず最初にソーシャルスタイル診断（全30問・所要約5分）にご回答ください。\n\n' +
    `■ 診断URL\n${url}\n\n` +
    '途中で中断された場合も、同じURLから再開していただけます。\n' +
    '診断完了をもってスパナビアカウントを自動発行いたします。\n\n' +
    '何かご不明点がございましたら、本Slackチャンネルへお気軽にお問い合わせください。\n' +
    'スパキャリ事務局'
  );
}

export default function DiagnosisInviteModal({ open, onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [issued, setIssued] = useState(null); // { token, url }
  const [copiedField, setCopiedField] = useState(null);

  const slackMessage = useMemo(() => {
    if (!issued) return '';
    return buildSlackMessage({ email, url: issued.url });
  }, [issued, email]);

  if (!open) return null;

  const handleIssue = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('メールアドレスを入力してください');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('正しいメールアドレス形式で入力してください');
      return;
    }
    setSaving(true);
    try {
      const token = generateToken();
      const orgId = getOrgId();
      const { data, error: insertError } = await supabase
        .from('spacareer_social_style_responses')
        .insert({
          org_id: orgId,
          invite_email: trimmed,
          invite_token: token,
          answers: [],
          current_question_no: 0,
        })
        .select('id, invite_token, invite_email')
        .single();
      if (insertError) throw insertError;
      const url = buildInviteUrl(data.invite_token);
      setIssued({ token: data.invite_token, url });
      if (onCreated) onCreated(data);
    } catch (e) {
      console.error('[DiagnosisInviteModal] issue error:', e);
      setError(e?.message || '招待発行に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      setError('クリップボードへのコピーに失敗しました');
    }
  };

  const handleClose = () => {
    setEmail('');
    setIssued(null);
    setError(null);
    setCopiedField(null);
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
          width: '100%', maxWidth: 640,
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
              ソーシャルスタイル診断 招待発行
            </div>
            <div style={{ fontSize: font.size.xs, opacity: 0.8, marginTop: 4 }}>
              招待先メールアドレスを入力し、Slack 送付用の診断URLと文面を生成します
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
          <Input
            label="招待先メールアドレス"
            required
            type="email"
            placeholder="example@company.co.jp"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={!!issued || saving}
            hint="受講予定者の連絡先メールアドレス。アカウント生成時にこのアドレスが初期メールになります。"
          />

          {error && (
            <div style={{
              padding: space[3],
              background: alpha(color.danger, 0.08),
              border: `1px solid ${alpha(color.danger, 0.3)}`,
              borderRadius: radius.md,
              color: color.danger,
              fontSize: font.size.sm,
            }}>
              {error}
            </div>
          )}

          {issued && (
            <>
              <Card variant="subtle" padding="md" title="診断URL" description="そのまま Slack に貼り付けてご利用ください">
                <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
                  <input
                    readOnly
                    value={issued.url}
                    style={{
                      flex: 1, minWidth: 0,
                      padding: `${space[2]}px ${space[3]}px`,
                      fontSize: font.size.sm,
                      fontFamily: font.family.mono,
                      color: color.textDark,
                      background: color.white,
                      border: `1px solid ${color.border}`,
                      borderRadius: radius.md,
                    }}
                  />
                  <Button
                    size="sm"
                    variant={copiedField === 'url' ? 'primary' : 'outline'}
                    onClick={() => handleCopy(issued.url, 'url')}
                  >
                    {copiedField === 'url' ? 'コピー済' : 'コピー'}
                  </Button>
                </div>
              </Card>

              <Card variant="subtle" padding="md" title="Slack 送付文面" description="ゲストチャンネルにそのまま貼り付け可能">
                <textarea
                  readOnly
                  value={slackMessage}
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
                    onClick={() => handleCopy(slackMessage, 'msg')}
                  >
                    {copiedField === 'msg' ? 'コピー済' : '文面をコピー'}
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: `${space[3]}px ${space[5]}px`,
          borderTop: `1px solid ${color.borderLight}`,
          background: color.cream,
          display: 'flex', justifyContent: 'flex-end', gap: space[2],
        }}>
          <Button variant="outline" onClick={handleClose}>閉じる</Button>
          {!issued && (
            <Button variant="primary" onClick={handleIssue} loading={saving}>
              招待を発行する
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
