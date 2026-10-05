import React, { useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../constants/design';
import { Badge, Button, DataTable, Input, Select } from '../../ui';
import PageHeader from '../../common/PageHeader';
import { supabase } from '../../../lib/supabase';
import { FIRM_KINDS, firmKindLabel, stageLabel, STAGE_BY_VALUE, priceRange, fmtDate } from './acqConstants';
import { AcqModal, ModalButtons, FormGrid, TextArea, ErrorNote, InfoRows, SubTabs, ConfirmDialog, LinkText } from './AcqShared';
import { useActivities, ActivityList } from './AcqActivities';
import { ContactFormModal } from './AcqContactsView';

// 買収 > 仲介会社・担当者：紹介元の会社ごとに、紹介件数・トップ面談数・最後の紹介日と担当者をまとめる
export function AcqFirmsView({ data, onOpenFirm, onOpenContact }) {
  const { firms, contacts, loading, error, reload } = data;
  const contactsByFirm = useMemo(() => {
    const m = new Map();
    for (const c of contacts) {
      if (!c.firm_id) continue;
      if (!m.has(c.firm_id)) m.set(c.firm_id, []);
      m.get(c.firm_id).push(c);
    }
    return m;
  }, [contacts]);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => firms.filter(f => {
    if (kind && f.kind !== kind) return false;
    if (q.trim() && !f.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  }), [firms, q, kind]);

  const columns = [
    { key: 'name', label: '会社名', width: 260, align: 'left', sortable: true,
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.name}</span> },
    { key: 'kind', label: '種別', width: 130, align: 'center', render: (r) => <Badge variant="neutral">{firmKindLabel(r.kind)}</Badge> },
    { key: 'deal_count', label: '紹介件数', width: 100, align: 'right', sortable: true, sortType: 'number', cellStyle: { fontFamily: font.family.mono } },
    { key: 'top_meeting_count', label: 'トップ面談', width: 100, align: 'right', sortable: true, sortType: 'number', cellStyle: { fontFamily: font.family.mono } },
    { key: 'last_received_on', label: '最後の紹介', width: 110, align: 'right', sortable: true, cellStyle: { fontFamily: font.family.mono }, render: (r) => fmtDate(r.last_received_on) },
    { key: 'contacts', label: '担当者', width: 300, align: 'left', sortable: true, sortType: 'number', sortValue: (r) => r.contact_count,
      render: (r) => {
        const list = contactsByFirm.get(r.id) || [];
        if (!list.length) return <span style={{ color: color.textLight }}>—</span>;
        return (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: `${space[0.5]}px ${space[2]}px` }}>
            {list.map(c => <LinkText key={c.id} onClick={() => onOpenContact(c.id)}>{c.name}様</LinkText>)}
          </span>
        );
      } },
    { key: 'client_id', label: '営業代行の顧客', width: 120, align: 'center', render: (r) => (r.client_id ? <Badge variant="info">顧客</Badge> : '') },
    { key: 'notes', label: 'メモ', width: 220, align: 'left', render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.notes || ''}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="仲介会社・担当者"
        description="紹介元の会社ごとに担当者をまとめています。会社名の行を押すと会社の詳細、担当者名を押すとその方のやり取りが開きます"
        right={<Button variant="primary" onClick={() => setCreating(true)}>会社を追加</Button>}
      />
      <div style={{ display: 'flex', gap: space[2], marginBottom: space[3] }}>
        <div style={{ width: 200 }}><Select size="sm" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: '', label: 'すべての種別' }, ...FIRM_KINDS]} /></div>
        <div style={{ width: 260 }}><Input size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="会社名で探す" /></div>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey="id"
        loading={loading}
        error={error}
        emptyMessage="会社はまだありません"
        onRowClick={(r) => onOpenFirm(r.id)}
        defaultSort={{ key: 'deal_count', dir: 'desc' }}
        height="calc(100vh - 250px)"
      />
      {creating && (
        <FirmFormModal onClose={() => setCreating(false)} onSaved={async (id) => { setCreating(false); await reload(); onOpenFirm(id); }} />
      )}
    </div>
  );
}

export function FirmFormModal({ firm, onClose, onSaved }) {
  const [f, setF] = useState({ name: firm?.name || '', kind: firm?.kind || 'intermediary', website: firm?.website || '', notes: firm?.notes || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e?.target ? e.target.value : e }));

  const save = async () => {
    setError(null);
    if (!f.name.trim()) { setError('会社名を入れてください'); return; }
    const row = { name: f.name.trim(), kind: f.kind, website: f.website.trim() || null, notes: f.notes.trim() || null, updated_at: new Date().toISOString() };
    setSaving(true);
    try {
      if (firm) {
        const { error: e } = await supabase.from('acq_firms').update(row).eq('id', firm.id);
        if (e) throw e;
        await onSaved(firm.id);
      } else {
        const { data, error: e } = await supabase.from('acq_firms').insert(row).select('id').single();
        if (e) throw e;
        await onSaved(data.id);
      }
    } catch (e) {
      setError(e?.code === '23505' ? '同じ名前の会社がすでにあります' : e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AcqModal title={firm ? '会社を編集' : '会社を追加'} onClose={onClose} footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} />}>
      <ErrorNote error={error} />
      <FormGrid>
        <Input label="会社名" value={f.name} onChange={set('name')} />
        <Select label="種別" value={f.kind} onChange={set('kind')} options={FIRM_KINDS} />
        <Input label="ホームページ" value={f.website} onChange={set('website')} />
        <div />
        <TextArea label="メモ" value={f.notes} onChange={set('notes')} rows={3} />
      </FormGrid>
    </AcqModal>
  );
}

export function AcqFirmDetail({ firmId, data, onBack, onOpenDeal, onOpenContact }) {
  const { firms, contacts, deals, reload } = data;
  const firm = firms.find(f => f.id === firmId);
  const [tab, setTab] = useState('contacts');
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const acts = useActivities({ firmId });

  const firmContacts = contacts.filter(c => c.firm_id === firmId);
  const firmDeals = deals.filter(d => d.source_firm_id === firmId || d.sell_side_firm_id === firmId);

  if (!firm) return <div><Button variant="outline" size="sm" onClick={onBack}>← 一覧へ</Button></div>;

  const remove = async () => {
    setBusy(true);
    const { error: e } = await supabase.from('acq_firms').delete().eq('id', firmId);
    setBusy(false);
    if (e) { setError(e); setDeleting(false); return; }
    await reload(); onBack();
  };

  const dealColumns = [
    { key: 'display_name', label: '案件名', width: 240, align: 'left', render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.display_name}</span> },
    { key: 'role', label: '役割', width: 100, align: 'center', render: (r) => (r.source_firm_id === firmId ? '紹介元' : '売り手側FA') },
    { key: 'source_contact_name', label: '担当者', width: 120, align: 'left', render: (r) => (r.source_contact_name ? `${r.source_contact_name}様` : '—') },
    { key: 'received_on', label: '受領日', width: 100, align: 'right', cellStyle: { fontFamily: font.family.mono }, render: (r) => fmtDate(r.received_on) },
    { key: 'current_stage', label: '段階', width: 130, align: 'center', render: (r) => <Badge variant={STAGE_BY_VALUE[r.current_stage]?.variant || 'default'} dot>{stageLabel(r.current_stage)}</Badge> },
    { key: 'asking', label: '希望価格', width: 130, align: 'right', cellStyle: { fontFamily: font.family.mono }, render: (r) => priceRange(r.asking_price_min, r.asking_price_max) },
    { key: 'closed_reason', label: '結果・理由', width: 260, align: 'left', render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.closed_reason || ''}</span> },
  ];
  const contactColumns = [
    { key: 'name', label: '氏名', width: 160, align: 'left', render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.name}</span> },
    { key: 'title', label: '役職', width: 160, align: 'left' },
    { key: 'email', label: 'メール', width: 220, align: 'left' },
    { key: 'phone', label: '電話', width: 140, align: 'left' },
    { key: 'preferred_channel', label: '連絡手段', width: 100, align: 'center', render: (r) => ({ email: 'メール', line: 'LINE', phone: '電話', slack: 'Slack', other: 'その他' }[r.preferred_channel] || '—') },
  ];

  return (
    <div>
      <ErrorNote error={error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3] }}>
        <Button variant="outline" size="sm" onClick={onBack}>← 一覧へ</Button>
        <div style={{ flex: 1 }} />
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>編集</Button>
        <Button variant="primary" size="sm" onClick={() => setAddingContact(true)}>担当者を追加</Button>
      </div>
      <div style={{ background: color.white, border: `1px solid ${color.borderLight}`, borderRadius: radius.md, padding: space[4], marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[3] }}>{firm.name}</div>
        <InfoRows rows={[
          ['種別', firmKindLabel(firm.kind)],
          ['紹介件数', `${firm.deal_count}件（トップ面談 ${firm.top_meeting_count}件）`],
          ['最後の紹介', fmtDate(firm.last_received_on)],
          ['ホームページ', firm.website ? <a href={firm.website} target="_blank" rel="noreferrer" style={{ color: color.info }}>{firm.website}</a> : '—'],
          ['営業代行の顧客', firm.client_id ? 'はい（営業代行の顧客と同じ会社）' : '—'],
          ['メモ', firm.notes],
        ]} />
      </div>
      <SubTabs value={tab} onChange={setTab} tabs={[
        { value: 'contacts', label: '担当者', count: firmContacts.length },
        { value: 'deals', label: '案件', count: firmDeals.length },
        { value: 'activities', label: 'やり取り', count: acts.rows.length },
      ]} />
      {tab === 'deals' && <DataTable columns={dealColumns} rows={firmDeals} rowKey="id" emptyMessage="案件はまだありません" onRowClick={(r) => onOpenDeal(r.id)} height="auto" />}
      {tab === 'contacts' && <DataTable columns={contactColumns} rows={firmContacts} rowKey="id" emptyMessage="担当者はまだいません" onRowClick={(r) => onOpenContact(r.id)} height="auto" />}
      {tab === 'activities' && <ActivityList {...acts} onOpenDeal={onOpenDeal} onOpenContact={onOpenContact} />}
      <div style={{ marginTop: space[4], display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>この会社を削除</Button>
      </div>
      {editing && <FirmFormModal firm={firm} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await reload(); }} />}
      {addingContact && (
        <ContactFormModal firms={firms} defaults={{ firmId }} onClose={() => setAddingContact(false)}
          onSaved={async () => { setAddingContact(false); await reload(); }} />
      )}
      {deleting && (
        <ConfirmDialog
          title={`会社「${firm.name}」を削除`}
          sub="担当者と案件は残り、会社とのひも付けだけ外れます"
          okLabel="削除する"
          danger
          busy={busy}
          onOk={remove}
          onCancel={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
