import React, { useEffect, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Badge } from '../../../ui';
import { NOTIFICATION_VARIABLES } from './mockTemplates';

// 仕様書: §7.6 テンプレート管理
// ライブプレビュー必須、無効化のみ可能（物理削除なし）
export default function TemplateEditor({ template, onSave, onToggleEnabled, savingHint }) {
  const [body, setBody] = useState(template?.body || '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setBody(template?.body || '');
    setDirty(false);
  }, [template?.key]);

  const handleChange = (v) => {
    setBody(v);
    setDirty(v !== (template?.body || ''));
  };

  if (!template) {
    return (
      <div style={emptyShell()}>
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.35 }}>
          <rect x="10" y="8" width="36" height="42" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <line x1="16" y1="18" x2="40" y2="18" stroke="currentColor" strokeWidth="1.5" />
          <line x1="16" y1="26" x2="40" y2="26" stroke="currentColor" strokeWidth="1.5" />
          <line x1="16" y1="34" x2="32" y2="34" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <div style={{ marginTop: space[2], color: color.textLight, fontSize: font.size.sm }}>
          左のリストからテンプレートを選択してください
        </div>
      </div>
    );
  }

  const isNotification = template.type === 'notification';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: space[3],
      minHeight: 0,
      flex: 1,
    }}>
      {/* 編集ペイン */}
      <div style={paneShell()}>
        <PaneHeader title="編集">
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            {template.adminOnly && <Badge variant="primary" size="sm">運営のみ</Badge>}
            <Badge variant={template.enabled ? 'success' : 'neutral'} dot size="sm">
              {template.enabled ? '有効' : '無効'}
            </Badge>
          </div>
        </PaneHeader>
        <div style={{ padding: space[4], flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: space[2] }}>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
              {template.label}
            </div>
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 4, lineHeight: font.lineHeight.normal }}>
              {template.description}
            </div>
          </div>
          {isNotification && <VariableChips onInsert={(t) => handleChange(body + t)} />}
          <textarea
            value={body}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              flex: 1,
              minHeight: 320,
              padding: space[3],
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              fontSize: font.size.sm,
              color: color.textDark,
              fontFamily: template.type === 'prompt' ? font.family.mono : font.family.sans,
              background: color.white,
              outline: 'none',
              resize: 'vertical',
              lineHeight: font.lineHeight.relaxed,
              boxSizing: 'border-box',
            }}
          />
          <div style={{
            marginTop: space[3], display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2],
          }}>
            <div style={{ fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>
              最終更新：{template.updatedAt} ({template.updatedBy})
              {dirty && <span style={{ marginLeft: 8, color: color.warn, fontWeight: font.weight.semibold }}>● 未保存</span>}
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              <Button variant="ghost" size="sm" onClick={() => onToggleEnabled && onToggleEnabled(template)}>
                {template.enabled ? '無効化' : '有効化'}
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!dirty}
                onClick={() => onSave && onSave(template, body)}
              >
                保存
              </Button>
            </div>
          </div>
          {savingHint && (
            <div style={{
              marginTop: space[2],
              padding: space[2],
              background: alpha(color.warn, 0.12),
              border: `1px solid ${alpha(color.warn, 0.3)}`,
              borderRadius: radius.sm,
              fontSize: font.size.xs,
              color: color.textDark,
              lineHeight: font.lineHeight.normal,
            }}>
              {savingHint}
            </div>
          )}
        </div>
      </div>

      {/* ライブプレビュー */}
      <div style={paneShell()}>
        <PaneHeader title="ライブプレビュー" />
        <div style={{ padding: space[4], overflowY: 'auto', minHeight: 0, flex: 1 }}>
          <Preview template={template} body={body} />
        </div>
      </div>
    </div>
  );
}

function paneShell() {
  return {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background: color.white,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    boxShadow: shadow.sm,
    overflow: 'hidden',
  };
}

function emptyShell() {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 360,
    background: color.snow,
    border: `1px dashed ${color.border}`,
    borderRadius: radius.lg,
    color: color.textLight,
  };
}

function PaneHeader({ title, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2],
      padding: `${space[2]}px ${space[4]}px`,
      borderBottom: `1px solid ${color.borderLight}`,
      background: color.cream,
    }}>
      <div style={{
        fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.textMid,
        letterSpacing: font.letterSpacing.wide, textTransform: 'uppercase',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function VariableChips({ onInsert }) {
  return (
    <div style={{ marginBottom: space[2] }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1], fontWeight: font.weight.semibold, letterSpacing: font.letterSpacing.wide }}>
        利用可能変数（クリックで挿入）
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {NOTIFICATION_VARIABLES.map(v => (
          <button
            key={v.token}
            type="button"
            onClick={() => onInsert(v.token)}
            title={v.hint}
            style={{
              padding: '3px 8px',
              fontSize: font.size.xs,
              fontFamily: font.family.mono,
              border: `1px solid ${alpha(color.navyLight, 0.3)}`,
              background: alpha(color.navyLight, 0.08),
              color: color.navy,
              borderRadius: radius.sm,
              cursor: 'pointer',
            }}
          >
            {v.token}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── プレビュー ─────────────────────────────────────────────
function Preview({ template, body }) {
  if (template.type === 'notification') {
    return <NotificationPreview body={body} />;
  }
  if (template.type === 'items') {
    return <ItemsPreview body={body} />;
  }
  if (template.type === 'prompt') {
    return <PromptPreview body={body} />;
  }
  // text
  return (
    <pre style={{
      margin: 0, whiteSpace: 'pre-wrap',
      fontSize: font.size.sm, color: color.textDark,
      fontFamily: font.family.sans, lineHeight: font.lineHeight.relaxed,
    }}>
      {body || '（本文なし）'}
    </pre>
  );
}

function NotificationPreview({ body }) {
  // 変数を実際の値に置換したサンプル
  const sample = body
    .replace(/\{顧客名\}/g, '山田 太郎')
    .replace(/\{セッション番号\}/g, '3')
    .replace(/\{セッション日時\}/g, '2026-05-22 14:00')
    .replace(/\{締切日\}/g, '2026-05-19')
    .replace(/\{担当トレーナー\}/g, '佐藤 美咲')
    .replace(/\{ポータルURL\}/g, 'https://spanavi.example.com/career/homework/3');
  return (
    <div>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[2] }}>
        Slack ゲストチャンネルでの見え方（変数を置換したサンプル）
      </div>
      <div style={{
        background: '#F8F8F8',
        border: `1px solid ${color.border}`,
        borderLeft: `3px solid #4A154B`,
        borderRadius: radius.md,
        padding: space[3],
        fontSize: font.size.sm,
        color: color.textDark,
        fontFamily: font.family.sans,
        whiteSpace: 'pre-wrap',
        lineHeight: font.lineHeight.relaxed,
      }}>
        {sample || '（本文なし）'}
      </div>
    </div>
  );
}

function ItemsPreview({ body }) {
  const lines = body.split('\n').filter(l => l.trim().length > 0);
  return (
    <ol style={{ paddingLeft: space[4], margin: 0, display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {lines.map((l, i) => (
        <li key={i} style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed }}>
          {l.replace(/^\d+[\.\)]\s*/, '')}
        </li>
      ))}
    </ol>
  );
}

function PromptPreview({ body }) {
  return (
    <div>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[2] }}>
        Claude に渡される最終プロンプト（変数はランタイムで実値に置換）
      </div>
      <pre style={{
        margin: 0,
        padding: space[3],
        background: color.gray900,
        color: '#E7E7EB',
        borderRadius: radius.md,
        fontFamily: font.family.mono,
        fontSize: font.size.xs,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        overflowX: 'auto',
      }}>
        {body || '（プロンプト未定）'}
      </pre>
    </div>
  );
}
