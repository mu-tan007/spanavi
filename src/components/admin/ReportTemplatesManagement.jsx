import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { useEngagements } from '../../hooks/useEngagements';
import {
  fetchReportTemplates, insertReportTemplate, updateReportTemplate, deleteReportTemplate,
} from '../../lib/supabaseWrite';

const FIELD_TYPES = [
  { value: 'text',     label: 'テキスト（1行）' },
  { value: 'textarea', label: 'テキスト（複数行）' },
  { value: 'number',   label: '数値' },
  { value: 'date',     label: '日付' },
  { value: 'select',   label: '選択肢（プルダウン）' },
  { value: 'boolean',  label: 'はい/いいえ' },
];

const SCOPE_LABELS = {
  engagement: 'タイプ（デフォルト）',
  client: 'クライアント単位（上書き）',
  list: 'リスト単位（上書き）',
};

const AUTO_FILL_OPTIONS = [
  { value: '',                     label: '-（手動入力）' },
  { value: 'company_name',         label: 'アポ対象企業名' },
  { value: 'address',              label: '住所' },
  { value: 'phone',                label: '電話番号' },
  { value: 'mobile_phone',         label: 'キーマン携帯' },
  { value: 'contact_name',         label: '担当者名（call_list_items.representative）' },
  { value: 'email',                label: 'メールアドレス（クライアント担当者）' },
  { value: 'industry',             label: '業種（list.industry）' },
  { value: 'business',             label: '事業内容（call_list_items.business）' },
  { value: 'representative',       label: '代表者' },
  { value: 'url',                  label: 'URL' },
  { value: 'sales_thousand',       label: '売上（千円）' },
  { value: 'net_income_thousand',  label: '当期純利益（千円）' },
  { value: 'current_user',         label: 'ログインユーザー名' },
];
const AUTO_FETCH_OPTIONS = [
  { value: '',              label: '-（手動入力）' },
  { value: 'homepage_url',  label: 'AI+Web検索でHP自動取得' },
];

export default function ReportTemplatesManagement({ onToast }) {
  const orgId = getOrgId();
  const { engagements, categories } = useEngagements();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState(null); // null or template object (new: {})
  const [confirmDelete, setConfirmDelete] = useState(null);

  // 営業代行系3engagement（テンプレ対象）
  const salesAgencyEngagements = useMemo(() => {
    const order = ['seller_sourcing', 'matching', 'client_acquisition'];
    return (engagements || [])
      .filter(e => order.includes(e.slug))
      .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  }, [engagements]);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchReportTemplates();
    if (error) onToast?.('読み込みに失敗しました: ' + error.message, 'error');
    setTemplates(data || []);
    setLoading(false);
  }, [onToast]);

  useEffect(() => { reload(); }, [reload]);

  // クライアント・リスト一覧をモーダル用に読み込む
  useEffect(() => {
    (async () => {
      const [cRes, lRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('org_id', orgId).order('name'),
        supabase.from('call_lists').select('id, name, client_id, engagement_id').eq('org_id', orgId).eq('is_archived', false).order('name'),
      ]);
      setClients(cRes.data || []);
      setLists(lRes.data || []);
    })();
  }, [orgId]);

  const groupedTemplates = useMemo(() => {
    const eng = templates.filter(t => t.scope_level === 'engagement');
    const cli = templates.filter(t => t.scope_level === 'client');
    const lst = templates.filter(t => t.scope_level === 'list');
    return { engagement: eng, client: cli, list: lst };
  }, [templates]);

  const engagementName = (id) => engagements.find(e => e.id === id)?.name || '—';
  const clientName = (id) => clients.find(c => c.id === id)?.name || '—';
  const listName = (id) => lists.find(l => l.id === id)?.name || '—';

  const handleSave = async (payload) => {
    if (!payload.name) return { error: new Error('名前が必須です') };
    if (!payload.scope_level) return { error: new Error('スコープが必須です') };
    if (payload.scope_level === 'engagement' && !payload.engagement_id) return { error: new Error('対象タイプを選んでください') };
    if (payload.scope_level === 'client' && (!payload.engagement_id || !payload.client_id)) return { error: new Error('タイプとクライアントを選んでください') };
    if (payload.scope_level === 'list' && !payload.list_id) return { error: new Error('対象リストを選んでください') };

    // フィールドの key 重複チェック
    const keys = (payload.schema || []).map(f => f.key).filter(Boolean);
    if (new Set(keys).size !== keys.length) return { error: new Error('フィールドキーが重複しています') };

    const isNew = !editing?.id;
    const { error } = isNew
      ? await insertReportTemplate(payload)
      : await updateReportTemplate(editing.id, payload);
    if (error) { onToast?.('保存に失敗しました: ' + error.message, 'error'); return { error }; }
    onToast?.(`テンプレを${isNew ? '作成' : '更新'}しました`);
    setEditing(null);
    await reload();
    return { error: null };
  };

  const handleDelete = async (id) => {
    const { error } = await deleteReportTemplate(id);
    if (error) onToast?.('削除に失敗しました: ' + error.message, 'error');
    else onToast?.('テンプレを削除しました');
    setConfirmDelete(null);
    await reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Card padding="md">
        <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.6 }}>
          アポ取得報告のフォーマットをタイプ・クライアント・リスト単位で管理します。
          継承順は <b>リスト</b> → <b>クライアント×タイプ</b> → <b>タイプ デフォルト</b>。
          AI添削（録音→項目自動抽出）の挙動も各テンプレの「AIプロンプト」で制御できます。
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>再読込</Button>
        <Button variant="primary" size="sm" onClick={() => setEditing({})}>＋ 新規テンプレ</Button>
      </div>

      {/* タイプ単位 */}
      <Section title="タイプ単位（デフォルト）" hint="タイプごとに用途別の複数テンプレを持てます（例：アポ取得報告 + ヒアリング報告）">
        {salesAgencyEngagements.map(e => {
          const ts = groupedTemplates.engagement.filter(x => x.engagement_id === e.id);
          const cat = categories.find(c => c.id === e.category_id)?.name || '—';
          return (
            <EngagementBlock
              key={e.id}
              engagement={e}
              category={cat}
              templates={ts}
              onCreate={() => setEditing({ scope_level: 'engagement', engagement_id: e.id })}
              onEdit={(t) => setEditing(t)}
              onDelete={(t) => setConfirmDelete(t)}
            />
          );
        })}
      </Section>

      {/* クライアント単位 */}
      <Section title="クライアント単位（上書き）" hint="特定クライアント×タイプの組み合わせで上書き">
        {groupedTemplates.client.length === 0 ? (
          <Empty>クライアント単位テンプレはまだありません</Empty>
        ) : (
          groupedTemplates.client.map(t => (
            <Row
              key={t.id}
              label={`${clientName(t.client_id)} × ${engagementName(t.engagement_id)}`}
              template={t}
              onEdit={() => setEditing(t)}
              onDelete={() => setConfirmDelete(t)}
            />
          ))
        )}
      </Section>

      {/* リスト単位 */}
      <Section title="リスト単位（上書き）" hint="特定の架電リストだけ別フォーマットにする場合">
        {groupedTemplates.list.length === 0 ? (
          <Empty>リスト単位テンプレはまだありません</Empty>
        ) : (
          groupedTemplates.list.map(t => (
            <Row
              key={t.id}
              label={listName(t.list_id)}
              template={t}
              onEdit={() => setEditing(t)}
              onDelete={() => setConfirmDelete(t)}
            />
          ))
        )}
      </Section>

      {editing !== null && (
        <TemplateEditModal
          initial={editing}
          engagements={salesAgencyEngagements}
          clients={clients}
          lists={lists}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={`テンプレ「${confirmDelete.name}」を削除しますか？\n（このテンプレを使っていたリストはデフォルトテンプレに戻ります）`}
          onConfirm={() => handleDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
        <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy }}>{title}</h3>
        {hint && <span style={{ fontSize: font.size.xs, color: color.textLight }}>{hint}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
        {children}
      </div>
    </div>
  );
}

function EngagementBlock({ engagement, category, templates, onCreate, onEdit, onDelete }) {
  return (
    <div style={{
      background: color.cream, border: `1px solid ${color.border}`,
      borderRadius: radius.md, padding: space[3],
      display: 'flex', flexDirection: 'column', gap: space[2],
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{engagement.name}</span>
        {category && <span style={{ fontSize: font.size.xs, color: color.textLight }}>{category}</span>}
        <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[1] }}>
          {templates.length}件のテンプレ
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <Button variant="outline" size="sm" onClick={onCreate}>＋ テンプレ追加</Button>
        </div>
      </div>
      {templates.length === 0 ? (
        <div style={{
          padding: `${space[2]}px ${space[4]}px`, fontSize: font.size.xs, color: color.textLight,
          background: color.white, borderRadius: radius.sm, border: `1px dashed ${color.border}`,
        }}>このタイプにはまだテンプレがありません</div>
      ) : (
        templates.map(t => (
          <TemplateRowItem key={t.id} template={t} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
        ))
      )}
    </div>
  );
}

function TemplateRowItem({ template, onEdit, onDelete }) {
  const fieldCount = Array.isArray(template.schema) ? template.schema.length : 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[2],
      padding: `${space[2]}px ${space[3]}px`, background: color.white,
      border: `1px solid ${color.border}`, borderRadius: radius.sm,
    }}>
      <Badge variant="success" dot>{template.name}</Badge>
      {template.description && (
        <span style={{ fontSize: font.size.xs, color: color.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.description}</span>
      )}
      <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: 'auto' }}>
        フィールド {fieldCount}件
      </span>
      <Button variant="outline" size="sm" onClick={onEdit}>編集</Button>
      <Button variant="danger" size="sm" onClick={onDelete}>削除</Button>
    </div>
  );
}

function Row({ label, category, template, onCreate, onEdit, onDelete }) {
  const hasTemplate = !!template;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[3],
      padding: `${space[2.5]}px ${space[4]}px`, background: color.white,
      border: `1px solid ${color.border}`, borderRadius: radius.md,
    }}>
      <div style={{ minWidth: 220, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>
        {label}
        {category && <span style={{ marginLeft: space[2], fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.normal }}>{category}</span>}
      </div>
      <div style={{ flex: 1 }}>
        {hasTemplate ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <Badge variant="success" dot>{template.name}</Badge>
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              フィールド {Array.isArray(template.schema) ? template.schema.length : 0}件
            </span>
          </div>
        ) : (
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>テンプレ未設定</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: space[1.5] }}>
        {hasTemplate ? (
          <>
            <Button variant="outline" size="sm" onClick={onEdit}>編集</Button>
            <Button variant="danger" size="sm" onClick={onDelete}>削除</Button>
          </>
        ) : (
          onCreate && <Button variant="primary" size="sm" onClick={onCreate}>＋ 作成</Button>
        )}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      padding: `${space[3]}px ${space[4]}px`, fontSize: font.size.sm, color: color.textLight,
      background: color.offWhite, borderRadius: radius.md, textAlign: 'center',
    }}>{children}</div>
  );
}

// ====================================================================
// テンプレ編集モーダル
// ====================================================================
function TemplateEditModal({ initial, engagements, clients, lists, onSave, onCancel }) {
  const isNew = !initial?.id;
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    description: initial?.description || '',
    scope_level: initial?.scope_level || 'engagement',
    engagement_id: initial?.engagement_id || '',
    client_id: initial?.client_id || '',
    list_id: initial?.list_id || '',
    schema: Array.isArray(initial?.schema) ? initial.schema : [],
    body_template: initial?.body_template || '',
    ai_prompt: initial?.ai_prompt || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const update = (patch) => setForm(p => ({ ...p, ...patch }));

  const addField = () => {
    update({ schema: [...form.schema, { key: '', label: '', type: 'text', required: false, placeholder: '' }] });
  };
  const updateField = (i, patch) => {
    const next = [...form.schema];
    next[i] = { ...next[i], ...patch };
    update({ schema: next });
  };
  const removeField = (i) => {
    update({ schema: form.schema.filter((_, idx) => idx !== i) });
  };
  const moveField = (i, dir) => {
    const next = [...form.schema];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    update({ schema: next });
  };

  const availableKeys = form.schema.filter(f => f.key).map(f => f.key);
  const [expandedIdx, setExpandedIdx] = useState(new Set()); // 詳細オプションを開いているフィールドのindex
  const toggleExpand = (i) => setExpandedIdx(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const onSaveClick = async () => {
    setSaving(true);
    setError(null);
    const { error } = await onSave(form);
    if (error) setError(error.message);
    setSaving(false);
  };

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: alpha('#000', 0.5),
      zIndex: 20000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: `${space[6]}px ${space[4]}px`,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, borderRadius: radius.md, width: '100%', maxWidth: 760,
        boxShadow: shadow.xl, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: `${space[3]}px ${space[5]}px`, background: color.navy,
          color: color.white, borderRadius: `${radius.md}px ${radius.md}px 0 0`,
          fontWeight: font.weight.semibold, fontSize: font.size.md,
        }}>
          {isNew ? 'アポ取得報告テンプレを作成' : 'アポ取得報告テンプレを編集'}
        </div>

        <div style={{ padding: space[5], display: 'flex', flexDirection: 'column', gap: space[4] }}>
          {/* 基本情報 */}
          <Field label="テンプレ名 *">
            <Input size="sm" value={form.name} onChange={e => update({ name: e.target.value })} placeholder="例: M&A 売り手 標準 / ブティックス向け" />
          </Field>
          <Field label="説明（任意）">
            <Input size="sm" value={form.description} onChange={e => update({ description: e.target.value })} placeholder="このテンプレの用途・特徴を簡潔に" />
          </Field>

          {/* スコープ */}
          <Field label="スコープ *">
            <div style={{ display: 'flex', gap: space[2] }}>
              {['engagement', 'client', 'list'].map(s => {
                const active = form.scope_level === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update({ scope_level: s, client_id: '', list_id: '' })}
                    style={{
                      padding: `6px ${space[3] + 2}px`, fontSize: font.size.sm,
                      background: active ? color.navy : color.white,
                      color: active ? color.white : color.textMid,
                      border: `1px solid ${active ? color.navy : color.border}`,
                      borderRadius: radius.md, cursor: 'pointer',
                      fontWeight: active ? font.weight.semibold : font.weight.normal,
                    }}
                  >{SCOPE_LABELS[s]}</button>
                );
              })}
            </div>
          </Field>

          {/* スコープに応じた対象選択 */}
          {(form.scope_level === 'engagement' || form.scope_level === 'client') && (
            <Field label="タイプ *">
              <Select
                size="sm"
                value={form.engagement_id}
                onChange={e => update({ engagement_id: e.target.value })}
                options={[{ value: '', label: '選択してください' }, ...engagements.map(e => ({ value: e.id, label: e.name }))]}
              />
            </Field>
          )}
          {form.scope_level === 'client' && (
            <Field label="クライアント *">
              <Select
                size="sm"
                value={form.client_id}
                onChange={e => update({ client_id: e.target.value })}
                options={[{ value: '', label: '選択してください' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
              />
            </Field>
          )}
          {form.scope_level === 'list' && (
            <Field label="リスト *">
              <Select
                size="sm"
                value={form.list_id}
                onChange={e => update({ list_id: e.target.value })}
                options={[{ value: '', label: '選択してください' }, ...lists.map(l => ({ value: l.id, label: l.name }))]}
              />
            </Field>
          )}

          {/* スキーマエディタ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
              <label style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>項目（フィールド）</label>
              <span style={{ fontSize: font.size.xs, color: color.textLight }}>このテンプレで聞きたい項目を定義</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              {form.schema.map((f, i) => {
                const expanded = expandedIdx.has(i);
                const hasMarker = f.ai_extract || f.auto_fill || f.auto_fetch || f.default || f.visible_when;
                return (
                <div key={i} style={{
                  padding: `${space[2.5]}px ${space[3]}px`, background: color.offWhite,
                  border: `1px solid ${color.border}`, borderRadius: radius.md,
                  display: 'grid', gap: space[2],
                  gridTemplateColumns: '1fr 1.5fr 1.2fr auto auto',
                }}>
                  <Input size="sm" value={f.key} onChange={e => updateField(i, { key: e.target.value })} placeholder="key (例: decision_maker)" />
                  <Input size="sm" value={f.label} onChange={e => updateField(i, { label: e.target.value })} placeholder="表示名 (例: 決裁者)" />
                  <Select size="sm" value={f.type} onChange={e => updateField(i, { type: e.target.value })} options={FIELD_TYPES} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, color: color.textMid }}>
                    <input type="checkbox" checked={!!f.required} onChange={e => updateField(i, { required: e.target.checked })} />
                    必須
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => moveField(i, -1)} title="上へ" style={iconBtn}>↑</button>
                    <button onClick={() => moveField(i, +1)} title="下へ" style={iconBtn}>↓</button>
                    <button onClick={() => removeField(i)} title="削除" style={{ ...iconBtn, color: color.danger }}>×</button>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
                    <Input size="sm" value={f.placeholder || ''} onChange={e => updateField(i, { placeholder: e.target.value })} placeholder="プレースホルダ（任意）" />
                    {f.type === 'select' && (
                      <Input size="sm" value={(f.options || []).join('\n')} onChange={e => updateField(i, { options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} placeholder="選択肢を改行区切り" />
                    )}
                  </div>
                  {/* 詳細オプション トグル */}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: space[2] }}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(i)}
                      style={{
                        background: 'none', border: 'none', color: color.navy,
                        fontSize: font.size.xs, cursor: 'pointer', textDecoration: 'underline', padding: 0,
                        fontFamily: font.family.sans,
                      }}
                    >{expanded ? '▲ 詳細を閉じる' : '▼ 詳細オプション'}</button>
                    {hasMarker && !expanded && (
                      <span style={{ fontSize: 10, color: color.textLight }}>
                        {[
                          f.ai_extract && 'AI抽出',
                          f.auto_fill && `自動入力:${f.auto_fill}`,
                          f.auto_fetch && `自動取得:${f.auto_fetch}`,
                          f.default && `デフォルト:${f.default}`,
                          f.visible_when && `条件付き:${f.visible_when.field}=${f.visible_when.equals}`,
                        ].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </div>
                  {expanded && (
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2], padding: space[2], background: color.cream, borderRadius: radius.sm }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: font.size.xs, color: color.textMid }}>
                        <input type="checkbox" checked={!!f.ai_extract} onChange={e => updateField(i, { ai_extract: e.target.checked || undefined })} />
                        AI抽出対象（録音から自動抽出）
                      </label>
                      <div>
                        <span style={{ fontSize: 10, color: color.textLight, display: 'block', marginBottom: 2 }}>デフォルト値</span>
                        <Input size="sm" value={f.default || ''} onChange={e => updateField(i, { default: e.target.value || undefined })} placeholder="例: 代表取締役" />
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: color.textLight, display: 'block', marginBottom: 2 }}>自動入力ソース</span>
                        <Select size="sm" value={f.auto_fill || ''} onChange={e => updateField(i, { auto_fill: e.target.value || undefined })} options={AUTO_FILL_OPTIONS} />
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: color.textLight, display: 'block', marginBottom: 2 }}>外部取得（ボタン表示）</span>
                        <Select size="sm" value={f.auto_fetch || ''} onChange={e => updateField(i, { auto_fetch: e.target.value || undefined })} options={AUTO_FETCH_OPTIONS} />
                      </div>
                      <div style={{ gridColumn: '1 / -1', borderTop: `1px dashed ${color.border}`, paddingTop: space[1.5] }}>
                        <span style={{ fontSize: 10, color: color.textLight, display: 'block', marginBottom: 2 }}>
                          条件付き表示（別フィールドの値が特定値のときだけ表示）
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 6, alignItems: 'center' }}>
                          <Select
                            size="sm"
                            value={f.visible_when?.field || ''}
                            onChange={e => updateField(i, { visible_when: e.target.value ? { ...(f.visible_when || {}), field: e.target.value } : undefined })}
                            options={[{ value: '', label: '-（常時表示）' }, ...availableKeys.filter(k => k !== f.key).map(k => ({ value: k, label: k }))]}
                          />
                          <span style={{ fontSize: font.size.xs, color: color.textMid }}>が</span>
                          <Input
                            size="sm"
                            value={f.visible_when?.equals || ''}
                            onChange={e => updateField(i, { visible_when: f.visible_when?.field ? { ...(f.visible_when || {}), equals: e.target.value } : undefined })}
                            placeholder="例: 対面"
                            disabled={!f.visible_when?.field}
                          />
                          <span style={{ fontSize: font.size.xs, color: color.textMid }}>のとき</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={addField}>＋ 項目を追加</Button>
            </div>
          </div>

          {/* 本文テンプレ */}
          <Field label="本文テンプレ" hint="保存時に各フィールドが {{key}} の位置に差し込まれます">
            <textarea
              value={form.body_template}
              onChange={e => update({ body_template: e.target.value })}
              style={textareaStyle}
              placeholder={`例:\n【M&A クライアント開拓 アポ取得報告】\n企業名：{{company_name}}\n担当者：{{decision_maker}}様\n面談日時：{{meeting_at}}\nヒアリング：{{hearing}}`}
              rows={8}
            />
            {availableKeys.length > 0 && (
              <div style={{ marginTop: space[1], fontSize: font.size.xs, color: color.textLight, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                利用可能キー:&nbsp;
                {availableKeys.map(k => (
                  <code key={k} style={{ background: color.cream, padding: '1px 5px', borderRadius: radius.sm }}>{`{{${k}}}`}</code>
                ))}
              </div>
            )}
          </Field>

          {/* AIプロンプト */}
          <Field label="AIプロンプト（録音からの自動抽出指示）" hint="このテンプレに沿った内容を録音から抽出するためのClaudeへの追加指示">
            <textarea
              value={form.ai_prompt}
              onChange={e => update({ ai_prompt: e.target.value })}
              style={textareaStyle}
              placeholder={`例:\n通話録音から以下を抽出してください:\n- 決裁者名と役職\n- M&A仲介依頼の見込み度合い（高/中/低/不明）\n- 競合状況\n- ネクストアクション合意内容`}
              rows={6}
            />
          </Field>

          {error && (
            <div style={{ fontSize: font.size.xs, color: color.danger, background: alpha(color.danger, 0.06), border: `1px solid ${alpha(color.danger, 0.3)}`, padding: '8px 10px', borderRadius: radius.sm }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: `${space[3]}px ${space[5]}px`, borderTop: `1px solid ${color.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: space[2], background: color.white,
          borderRadius: `0 0 ${radius.md}px ${radius.md}px`,
        }}>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>キャンセル</Button>
          <Button variant="primary" size="sm" onClick={onSaveClick} loading={saving} disabled={saving}>
            {saving ? '保存中…' : isNew ? '作成' : '更新'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2] }}>
        <label style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>{label}</label>
        {hint && <span style={{ fontSize: font.size.xs, color: color.textLight }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: alpha('#000', 0.5),
      zIndex: 30000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, borderRadius: radius.md, padding: space[5],
        boxShadow: shadow.xl, maxWidth: 480,
      }}>
        <div style={{ fontSize: font.size.base, color: color.textDark, whiteSpace: 'pre-wrap', marginBottom: space[4] }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <Button variant="secondary" size="sm" onClick={onCancel}>キャンセル</Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>削除する</Button>
        </div>
      </div>
    </div>
  );
}

// ----- styles -----
const iconBtn = {
  width: 26, height: 26, borderRadius: radius.sm,
  border: `1px solid ${color.border}`, background: color.white,
  color: color.textMid, cursor: 'pointer', fontSize: font.size.sm,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const textareaStyle = {
  width: '100%', padding: '8px 12px', borderRadius: radius.md,
  border: `1px solid ${color.border}`, fontSize: font.size.sm,
  fontFamily: font.family.sans, outline: 'none', background: color.white,
  color: color.textDark, resize: 'vertical', boxSizing: 'border-box',
};
