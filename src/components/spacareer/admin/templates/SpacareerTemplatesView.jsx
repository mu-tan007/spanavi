import React, { useMemo, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Badge, Input } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import SubTabs from '../_shared/SubTabs';
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

  const categoryTabs = useMemo(
    () => TEMPLATE_CATEGORIES.map(c => ({
      key: c.key,
      label: c.label,
      badge: categoryCounts[c.key] || 0,
    })),
    [categoryCounts]
  );

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="テンプレート管理"
        description="既存11種のテンプレートを機能別4タブで管理します。配信済み事前課題は旧テンプレ版のまま固定。"
        right={(
          <Button variant={showHistory ? 'outline' : 'ghost'} size="md" onClick={() => setShowHistory(s => !s)}>
            {showHistory ? '編集に戻る' : '変更履歴を見る'}
          </Button>
        )}
        style={{ marginBottom: space[4] }}
      />

      <SubTabs tabs={categoryTabs} activeKey={activeCategory} onChange={setActiveCategory} dense />

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
