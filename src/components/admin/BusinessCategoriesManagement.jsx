import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Card, Badge, Select } from '../ui';

// 商材（business_categories）と配下の業務種別（engagements）を CRUD する画面。
// 事業（products）を上部セレクタで選択し、その配下の商材ツリーを展開する。
export default function BusinessCategoriesManagement({ onToast }) {
  const orgId = getOrgId();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [roles, setRoles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState(null);

  const [editingCategory, setEditingCategory] = useState(null);
  const [editingEngagement, setEditingEngagement] = useState(null);
  const [confirmCategoryHide, setConfirmCategoryHide] = useState(null);
  const [confirmEngagementHide, setConfirmEngagementHide] = useState(null);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [p, c, e, ra, ro, t] = await Promise.all([
      supabase.from('products').select('*').eq('org_id', orgId).eq('is_active', true).order('display_order'),
      supabase.from('business_categories').select('*').eq('org_id', orgId).order('display_order'),
      supabase.from('engagements').select('*').eq('org_id', orgId).order('display_order'),
      supabase.from('engagement_ranks').select('*').eq('org_id', orgId).order('display_order'),
      supabase.from('engagement_roles').select('*').eq('org_id', orgId).order('display_order'),
      supabase.from('appointment_report_templates').select('*').eq('org_id', orgId).eq('scope_level', 'engagement'),
    ]);
    if (p.error) onToast?.('事業の取得に失敗: ' + p.error.message, 'error');
    if (c.error) onToast?.('商材の取得に失敗: ' + c.error.message, 'error');
    if (e.error) onToast?.('業務種別の取得に失敗: ' + e.error.message, 'error');
    setProducts(p.data || []);
    setCategories(c.data || []);
    setEngagements(e.data || []);
    setRanks(ra.data || []);
    setRoles(ro.data || []);
    setTemplates(t.data || []);
    setLoading(false);
  }, [orgId, onToast]);

  useEffect(() => { reload(); }, [reload]);

  // 初期事業を「営業代行」優先で自動選択
  useEffect(() => {
    if (selectedProductId || products.length === 0) return;
    const sa = products.find(p => p.slug === 'sales_agency');
    setSelectedProductId(sa?.id || products[0].id);
  }, [products, selectedProductId]);

  const visibleCategories = useMemo(
    () => categories.filter(c => c.product_id === selectedProductId),
    [categories, selectedProductId]
  );

  const engagementsByCategory = useMemo(() => {
    const map = {};
    engagements.forEach(e => {
      const cid = e.category_id || '__uncategorized__';
      if (!map[cid]) map[cid] = [];
      map[cid].push(e);
    });
    return map;
  }, [engagements]);

  // ─── 商材 CRUD ───
  const saveCategory = async (form) => {
    if (!form.name) return { error: new Error('商材名は必須です') };
    if (!form.slug) return { error: new Error('slug は必須です') };
    if (!/^[a-z0-9_]+$/.test(form.slug)) return { error: new Error('slug は英小文字・数字・アンダースコアのみ') };
    if (!form.product_id) return { error: new Error('事業を選択してください') };
    const isNew = !editingCategory?.id;
    const body = {
      name: form.name,
      slug: form.slug,
      product_id: form.product_id,
      display_order: parseInt(form.display_order) || 0,
      is_active: !!form.is_active,
      description: form.description || null,
    };
    let categoryRow;
    if (isNew) {
      const { data, error } = await supabase.from('business_categories')
        .insert({ ...body, org_id: orgId })
        .select()
        .single();
      if (error) { onToast?.('保存に失敗: ' + error.message, 'error'); return { error }; }
      categoryRow = data;
    } else {
      const { data, error } = await supabase.from('business_categories')
        .update(body).eq('id', editingCategory.id)
        .select()
        .single();
      if (error) { onToast?.('保存に失敗: ' + error.message, 'error'); return { error }; }
      categoryRow = data;
    }

    // 複製モード（新規作成時のみ）
    if (isNew && form.cloneFromCategoryId) {
      const cloneError = await cloneCategoryContents(form.cloneFromCategoryId, categoryRow, form.slug);
      if (cloneError) {
        onToast?.('商材は作成しましたが、複製で一部失敗: ' + cloneError, 'warn');
      }
    }

    onToast?.(`商材を${isNew ? '作成' : '更新'}しました`);
    setEditingCategory(null);
    await reload();
    return { error: null };
  };

  const cloneCategoryContents = async (srcCategoryId, newCategory, newCategorySlug) => {
    const srcEngs = engagements.filter(e => e.category_id === srcCategoryId);
    const errors = [];
    for (const src of srcEngs) {
      const newSlug = `${src.slug}_${newCategorySlug}`;
      const { data: newEng, error: engErr } = await supabase.from('engagements')
        .insert({
          org_id: orgId,
          product_id: newCategory.product_id,
          category_id: newCategory.id,
          name: src.name,
          slug: newSlug,
          type: src.type,
          status: 'active',
          display_order: src.display_order || 0,
          description: src.description,
        })
        .select()
        .single();
      if (engErr) { errors.push(`業務種別「${src.name}」複製失敗: ${engErr.message}`); continue; }

      const srcRanks = ranks.filter(r => r.engagement_id === src.id);
      for (const r of srcRanks) {
        const { error } = await supabase.from('engagement_ranks').insert({
          org_id: orgId,
          engagement_id: newEng.id,
          name: r.name,
          display_order: r.display_order,
          default_incentive_rate: r.default_incentive_rate,
          description: r.description,
        });
        if (error) errors.push(`ランク「${r.name}」複製失敗: ${error.message}`);
      }

      const srcRoles = roles.filter(r => r.engagement_id === src.id);
      for (const r of srcRoles) {
        const { error } = await supabase.from('engagement_roles').insert({
          org_id: orgId,
          engagement_id: newEng.id,
          name: r.name,
          display_order: r.display_order,
          bonus_amount: r.bonus_amount,
          bonus_rate: r.bonus_rate,
          description: r.description,
        });
        if (error) errors.push(`ポジション「${r.name}」複製失敗: ${error.message}`);
      }

      const srcTpls = templates.filter(t => t.engagement_id === src.id);
      for (const t of srcTpls) {
        const { error } = await supabase.from('appointment_report_templates').insert({
          org_id: orgId,
          scope_level: 'engagement',
          engagement_id: newEng.id,
          name: t.name,
          description: t.description,
          schema: t.schema,
          body_template: t.body_template,
          ai_prompt: t.ai_prompt,
          is_active: true,
        });
        if (error) errors.push(`報告テンプレ「${t.name}」複製失敗: ${error.message}`);
      }
    }
    return errors.length > 0 ? errors.join(' / ') : null;
  };

  const hideCategory = async (cat) => {
    const { error } = await supabase.from('business_categories')
      .update({ is_active: false }).eq('id', cat.id);
    if (error) onToast?.('非表示処理に失敗: ' + error.message, 'error');
    else onToast?.(`商材「${cat.name}」を非表示にしました`);
    setConfirmCategoryHide(null);
    await reload();
  };

  // ─── 業務種別 CRUD ───
  const saveEngagement = async (form) => {
    if (!form.name) return { error: new Error('業務種別名は必須です') };
    if (!form.slug) return { error: new Error('slug は必須です') };
    if (!/^[a-z0-9_]+$/.test(form.slug)) return { error: new Error('slug は英小文字・数字・アンダースコアのみ') };
    if (!form.type) return { error: new Error('type は必須です') };
    const isNew = !editingEngagement?.id;
    const body = {
      name: form.name,
      slug: form.slug,
      type: form.type,
      display_order: parseInt(form.display_order) || 0,
      description: form.description || null,
    };
    if (isNew) {
      body.org_id = orgId;
      body.category_id = editingEngagement.category_id;
      body.product_id = editingEngagement.product_id;
      body.status = 'active';
    }
    const { error } = isNew
      ? await supabase.from('engagements').insert(body)
      : await supabase.from('engagements').update(body).eq('id', editingEngagement.id);
    if (error) { onToast?.('保存に失敗: ' + error.message, 'error'); return { error }; }
    onToast?.(`業務種別を${isNew ? '作成' : '更新'}しました`);
    setEditingEngagement(null);
    await reload();
    return { error: null };
  };

  const hideEngagement = async (eng) => {
    const { error } = await supabase.from('engagements')
      .update({ status: 'archived' }).eq('id', eng.id);
    if (error) onToast?.('非表示処理に失敗: ' + error.message, 'error');
    else onToast?.(`業務種別「${eng.name}」を非表示にしました`);
    setConfirmEngagementHide(null);
    await reload();
  };

  // ─── レンダリング ───
  const productOptions = useMemo(
    () => products.map(p => ({ value: p.id, label: p.name })),
    [products]
  );

  const cloneSourceOptions = useMemo(() => {
    return categories
      .filter(c => c.is_active && c.product_id === selectedProductId)
      .map(c => ({ value: c.id, label: c.name }));
  }, [categories, selectedProductId]);

  if (loading) {
    return (
      <Card padding="md">
        <div style={{ fontSize: font.size.sm, color: color.textMid }}>読み込み中…</div>
      </Card>
    );
  }

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Card padding="md">
        <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.6 }}>
          事業配下の「商材」と「業務種別」を管理します。
          営業代行配下に M&A / SaaS / IFA / 人材 等の商材を追加し、その下に「売り手ソーシング」「買い手マッチング」などの業務種別を作成できます。
          新規商材作成時に既存商材から一式複製も可能です。
        </div>
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ fontSize: font.size.sm, color: color.textMid, fontWeight: font.weight.semibold }}>事業</div>
        <div style={{ minWidth: 240 }}>
          <Select
            size="sm"
            value={selectedProductId || ''}
            onChange={e => setSelectedProductId(e.target.value)}
            options={productOptions}
          />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
          <Button variant="outline" size="sm" onClick={reload}>再読込</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setEditingCategory({
              is_active: true,
              product_id: selectedProductId,
              display_order: (visibleCategories[visibleCategories.length - 1]?.display_order || 0) + 1,
            })}
            disabled={!selectedProductId}
          >
            ＋ 新規商材
          </Button>
        </div>
      </div>

      {!selectedProductId && (
        <Card padding="md">
          <div style={{ fontSize: font.size.sm, color: color.textMid }}>事業を選択してください。</div>
        </Card>
      )}

      {selectedProductId && visibleCategories.length === 0 && (
        <Card padding="md">
          <div style={{ fontSize: font.size.sm, color: color.textMid }}>
            「{selectedProduct?.name}」配下の商材はまだありません。右上の「＋ 新規商材」から追加できます。
          </div>
        </Card>
      )}

      {visibleCategories.map(cat => (
        <CategoryCard
          key={cat.id}
          category={cat}
          engagements={engagementsByCategory[cat.id] || []}
          ranks={ranks}
          roles={roles}
          onEditCategory={() => setEditingCategory(cat)}
          onHideCategory={() => setConfirmCategoryHide(cat)}
          onAddEngagement={() => setEditingEngagement({
            category_id: cat.id,
            product_id: cat.product_id,
            display_order: ((engagementsByCategory[cat.id] || []).length + 1),
          })}
          onEditEngagement={(eng) => setEditingEngagement(eng)}
          onHideEngagement={(eng) => setConfirmEngagementHide(eng)}
        />
      ))}

      {editingCategory !== null && (
        <CategoryEditModal
          initial={editingCategory}
          products={products}
          cloneSourceOptions={cloneSourceOptions}
          onSave={saveCategory}
          onCancel={() => setEditingCategory(null)}
        />
      )}

      {editingEngagement !== null && (
        <EngagementEditModal
          initial={editingEngagement}
          onSave={saveEngagement}
          onCancel={() => setEditingEngagement(null)}
        />
      )}

      {confirmCategoryHide && (
        <ConfirmModal
          message={`商材「${confirmCategoryHide.name}」を非表示にしますか？\n（is_active=false で各セレクタから除外されます。配下の業務種別は残ります）`}
          confirmLabel="非表示にする"
          onConfirm={() => hideCategory(confirmCategoryHide)}
          onCancel={() => setConfirmCategoryHide(null)}
        />
      )}

      {confirmEngagementHide && (
        <ConfirmModal
          message={`業務種別「${confirmEngagementHide.name}」を非表示にしますか？\n（status=archived で各セレクタから除外されます。データ自体は残ります）`}
          confirmLabel="非表示にする"
          onConfirm={() => hideEngagement(confirmEngagementHide)}
          onCancel={() => setConfirmEngagementHide(null)}
        />
      )}
    </div>
  );
}

function CategoryCard({
  category, engagements, ranks, roles,
  onEditCategory, onHideCategory,
  onAddEngagement, onEditEngagement, onHideEngagement,
}) {
  return (
    <div style={{
      padding: space[3], background: color.white, border: `1px solid ${color.border}`,
      borderRadius: radius.md, display: 'flex', flexDirection: 'column', gap: space[2],
      opacity: category.is_active ? 1 : 0.55,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy }}>{category.name}</span>
        <code style={{ fontSize: font.size.xs, color: color.textLight, background: color.cream, padding: '1px 6px', borderRadius: radius.sm }}>{category.slug}</code>
        {!category.is_active && <Badge variant="neutral">非表示</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: color.textLight }}>display_order: {category.display_order}</span>
        <Button variant="outline" size="sm" onClick={onEditCategory}>編集</Button>
        {category.is_active && <Button variant="danger" size="sm" onClick={onHideCategory}>非表示</Button>}
      </div>
      {category.description && (
        <div style={{ fontSize: font.size.xs, color: color.textLight }}>{category.description}</div>
      )}

      <div style={{ borderTop: `1px dashed ${color.border}`, paddingTop: space[2], display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <div style={{ fontSize: 10, color: color.textLight }}>
            配下の業務種別 - {engagements.length}件
          </div>
          <Button variant="outline" size="sm" style={{ marginLeft: 'auto' }} onClick={onAddEngagement}>＋ 業務種別追加</Button>
        </div>

        {engagements.length === 0 ? (
          <div style={{ fontSize: font.size.xs, color: color.textLight, fontStyle: 'italic' }}>業務種別がまだありません</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {engagements.map(eng => {
              const rankCount = ranks.filter(r => r.engagement_id === eng.id).length;
              const roleCount = roles.filter(r => r.engagement_id === eng.id).length;
              const isArchived = eng.status !== 'active';
              return (
                <div key={eng.id} style={{
                  display: 'flex', alignItems: 'center', gap: space[2],
                  padding: `${space[1.5]}px ${space[2]}px`,
                  background: isArchived ? color.offWhite : alpha(color.success, 0.04),
                  border: `1px solid ${isArchived ? color.border : alpha(color.success, 0.20)}`,
                  borderRadius: radius.sm,
                  opacity: isArchived ? 0.55 : 1,
                }}>
                  <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{eng.name}</span>
                  <code style={{ fontSize: 10, color: color.textLight, background: color.white, padding: '1px 5px', borderRadius: radius.sm }}>{eng.slug}</code>
                  <span style={{ fontSize: 10, color: color.textLight }}>type: {eng.type}</span>
                  <span style={{ fontSize: 10, color: color.textLight }}>ランク {rankCount} / ポジション {roleCount}</span>
                  {isArchived && <Badge variant="neutral">非表示</Badge>}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <Button variant="outline" size="sm" onClick={() => onEditEngagement(eng)}>編集</Button>
                    {!isArchived && <Button variant="danger" size="sm" onClick={() => onHideEngagement(eng)}>非表示</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryEditModal({ initial, products, cloneSourceOptions, onSave, onCancel }) {
  const isNew = !initial?.id;
  const [form, setForm] = useState({
    name: initial?.name || '',
    slug: initial?.slug || '',
    product_id: initial?.product_id || '',
    display_order: initial?.display_order || 0,
    is_active: initial?.is_active !== false,
    description: initial?.description || '',
    cloneFromCategoryId: '',
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
        background: color.white, borderRadius: radius.md, width: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: shadow.xl,
      }}>
        <div style={{ padding: `${space[3]}px ${space[5]}px`, background: color.navy, color: color.white, borderRadius: `${radius.md}px ${radius.md}px 0 0`, fontWeight: font.weight.semibold }}>
          {isNew ? '商材を作成' : '商材を編集'}
        </div>
        <div style={{ padding: space[5], display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <FieldRow label="事業 *">
            <Select
              size="sm"
              value={form.product_id || ''}
              onChange={e => update({ product_id: e.target.value })}
              options={products.map(p => ({ value: p.id, label: p.name }))}
              disabled={!isNew}
            />
            {!isNew && <span style={{ fontSize: 10, color: color.textLight }}>編集中の商材は事業変更不可</span>}
          </FieldRow>
          <FieldRow label="商材名 *">
            <Input size="sm" value={form.name} onChange={e => update({ name: e.target.value })} placeholder="例: M&A / SaaS / 人材 / IFA" />
          </FieldRow>
          <FieldRow label="slug * (英数字・アンダースコアのみ)">
            <Input size="sm" value={form.slug} onChange={e => update({ slug: e.target.value })} placeholder="例: m_and_a / saas / recruit / ifa" disabled={!isNew} />
            {!isNew && <span style={{ fontSize: 10, color: color.textLight }}>編集中の商材は slug 変更不可（FK整合性のため）</span>}
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

          {isNew && cloneSourceOptions.length > 0 && (
            <div style={{
              borderTop: `1px dashed ${color.border}`, paddingTop: space[3],
              display: 'flex', flexDirection: 'column', gap: space[2],
            }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>
                既存商材から一式複製（任意）
              </div>
              <div style={{ fontSize: 11, color: color.textLight, lineHeight: 1.5 }}>
                複製元の業務種別・ランク・ポジション・アポ取得報告テンプレを新商材配下にコピーします。
                業務種別の slug は重複を避けるため「(複製元slug)_(新商材slug)」になります。
              </div>
              <Select
                size="sm"
                value={form.cloneFromCategoryId}
                onChange={e => update({ cloneFromCategoryId: e.target.value })}
              >
                <option value="">複製しない</option>
                {cloneSourceOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          )}

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

function EngagementEditModal({ initial, onSave, onCancel }) {
  const isNew = !initial?.id;
  const [form, setForm] = useState({
    name: initial?.name || '',
    slug: initial?.slug || '',
    type: initial?.type || '',
    display_order: initial?.display_order || 0,
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
        background: color.white, borderRadius: radius.md, width: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: shadow.xl,
      }}>
        <div style={{ padding: `${space[3]}px ${space[5]}px`, background: color.navy, color: color.white, borderRadius: `${radius.md}px ${radius.md}px 0 0`, fontWeight: font.weight.semibold }}>
          {isNew ? '業務種別を作成' : '業務種別を編集'}
        </div>
        <div style={{ padding: space[5], display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <FieldRow label="業務種別名 *">
            <Input size="sm" value={form.name} onChange={e => update({ name: e.target.value })} placeholder="例: 売り手ソーシング / リード獲得" />
          </FieldRow>
          <FieldRow label="slug * (英数字・アンダースコアのみ)">
            <Input size="sm" value={form.slug} onChange={e => update({ slug: e.target.value })} placeholder="例: lead_acquisition" disabled={!isNew} />
            {!isNew && <span style={{ fontSize: 10, color: color.textLight }}>編集中の業務種別は slug 変更不可（FK整合性のため）</span>}
          </FieldRow>
          <FieldRow label="type * (内部識別子)">
            <Input size="sm" value={form.type} onChange={e => update({ type: e.target.value })} placeholder="例: seller_sourcing / lead_acquisition" />
            <span style={{ fontSize: 10, color: color.textLight }}>画面ロジックの分岐に使われる内部値。通常は slug と同じでOK</span>
          </FieldRow>
          <FieldRow label="説明（任意）">
            <Input size="sm" value={form.description} onChange={e => update({ description: e.target.value })} />
          </FieldRow>
          <FieldRow label="表示順">
            <Input size="sm" type="number" value={String(form.display_order)} onChange={e => update({ display_order: parseInt(e.target.value) || 0 })} />
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

function ConfirmModal({ message, confirmLabel, onConfirm, onCancel }) {
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
          <Button variant="danger" size="sm" onClick={onConfirm}>{confirmLabel || '確定'}</Button>
        </div>
      </div>
    </div>
  );
}
