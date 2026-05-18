import React, { useMemo, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Badge, Input } from '../../../ui';
import TemplateEditor from './TemplateEditor';
import TemplateHistory from './TemplateHistory';
import { TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATE_HISTORY } from './mockTemplates';

// 仕様書: §7.6 テンプレート管理（11種を機能別4タブで分類）
// 編集権限：トレーナーは11種すべて編集可。AIプロンプト・診断質問項目・各タイプ説明文・ヒアリングシートは運営のみ。
// （現状は権限フィルタはステップ2完成後の useAccessControl で実装、ここでは表示のみ）
export default function SpacareerTemplatesView() {
  const [activeCategory, setActiveCategory] = useState('homework');
  const [selectedKey, setSelectedKey] = useState('homework_1');
  const [showHistory, setShowHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [snapshot, setSnapshot] = useState(TEMPLATES); // ローカル編集状態（mock）

  const categoryCounts = useMemo(() => {
    const m = {};
    snapshot.forEach(t => { m[t.category] = (m[t.category] || 0) + 1; });
    return m;
  }, [snapshot]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.filter(t => t.category === activeCategory && (
      !q || t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    ));
  }, [snapshot, activeCategory, search]);

  const selected = snapshot.find(t => t.key === selectedKey);

  const handleSave = (tpl, newBody) => {
    setSnapshot(prev => prev.map(t => t.key === tpl.key ? {
      ...t,
      body: newBody,
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      updatedBy: '（操作中ユーザー）',
    } : t));
  };
  const handleToggle = (tpl) => {
    setSnapshot(prev => prev.map(t => t.key === tpl.key ? { ...t, enabled: !t.enabled } : t));
  };

  return (
    <div style={{ padding: space[3] }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space[4], flexWrap: 'wrap', gap: space[3] }}>
        <div>
          <h1 style={{
            fontSize: font.size['2xl'],
            fontWeight: font.weight.bold,
            color: color.navy,
            marginBottom: 4,
            letterSpacing: font.letterSpacing.tight,
          }}>
            テンプレート管理
          </h1>
          <p style={{ fontSize: font.size.sm, color: color.textMid }}>
            既存11種のテンプレートを機能別4タブで管理します。配信済み事前課題は旧テンプレ版のまま固定。
          </p>
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <Button variant={showHistory ? 'outline' : 'ghost'} size="md" onClick={() => setShowHistory(s => !s)}>
            {showHistory ? '編集に戻る' : '変更履歴を見る'}
          </Button>
        </div>
      </div>

      {/* カテゴリタブ */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${color.border}`, marginBottom: space[4] }}>
        {TEMPLATE_CATEGORIES.map(c => {
          const active = c.key === activeCategory;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCategory(c.key)}
              style={{
                padding: `${space[2]}px ${space[4]}px`,
                fontSize: font.size.sm,
                fontWeight: font.weight.semibold,
                fontFamily: font.family.sans,
                color: active ? color.navy : color.textMid,
                background: 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${color.navy}` : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {c.label}
              <span style={{
                fontSize: font.size.xs,
                background: active ? color.navy : color.gray200,
                color: active ? color.white : color.textMid,
                padding: '1px 8px',
                borderRadius: radius.pill,
              }}>
                {categoryCounts[c.key] || 0}
              </span>
            </button>
          );
        })}
      </div>

      {showHistory ? (
        <TemplateHistory
          history={TEMPLATE_HISTORY}
          templates={snapshot}
          onSelectTemplate={(key) => {
            const tpl = snapshot.find(t => t.key === key);
            if (tpl) {
              setActiveCategory(tpl.category);
              setSelectedKey(tpl.key);
              setShowHistory(false);
            }
          }}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '320px minmax(0, 1fr)',
          gap: space[4],
          alignItems: 'stretch',
          minHeight: 'calc(100vh - 280px)',
        }}>
          {/* 左：テンプレートリスト */}
          <div style={{
            background: color.white,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            boxShadow: shadow.sm,
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: space[3],
              borderBottom: `1px solid ${color.borderLight}`,
              background: color.cream,
            }}>
              <Input
                size="sm"
                placeholder="テンプレート名で検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: space[4], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
                  該当するテンプレートがありません
                </div>
              ) : filtered.map(tpl => {
                const active = tpl.key === selectedKey;
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setSelectedKey(tpl.key)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: space[3],
                      border: 'none',
                      borderBottom: `1px solid ${color.borderLight}`,
                      borderLeft: active ? `3px solid ${color.navy}` : '3px solid transparent',
                      background: active ? alpha(color.navyLight, 0.08) : color.white,
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{
                        fontSize: font.size.sm,
                        fontWeight: font.weight.semibold,
                        color: active ? color.navy : color.textDark,
                        flex: 1, minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {tpl.label}
                      </span>
                      {tpl.adminOnly && <Badge variant="primary" size="sm">運営のみ</Badge>}
                      {!tpl.enabled && <Badge variant="neutral" size="sm">無効</Badge>}
                    </div>
                    <div style={{ fontSize: font.size.xs, color: color.textMid, lineHeight: font.lineHeight.normal }}>
                      {tpl.description}
                    </div>
                    <div style={{ marginTop: 6, fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>
                      {tpl.updatedAt}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右：エディタ + ライブプレビュー */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <TemplateEditor
              template={selected}
              onSave={handleSave}
              onToggleEnabled={handleToggle}
              savingHint={selected?.type === 'prompt' ? 'AIプロンプトの変更は、次回以降の30項目自動生成から有効になります。' : null}
            />
          </div>
        </div>
      )}
    </div>
  );
}
