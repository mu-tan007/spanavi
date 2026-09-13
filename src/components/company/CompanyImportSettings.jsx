import { useState } from 'react';
import { Button, Input, Select, Card, Badge, DataTable } from '../ui';
import { color, space, font } from '../../constants/design';
import { IMPORT_PROVIDERS } from '../../utils/companyImportFields';
import { saveCompanyImportField, saveCompanyImportTemplate } from '../../lib/companyImportApi';

const blank = { label: '', type: 'text', aliases: [], active: true, version: 0 };
export default function CompanyImportSettings({ config, onChanged }) {
  const [form, setForm] = useState(blank), [aliases, setAliases] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const run = async action => { setBusy(true); setError(''); setSaved(false); try { await action(); await onChanged(); setSaved(true); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const save = () => run(async () => {
    await saveCompanyImportField({ ...form, key: form.key || `custom_${crypto.randomUUID().replaceAll('-', '')}`, aliases: aliases.split(/[,、\n]/).map(v => v.trim()).filter(Boolean) });
    setForm(blank); setAliases('');
  });
  return <>
    <p style={{ color: color.textMid, fontSize: font.size.sm }}>企業DBと架電リストで同じ項目を使います。追加項目は企業カルテで共有されます。</p>
    {error && <p role="alert" style={{ color: color.danger }}>{error}</p>}
    {saved && <p role="status" style={{ color: color.success }}>設定を保存しました。</p>}
    <Card title="項目" style={{ marginBottom: space[4] }}>
      <DataTable ariaLabel="企業の取込項目" rows={config.fields} rowKey="key" height={300} columns={[
        { key: 'label', label: '項目名', width: 210, align: 'left' },
        { key: 'type', label: '種類', width: 100, align: 'center', render: r => r.money ? '金額（千円）' : ({ text: 'テキスト', number: '数値', date: '日付' }[r.type]) },
        { key: 'aliases', label: '列名の候補', width: 320, align: 'left', render: r => (r.aliases || []).join('、') },
        { key: 'active', label: '状態', width: 100, align: 'center', render: r => <Badge variant={r.active ? 'success' : 'neutral'}>{r.active ? '使用中' : '停止中'}</Badge> },
        { key: 'actions', label: '', width: 90, align: 'center', render: r => r.key.startsWith('custom_') && config.can_manage
          ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setForm(r); setAliases((r.aliases || []).join('、')); setSaved(false); }}>編集</Button> : '標準' },
      ]} />
      {config.can_manage && <div style={{ marginTop: space[4] }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: space[3] }}>
          <Input label="追加項目名" aria-label="追加項目名" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} disabled={busy} maxLength={80} />
          <Select label="種類" aria-label="追加項目の種類" value={form.type} disabled={busy || !!form.key} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            options={[{ value: 'text', label: 'テキスト' }, { value: 'number', label: '数値' }, { value: 'date', label: '日付' }]} />
          <Input label="列名の候補（カンマ区切り）" aria-label="追加項目の列名候補" value={aliases} disabled={busy} onChange={e => setAliases(e.target.value)} />
          <Select label="状態" aria-label="追加項目の状態" value={String(form.active)} disabled={busy} onChange={e => setForm(p => ({ ...p, active: e.target.value === 'true' }))}
            options={[{ value: 'true', label: '使用中' }, { value: 'false', label: '停止中（保存済みの値は保持）' }]} />
        </div>
        <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
          <Button loading={busy} disabled={!form.label.trim()} onClick={save}>{form.key ? '項目を更新' : '項目を追加'}</Button>
          {form.key && <Button variant="outline" disabled={busy} onClick={() => { setForm(blank); setAliases(''); }}>編集を解除</Button>}
        </div>
      </div>}
    </Card>
    <Card title="保存した取込設定">
      <DataTable ariaLabel="保存した取込設定" rows={config.templates} rowKey="id" height={230} emptyMessage="取込画面から列の対応を保存できます" columns={[
        { key: 'name', label: '設定名', width: 240, align: 'left' },
        { key: 'provider', label: '出所', width: 220, align: 'left', render: r => IMPORT_PROVIDERS.find(p => p.value === r.provider)?.label },
        { key: 'version', label: '版', width: 70, align: 'right' },
        { key: 'active', label: '状態', width: 90, align: 'center', render: r => r.active ? '使用中' : '停止中' },
        { key: 'actions', label: '', width: 100, align: 'center', render: r => config.can_manage && <Button size="sm" variant="outline" disabled={busy}
          onClick={() => run(() => saveCompanyImportTemplate({ ...r, active: !r.active }))}>{r.active ? '使用を停止' : '使用を再開'}</Button> },
      ]} />
    </Card>
  </>;
}
