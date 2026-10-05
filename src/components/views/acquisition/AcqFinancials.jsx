import React, { useCallback, useEffect, useState } from 'react';
import { space, font } from '../../../constants/design';
import { Badge, Button, DataTable, Input, Select } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { yen, parseYen } from './acqConstants';
import { AcqModal, ModalButtons, FormGrid, ErrorNote, TextArea, ConfirmDialog } from './AcqShared';

// 期ごとの財務。IMの値（im）と弊社の修正値（ours）を分けて持つ。
// 一覧の売上・修正EBITDA・ネットキャッシュは、最新期の弊社修正値→IMの値の順で使う。
export default function AcqFinancials({ dealId, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data, error: e } = await supabase.from('acq_deal_financials').select('*').eq('deal_id', dealId)
      .order('period_end', { ascending: false, nullsFirst: false }).order('source');
    if (e) setError(e); else setRows(data || []);
    setLoading(false);
  }, [dealId]);
  useEffect(() => { reload(); }, [reload]);

  const remove = async () => {
    setBusy(true);
    const { error: e } = await supabase.from('acq_deal_financials').delete().eq('id', deleting.id);
    setBusy(false); setDeleting(null);
    if (e) { setError(e); return; }
    await reload(); onChanged?.();
  };

  const money = (key) => ({ key, align: 'right', width: 110, cellStyle: { fontFamily: font.family.mono }, render: (r) => yen(r[key]) });
  const columns = [
    { key: 'period_label', label: '期', width: 120, align: 'left' },
    { key: 'source', label: '出どころ', width: 100, align: 'center',
      render: (r) => <Badge variant={r.source === 'ours' ? 'primary' : 'default'}>{r.source === 'ours' ? '弊社修正' : 'IM'}</Badge> },
    { ...money('revenue'), label: '売上' },
    { ...money('operating_income'), label: '営業利益' },
    { ...money('ebitda'), label: '修正EBITDA' },
    { ...money('net_cash'), label: 'ネットキャッシュ' },
    { ...money('net_assets'), label: '純資産' },
    { key: 'note', label: 'メモ', width: 200, align: 'left' },
    { key: 'actions', label: '', width: 140, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: space[1] }}>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEditing(r); }}>編集</Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleting(r); }}>削除</Button>
        </span>
      ) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: space[2] }}>
        <Button variant="primary" size="sm" onClick={() => setEditing({})}>期を追加</Button>
      </div>
      <ErrorNote error={error} />
      <DataTable columns={columns} rows={rows} rowKey="id" loading={loading} emptyMessage="財務の数字はまだありません" height="auto" showCount={false} />
      {editing && (
        <FinancialModal
          dealId={dealId}
          row={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); onChanged?.(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`「${deleting.period_label}（${deleting.source === 'ours' ? '弊社修正' : 'IM'}）」を削除`}
          sub="この期の数字を消します"
          okLabel="削除する"
          danger
          busy={busy}
          onOk={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

const toInput = (v) => (v == null ? '' : (Number(v) % 1e4 === 0 ? `${Number(v) / 1e4}万` : String(v)));

function FinancialModal({ dealId, row, onClose, onSaved }) {
  const [f, setF] = useState({
    period_label: row?.period_label || '',
    period_end: row?.period_end || '',
    source: row?.source || 'im',
    revenue: toInput(row?.revenue),
    operating_income: toInput(row?.operating_income),
    ebitda: toInput(row?.ebitda),
    net_cash: toInput(row?.net_cash),
    net_assets: toInput(row?.net_assets),
    note: row?.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e?.target ? e.target.value : e }));

  const save = async () => {
    setError(null);
    if (!f.period_label.trim()) { setError('期の名前を入れてください（例：2026/1期）'); return; }
    const nums = {};
    for (const k of ['revenue', 'operating_income', 'ebitda', 'net_cash', 'net_assets']) {
      const v = parseYen(f[k]);
      if (Number.isNaN(v)) { setError('金額は「1.2億」「3000万」「120000000」の形で入れてください'); return; }
      nums[k] = v;
    }
    const payload = {
      deal_id: dealId, period_label: f.period_label.trim(), period_end: f.period_end || null, source: f.source,
      ...nums, note: f.note.trim() || null, updated_at: new Date().toISOString(),
    };
    setSaving(true);
    try {
      const q = row
        ? supabase.from('acq_deal_financials').update(payload).eq('id', row.id)
        : supabase.from('acq_deal_financials').insert(payload);
      const { error: e } = await q;
      if (e) throw e;
      await onSaved();
    } catch (e) {
      setError(e?.code === '23505' ? '同じ期・同じ出どころの数字がすでにあります' : e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AcqModal title={row ? '財務を編集' : '期を追加'} onClose={onClose} footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} />}>
      <ErrorNote error={error} />
      <FormGrid>
        <Input label="期の名前" value={f.period_label} onChange={set('period_label')} placeholder="例：2026/1期・進行期" />
        <Input label="期末日" type="date" value={f.period_end} onChange={set('period_end')} />
        <Select label="出どころ" value={f.source} onChange={set('source')} options={[{ value: 'im', label: 'IMの値' }, { value: 'ours', label: '弊社の修正値' }]} />
        <div />
        <Input label="売上" value={f.revenue} onChange={set('revenue')} placeholder="例：1億" />
        <Input label="営業利益" value={f.operating_income} onChange={set('operating_income')} />
        <Input label="修正EBITDA" value={f.ebitda} onChange={set('ebitda')} />
        <Input label="ネットキャッシュ" value={f.net_cash} onChange={set('net_cash')} />
        <Input label="純資産" value={f.net_assets} onChange={set('net_assets')} />
        <TextArea label="メモ" value={f.note} onChange={set('note')} rows={2} />
      </FormGrid>
    </AcqModal>
  );
}
