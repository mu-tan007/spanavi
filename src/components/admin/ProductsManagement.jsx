import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Card, Badge, Select } from '../ui';

// 事業（products）マスタ管理。商材（business_categories）と業務種別（engagements）は別タブで管理
export default function ProductsManagement({ onToast }) {
  const orgId = getOrgId();
  const [products, setProducts] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { ...product } or {} (new) or null
  const [confirmDelete, setConfirmDelete] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [p, e] = await Promise.all([
      supabase.from('products').select('*').eq('org_id', orgId).order('display_order'),
      supabase.from('engagements').select('id, name, slug, status, product_id, display_order').eq('org_id', orgId).order('display_order'),
    ]);
    if (p.error) onToast?.('事業の取得に失敗: ' + p.error.message, 'error');
    if (e.error) onToast?.('業務種別の取得に失敗: ' + e.error.message, 'error');
    setProducts(p.data || []);
    setEngagements(e.data || []);
    setLoading(false);
  }, [orgId, onToast]);
  useEffect(() => { reload(); }, [reload]);

  const engagementsByProduct = useMemo(() => {
    const map = {};
    (engagements || []).forEach(e => {
      const pid = e.product_id || '__unmapped__';
      if (!map[pid]) map[pid] = [];
      map[pid].push(e);
    });
    return map;
  }, [engagements]);

  const handleSave = async (payload) => {
    if (!payload.name) return { error: new Error('事業名は必須です') };
    if (!payload.slug) return { error: new Error('slug は必須です') };
    if (!/^[a-z0-9_]+$/.test(payload.slug)) return { error: new Error('slug は英小文字・数字・アンダースコアのみ') };
    const isNew = !editing?.id;
    const body = {
      name: payload.name,
      slug: payload.slug,
      display_order: parseInt(payload.display_order) || 0,
      is_active: !!payload.is_active,
      description: payload.description || null,
    };
    const { error } = isNew
      ? await supabase.from('products').insert({ ...body, org_id: orgId })
      : await supabase.from('products').update(body).eq('id', editing.id);
    if (error) { onToast?.('保存に失敗: ' + error.message, 'error'); return { error }; }
    onToast?.(`事業を${isNew ? '作成' : '更新'}しました`);
    setEditing(null);
    await reload();
    return { error: null };
  };

  const handleDelete = async (p) => {
    // is_active=false にする論理削除（紐付く業務種別があると安全に削除しにくいため）
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', p.id);
    if (error) onToast?.('非表示処理に失敗: ' + error.message, 'error');
    else onToast?.(`「${p.name}」を非表示にしました`);
    setConfirmDelete(null);
    await reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Card padding="md">
        <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.6 }}>
          組織の「事業」を管理します（例: 営業代行 / スパキャリ）。
          事業は商材（M&A / SaaS / IFA 等）の親レイヤーで、商材と業務種別は「商材・業務マスタ」タブで管理します。
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>再読込</Button>
        <Button variant="primary" size="sm" onClick={() => setEditing({ is_active: true, display_order: (products[products.length-1]?.display_order || 0) + 1 })}>＋ 新規事業</Button>
      </div>

      {products.map(p => (
        <ProductCard
          key={p.id}
          product={p}
          engagements={engagementsByProduct[p.id] || []}
          onEdit={() => setEditing(p)}
          onDelete={() => setConfirmDelete(p)}
        />
      ))}

      {/* 事業未紐付け 業務種別 */}
      {(engagementsByProduct['__unmapped__'] || []).length > 0 && (
        <Card padding="md" style={{ borderLeft: `3px solid ${color.warn}` }}>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 6 }}>
            事業未紐付けの業務種別
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(engagementsByProduct['__unmapped__'] || []).map(e => (
              <div key={e.id} style={{ fontSize: font.size.xs, color: color.textMid }}>
                ・{e.name} ({e.slug}) <span style={{ color: color.textLight }}>[{e.status}]</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editing !== null && (
        <ProductEditModal
          initial={editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          message={`「${confirmDelete.name}」を非表示にしますか？（is_active=false で各セレクタから除外されます）`}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function ProductCard({ product, engagements, onEdit, onDelete }) {
  return (
    <div style={{
      padding: space[3], background: color.white, border: `1px solid ${color.border}`,
      borderRadius: radius.md, display: 'flex', flexDirection: 'column', gap: space[2],
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy }}>{product.name}</span>
        <code style={{ fontSize: font.size.xs, color: color.textLight, background: color.cream, padding: '1px 6px', borderRadius: radius.sm }}>{product.slug}</code>
        {!product.is_active && <Badge variant="neutral">非表示</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: color.textLight }}>display_order: {product.display_order}</span>
        <Button variant="outline" size="sm" onClick={onEdit}>編集</Button>
        <Button variant="danger" size="sm" onClick={onDelete}>非表示</Button>
      </div>
      {product.description && (
        <div style={{ fontSize: font.size.xs, color: color.textLight }}>{product.description}</div>
      )}
      <div style={{ borderTop: `1px dashed ${color.border}`, paddingTop: space[1.5] }}>
        <div style={{ fontSize: 10, color: color.textLight, marginBottom: 4 }}>
          配下の業務種別 - {engagements.length}件
        </div>
        {engagements.length === 0 ? (
          <div style={{ fontSize: font.size.xs, color: color.textLight, fontStyle: 'italic' }}>紐付く業務種別がありません</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1.5] }}>
            {engagements.map(e => (
              <span key={e.id} style={{
                padding: '2px 8px', borderRadius: radius.sm, fontSize: font.size.xs,
                background: e.status === 'active' ? alpha(color.success, 0.1) : color.offWhite,
                color: e.status === 'active' ? color.success : color.textLight,
                border: `1px solid ${e.status === 'active' ? alpha(color.success, 0.3) : color.border}`,
              }}>{e.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductEditModal({ initial, onSave, onCancel }) {
  const isNew = !initial?.id;
  const [form, setForm] = useState({
    name: initial?.name || '',
    slug: initial?.slug || '',
    display_order: initial?.display_order || 0,
    is_active: initial?.is_active !== false,
    description: initial?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const update = (patch) => setForm(p => ({ ...p, ...patch }));

  const handleSave = async () => {
    setSaving(true); setError(null);
    const { error } = await onSave(form);
    if (error) setError(error.message);
    setSaving(false);
  };

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: alpha('#000', 0.5), zIndex: 20000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, borderRadius: radius.md, width: 500, boxShadow: shadow.xl,
      }}>
        <div style={{ padding: `${space[3]}px ${space[5]}px`, background: color.navy, color: color.white, borderRadius: `${radius.md}px ${radius.md}px 0 0`, fontWeight: font.weight.semibold }}>
          {isNew ? '事業を作成' : '事業を編集'}
        </div>
        <div style={{ padding: space[5], display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <FieldRow label="事業名 *">
            <Input size="sm" value={form.name} onChange={e => update({ name: e.target.value })} placeholder="例: 営業代行 / スパキャリ" />
          </FieldRow>
          <FieldRow label="slug * (英数字・アンダースコアのみ)">
            <Input size="sm" value={form.slug} onChange={e => update({ slug: e.target.value })} placeholder="例: sales_agency / spartia_career_biz" disabled={!isNew} />
            {!isNew && <span style={{ fontSize: 10, color: color.textLight }}>編集中の事業は slug 変更不可（FK整合性のため）</span>}
          </FieldRow>
          <FieldRow label="説明（任意）">
            <Input size="sm" value={form.description} onChange={e => update({ description: e.target.value })} />
          </FieldRow>
          <FieldRow label="表示順">
            <Input size="sm" type="number" value={String(form.display_order)} onChange={e => update({ display_order: parseInt(e.target.value) || 0 })} />
          </FieldRow>
          <FieldRow label="">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: font.size.sm, color: color.textDark }}>
              <input type="checkbox" checked={!!form.is_active} onChange={e => update({ is_active: e.target.checked })} />
              有効（各セレクタに表示）
            </label>
          </FieldRow>
          {error && <div style={{ fontSize: font.size.xs, color: color.danger }}>{error}</div>}
        </div>
        <div style={{ padding: `${space[3]}px ${space[5]}px`, borderTop: `1px solid ${color.border}`, display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>キャンセル</Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={saving}>
            {saving ? '保存中…' : isNew ? '作成' : '更新'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</label>}
      {children}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: alpha('#000', 0.5), zIndex: 30000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, borderRadius: radius.md, padding: space[5], boxShadow: shadow.xl, maxWidth: 480,
      }}>
        <div style={{ fontSize: font.size.base, color: color.textDark, marginBottom: space[4], whiteSpace: 'pre-wrap' }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <Button variant="secondary" size="sm" onClick={onCancel}>キャンセル</Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>非表示にする</Button>
        </div>
      </div>
    </div>
  );
}
