import React, { useMemo, useState, useEffect } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button } from '../../ui';

// 一斉メール送信モーダル (CRM の複数選択行 → BCC 一括送信)
// - 各クライアントの主担当 (contactsByClient の isPrimary 担当) を To に
// - 主担当 email が無い場合は除外
// - 件名 / 本文を入力 → mailto: で BCC 形式で全員に一発送信
export default function BulkEmailModal({ clients = [], contactsByClient = {}, currentUser = '', onClose }) {
  // 各クライアントの主担当 email を抽出
  const recipients = useMemo(() => {
    return clients.map(c => {
      const list = contactsByClient[c._supaId] || [];
      const primary = list.find(ct => ct.isPrimary) || list[0];
      return {
        clientId: c._supaId,
        company: c.company,
        contactName: primary?.name || '',
        email: primary?.email || '',
      };
    });
  }, [clients, contactsByClient]);

  const valid = recipients.filter(r => !!r.email);
  const invalid = recipients.filter(r => !r.email);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    // 簡易デフォルト本文
    setSubject('');
    setBody([
      '各位',
      '',
      'いつも大変お世話になっております。',
      `M&Aソーシングパートナーズ ${currentUser || ''} です。`,
      '',
      '',
      '',
      '何卒よろしくお願いいたします。',
    ].join('\n'));
  }, [currentUser]);

  const handleSend = () => {
    if (valid.length === 0) {
      alert('送信可能な宛先がありません。担当者にメールアドレスが登録されていません。');
      return;
    }
    const bcc = valid.map(r => r.email).join(',');
    const params = new URLSearchParams();
    params.set('subject', subject);
    params.set('body', body);
    // mailto は to なしでも開ける (Gmail web 互換のため空 to を許可)
    const href = `mailto:?bcc=${encodeURIComponent(bcc)}&${params.toString()}`;
    window.location.href = href;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: alpha(color.navyDeep || '#081636', 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, padding: space[4],
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl || shadow.lg,
          width: '100%', maxWidth: 720, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          fontFamily: font.family.sans,
        }}
      >
        {/* ヘッダー */}
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[3]}px ${space[5]}px`,
          borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
        }}>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold }}>
            一斉メール作成
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
            送信可能 {valid.length} 件 / 未登録 {invalid.length} 件 (全 {recipients.length} 件)
          </div>
        </div>

        {/* 本体 */}
        <div style={{ padding: space[5], overflowY: 'auto', flex: 1 }}>
          {/* 宛先一覧 */}
          <div style={{ marginBottom: space[3] }}>
            <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, marginBottom: 4 }}>
              宛先 (BCC で送信)
            </div>
            <div style={{
              border: `1px solid ${color.border}`, borderRadius: radius.sm,
              padding: space[2], maxHeight: 120, overflowY: 'auto',
              fontSize: font.size.xs, color: color.textDark, background: color.gray50,
            }}>
              {valid.map(r => (
                <div key={r.clientId} style={{ padding: '2px 0' }}>
                  ✓ {r.company} <span style={{ color: color.textLight }}>— {r.contactName} &lt;{r.email}&gt;</span>
                </div>
              ))}
              {invalid.length > 0 && (
                <div style={{ marginTop: space[2], paddingTop: space[2], borderTop: `1px dashed ${color.borderLight}` }}>
                  {invalid.map(r => (
                    <div key={r.clientId} style={{ padding: '2px 0', color: color.danger }}>
                      ✕ {r.company} <span style={{ color: color.textLight }}>— メアド未登録</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 件名 */}
          <div style={{ marginBottom: space[3] }}>
            <label style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, display: 'block', marginBottom: 4 }}>
              件名
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="件名を入力"
              style={{
                width: '100%', padding: `${space[2]}px ${space[3]}px`,
                border: `1px solid ${color.border}`, borderRadius: radius.sm,
                fontSize: font.size.sm, fontFamily: font.family.sans, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 本文 */}
          <div>
            <label style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, display: 'block', marginBottom: 4 }}>
              本文
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              style={{
                width: '100%', padding: `${space[2]}px ${space[3]}px`,
                border: `1px solid ${color.border}`, borderRadius: radius.sm,
                fontSize: font.size.sm, fontFamily: font.family.sans, outline: 'none',
                resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 10, color: color.textLight, marginTop: 4 }}>
              ※ BCC で送信されるため、受信者同士で他の宛先は見えません
            </div>
          </div>
        </div>

        {/* フッター */}
        <div style={{
          padding: `${space[3]}px ${space[5]}px`,
          borderTop: `1px solid ${color.border}`,
          display: 'flex', justifyContent: 'space-between', gap: space[2],
        }}>
          <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={valid.length === 0 || !subject.trim()}
          >メールクライアントを開く ({valid.length} 件)</Button>
        </div>
      </div>
    </div>
  );
}
