import React, { useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Input, Card } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import { getOrgId } from '../../../../lib/orgContext';

// ============================================================
// AI講座 カテゴリ編集モーダル
// ----------------------------------------------------------------
// 仕様書: tasks/spacareer-spec.md §7.5 - カテゴリ管理
// - 自由追加・編集・並び替え（↑↓）・無効化
// - 既定9種は migration 4 で seed 済み（はじめに見てほしい動画/基礎スキル編/…）
// ============================================================

export default function CourseCategoryEditor({ open, onClose, categories, onChange }) {
  const [items, setItems] = useState(() => (categories || []).map(c => ({ ...c })));
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    if (open) {
      setItems((categories || []).map(c => ({ ...c })));
      setNewName('');
      setError(null);
    }
  }, [open, categories]);

  if (!open) return null;

  const move = (idx, dir) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
  };

  const rename = (idx, value) => {
    const next = [...items];
    next[idx] = { ...next[idx], name: value };
    setItems(next);
  };

  const toggleActive = (idx) => {
    const next = [...items];
    next[idx] = { ...next[idx], is_active: !next[idx].is_active };
    setItems(next);
  };

  const togglePersonal = (idx) => {
    const next = [...items];
    next[idx] = { ...next[idx], is_personal: !next[idx].is_personal };
    setItems(next);
  };

  const addNew = () => {
    const name = newName.trim();
    if (!name) return;
    setItems([...items, { id: `new-${Date.now()}-${Math.random()}`, name, is_active: true, is_personal: false, position: items.length, _new: true }]);
    setNewName('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const orgId = getOrgId();
      // 既存更新 + 新規作成
      const updates = items.map((it, idx) => ({ ...it, position: idx }));
      const news = updates.filter(it => it._new).map(it => ({
        org_id: orgId, name: it.name, position: it.position, is_active: it.is_active, is_personal: !!it.is_personal,
      }));
      const olds = updates.filter(it => !it._new);

      // 削除（既存にあって items にないもの）→ is_active=false に
      const itemIds = new Set(olds.map(it => it.id));
      const toDisable = (categories || []).filter(c => !itemIds.has(c.id));

      if (news.length > 0) {
        const { error: insErr } = await supabase.from('spacareer_course_categories').insert(news);
        if (insErr) throw insErr;
      }
      for (const it of olds) {
        const { error: updErr } = await supabase
          .from('spacareer_course_categories')
          .update({ name: it.name, position: it.position, is_active: it.is_active, is_personal: !!it.is_personal })
          .eq('id', it.id);
        if (updErr) throw updErr;
      }
      for (const it of toDisable) {
        const { error: delErr } = await supabase
          .from('spacareer_course_categories')
          .update({ is_active: false })
          .eq('id', it.id);
        if (delErr) throw delErr;
      }
      onChange && onChange();
      onClose && onClose();
    } catch (e) {
      console.error('[CourseCategoryEditor] save error:', e);
      setError(e?.message || 'カテゴリ保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
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
          width: '100%', maxWidth: 560, maxHeight: '90vh',
          background: color.white, borderRadius: radius.lg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[4]}px ${space[5]}px`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold }}>カテゴリ管理</div>
          <button onClick={onClose} style={{ background: 'transparent', color: color.white, border: 'none', fontSize: font.size.xl, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: space[5] }}>
          {error && (
            <div style={{
              padding: space[3], marginBottom: space[3],
              background: alpha(color.danger, 0.08),
              border: `1px solid ${alpha(color.danger, 0.3)}`,
              borderRadius: radius.md, color: color.danger, fontSize: font.size.sm,
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {items.map((it, idx) => (
              <div key={it.id} style={{
                display: 'flex', alignItems: 'center', gap: space[2],
                padding: space[2],
                background: it.is_active ? color.white : color.gray50,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    style={iconBtn(idx === 0)}
                  >▲</button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === items.length - 1}
                    style={iconBtn(idx === items.length - 1)}
                  >▼</button>
                </div>
                <input
                  value={it.name}
                  onChange={e => rename(idx, e.target.value)}
                  style={{
                    flex: 1, minWidth: 0,
                    padding: `${space[1.5]}px ${space[2]}px`,
                    fontSize: font.size.sm,
                    border: `1px solid ${color.border}`,
                    borderRadius: radius.md,
                    color: it.is_active ? color.textDark : color.textLight,
                    textDecoration: it.is_active ? 'none' : 'line-through',
                  }}
                />
                <Button
                  size="sm"
                  variant={it.is_personal ? 'primary' : 'outline'}
                  onClick={() => togglePersonal(idx)}
                  title="ONにすると受講生ごとの個別配信専用カテゴリーになり、受講生画面では「(氏名)さん専用のAI講座」として表示されます"
                >
                  専用配信
                </Button>
                <Button
                  size="sm"
                  variant={it.is_active ? 'outline' : 'secondary'}
                  onClick={() => toggleActive(idx)}
                >
                  {it.is_active ? '有効' : '無効'}
                </Button>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: space[4], padding: space[3],
            background: color.cream, borderRadius: radius.md,
            display: 'flex', gap: space[2], alignItems: 'flex-end',
          }}>
            <Input
              label="新規カテゴリ追加"
              placeholder="例: AI議事録テクニック"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              containerStyle={{ flex: 1 }}
            />
            <Button variant="primary" onClick={addNew}>追加</Button>
          </div>
        </div>

        <div style={{
          padding: `${space[3]}px ${space[5]}px`,
          borderTop: `1px solid ${color.borderLight}`,
          background: color.cream,
          display: 'flex', justifyContent: 'flex-end', gap: space[2],
        }}>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>保存</Button>
        </div>
      </div>
    </div>
  );
}

const iconBtn = (disabled) => ({
  width: 22, height: 18, padding: 0,
  fontSize: 10, lineHeight: 1,
  background: color.white, color: disabled ? color.textLight : color.navy,
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});
