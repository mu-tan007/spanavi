import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { color, space, font } from '../../../constants/design';
import { Badge, Button, DataTable, Input, Select } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { DOC_TYPES, DOC_DIRECTIONS, docTypeLabel, docDirectionLabel, fmtDate, todayStr } from './acqConstants';
import { AcqModal, ModalButtons, FormGrid, ErrorNote, ConfirmDialog } from './AcqShared';
import { buildDocKey, openDocument } from './useAcqData';

const sizeLabel = (b) => (b == null ? '—' : b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

// 案件の書類（ノンネーム・IM・QA など）。同じ種類・同じ系列の書類は版として並べる。
export default function AcqDocuments({ dealId, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data, error: e } = await supabase.from('acq_documents').select('*').eq('deal_id', dealId)
      .order('doc_type').order('series').order('version_no', { ascending: false });
    if (e) setError(e); else setRows(data || []);
    setLoading(false);
  }, [dealId]);
  useEffect(() => { reload(); }, [reload]);

  const ordered = useMemo(() => {
    const order = DOC_TYPES.map(d => d.value);
    return [...rows].sort((a, b) => order.indexOf(a.doc_type) - order.indexOf(b.doc_type)
      || a.series.localeCompare(b.series) || b.version_no - a.version_no);
  }, [rows]);

  const open = async (r) => {
    try { await openDocument(r.storage_path); } catch (e) { setError(e); }
  };

  const remove = async (r) => {
    setBusy(true);
    try {
      const { error: e1 } = await supabase.storage.from('acq-docs').remove([r.storage_path]);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('acq_documents').delete().eq('id', r.id);
      if (e2) throw e2;
      setDeleting(null);
      await reload(); onChanged?.();
    } catch (e) {
      setError(e); setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'doc_type', label: '種類', width: 130, align: 'center', render: (r) => <Badge variant={r.doc_type === 'im' ? 'primary' : 'default'}>{docTypeLabel(r.doc_type)}</Badge> },
    { key: 'original_name', label: 'ファイル', width: 360, align: 'left',
      render: (r) => (
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ color: color.navy, fontWeight: font.weight.medium }}>{r.original_name}</div>
          {r.note && <div style={{ fontSize: font.size.xs, color: color.textLight }}>{r.note}</div>}
        </div>
      ) },
    { key: 'series', label: '系列・版', width: 120, align: 'center', render: (r) => `${r.series === 'main' ? '' : r.series + ' '}第${r.version_no}版` },
    { key: 'direction', label: '向き', width: 110, align: 'center', render: (r) => docDirectionLabel(r.direction) },
    { key: 'received_on', label: '日付', width: 100, align: 'right', cellStyle: { fontFamily: font.family.mono }, render: (r) => fmtDate(r.received_on) },
    { key: 'size_bytes', label: '大きさ', width: 80, align: 'right', cellStyle: { fontFamily: font.family.mono }, render: (r) => sizeLabel(r.size_bytes) },
    { key: 'actions', label: '', width: 150, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: space[1] }}>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); open(r); }}>開く</Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleting(r); }}>削除</Button>
        </span>
      ) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: space[2] }}>
        <Button variant="primary" size="sm" onClick={() => setUploading(true)}>書類を追加</Button>
      </div>
      <ErrorNote error={error} />
      <DataTable columns={columns} rows={ordered} rowKey="id" loading={loading} emptyMessage="書類はまだありません" height="auto" showCount={false} />
      {deleting && (
        <ConfirmDialog
          title={`書類「${deleting.original_name}」を削除`}
          sub="ファイルも消え、元に戻せません"
          okLabel="削除する"
          danger
          busy={busy}
          onOk={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {uploading && (
        <UploadModal
          dealId={dealId}
          existing={rows}
          onClose={() => setUploading(false)}
          onSaved={async () => { setUploading(false); await reload(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

function guessType(name) {
  const n = name.toLowerCase();
  if (/ノンネーム|nn|teaser|ティーザー|匿名/.test(n)) return 'nonname';
  if (/qa|質問|q&a/.test(n)) return 'qa';
  if (/im|概要書|information/.test(n)) return 'im';
  if (/決算|試算|申告|bs|pl/.test(n)) return 'financials';
  if (/loi|意向表明/.test(n)) return 'loi';
  if (/面談/.test(n)) return 'top_meeting';
  if (/nda|秘密保持|契約/.test(n)) return 'contract';
  if (/算定|評価/.test(n)) return 'valuation';
  return 'other';
}

function UploadModal({ dealId, existing, onClose, onSaved }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [docType, setDocType] = useState('other');
  const [series, setSeries] = useState('main');
  const [direction, setDirection] = useState('received');
  const [receivedOn, setReceivedOn] = useState(todayStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const pick = (list) => {
    const arr = Array.from(list || []);
    setFiles(arr);
    if (arr[0]) setDocType(guessType(arr[0].name));
  };

  const save = async () => {
    setError(null);
    if (!files.length) { setError('ファイルを選んでください'); return; }
    const orgId = getOrgId();
    if (!orgId) { setError('組織が分からないため保存できません。読み込み直してください'); return; }
    setSaving(true);
    try {
      const s = series.trim() || 'main';
      let nextVer = Math.max(0, ...existing.filter(x => x.doc_type === docType && x.series === s).map(x => x.version_no)) + 1;
      for (const file of files) {
        const key = buildDocKey(orgId, dealId, file.name);
        const { error: e1 } = await supabase.storage.from('acq-docs').upload(key, file, { upsert: false, contentType: file.type || undefined });
        if (e1) throw new Error(`「${file.name}」を上げられませんでした：${e1.message}`);
        const { error: e2 } = await supabase.from('acq_documents').insert({
          deal_id: dealId, doc_type: docType, series: s, version_no: nextVer, direction,
          received_on: receivedOn || null, original_name: file.name, storage_path: key,
          mime_type: file.type || null, size_bytes: file.size, note: note.trim() || null,
        });
        if (e2) throw e2;
        nextVer += 1;
      }
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AcqModal title="書類を追加" onClose={onClose} footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} saveLabel="上げる" />}>
      <ErrorNote error={error} />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${color.border}`, borderRadius: 6, padding: space[4], textAlign: 'center',
          marginBottom: space[3], color: color.textMid, fontSize: font.size.sm,
        }}
      >
        <div style={{ marginBottom: space[2] }}>{files.length ? files.map(f => f.name).join('、') : 'ここにファイルを落とすか、選んでください'}</div>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>ファイルを選ぶ</Button>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => pick(e.target.files)} />
      </div>
      <FormGrid>
        <Select label="種類" value={docType} onChange={(e) => setDocType(e.target.value)} options={DOC_TYPES} />
        <Input label="系列（同じ書類の版をまとめる名前）" value={series} onChange={(e) => setSeries(e.target.value)} hint="通常は main のまま。IMが2種類あるときなどに分ける" />
        <Select label="向き" value={direction} onChange={(e) => setDirection(e.target.value)} options={DOC_DIRECTIONS} />
        <Input label="日付" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        <Input label="メモ" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：先方回答版" />
      </FormGrid>
    </AcqModal>
  );
}
