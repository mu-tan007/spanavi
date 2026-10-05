import React, { useState } from 'react';
import { color, space, font, radius } from '../../../constants/design';
import { Badge, Button, DataTable, Input, Select } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { CONTACT_CHANNELS, stageLabel, STAGE_BY_VALUE, priceRange, fmtDate, fmtDateTime } from './acqConstants';
import { AcqModal, ModalButtons, FormGrid, TextArea, ErrorNote, InfoRows, SubTabs, LinkText, ConfirmDialog } from './AcqShared';
import { useActivities, ActivityList, ActivityFormModal } from './AcqActivities';

const channelText = (v) => CONTACT_CHANNELS.find(x => x.value === v)?.label || '—';

// 担当者の追加・編集と詳細。一覧は仲介会社のページに会社ごとにまとめて出す（AcqFirmsView）。

export function ContactFormModal({ contact, firms, defaults = {}, onClose, onSaved }) {
  const [f, setF] = useState({
    firm_id: contact?.firm_id || defaults.firmId || '',
    name: contact?.name || '',
    title: contact?.title || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    preferred_channel: contact?.preferred_channel || '',
    line_name: contact?.line_name || '',
    notes: contact?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e?.target ? e.target.value : e }));

  const save = async () => {
    setError(null);
    if (!f.name.trim()) { setError('氏名を入れてください'); return; }
    const row = {
      firm_id: f.firm_id || null, name: f.name.trim(), title: f.title.trim() || null,
      email: f.email.trim() || null, phone: f.phone.trim() || null,
      preferred_channel: f.preferred_channel || null, line_name: f.line_name.trim() || null,
      notes: f.notes.trim() || null, updated_at: new Date().toISOString(),
    };
    setSaving(true);
    try {
      if (contact) {
        const { error: e } = await supabase.from('acq_contacts').update(row).eq('id', contact.id);
        if (e) throw e;
        await onSaved(contact.id);
      } else {
        const { data, error: e } = await supabase.from('acq_contacts').insert(row).select('id').single();
        if (e) throw e;
        await onSaved(data.id);
      }
    } catch (e) {
      setError(e?.code === '23505' ? '同じメールアドレスの担当者がすでにいます' : e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AcqModal title={contact ? '担当者を編集' : '担当者を追加'} onClose={onClose} footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} />}>
      <ErrorNote error={error} />
      <FormGrid>
        <Input label="氏名" value={f.name} onChange={set('name')} />
        <Select label="会社" value={f.firm_id} onChange={set('firm_id')} options={[{ value: '', label: '—' }, ...firms.map(x => ({ value: x.id, label: x.name }))]} />
        <Input label="役職" value={f.title} onChange={set('title')} />
        <Select label="連絡手段" value={f.preferred_channel} onChange={set('preferred_channel')} options={CONTACT_CHANNELS} />
        <Input label="メール" value={f.email} onChange={set('email')} />
        <Input label="電話" value={f.phone} onChange={set('phone')} />
        <Input label="LINEの表示名" value={f.line_name} onChange={set('line_name')} />
        <div />
        <TextArea label="メモ" value={f.notes} onChange={set('notes')} rows={3} />
      </FormGrid>
    </AcqModal>
  );
}

export function AcqContactDetail({ contactId, data, onBack, onOpenDeal, onOpenFirm }) {
  const { contacts, firms, deals, reload } = data;
  const contact = contacts.find(c => c.id === contactId);
  const [tab, setTab] = useState('activities');
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const acts = useActivities({ contactId });
  const myDeals = deals.filter(d => d.source_contact_id === contactId);

  if (!contact) return <div><Button variant="outline" size="sm" onClick={onBack}>← 一覧へ</Button></div>;

  const remove = async () => {
    setBusy(true);
    const { error: e } = await supabase.from('acq_contacts').delete().eq('id', contactId);
    setBusy(false);
    if (e) { setError(e); setDeleting(false); return; }
    await reload(); onBack();
  };

  const dealColumns = [
    { key: 'display_name', label: '案件名', width: 240, align: 'left', render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.display_name}</span> },
    { key: 'received_on', label: '受領日', width: 100, align: 'right', cellStyle: { fontFamily: font.family.mono }, render: (r) => fmtDate(r.received_on) },
    { key: 'current_stage', label: '段階', width: 130, align: 'center', render: (r) => <Badge variant={STAGE_BY_VALUE[r.current_stage]?.variant || 'default'} dot>{stageLabel(r.current_stage)}</Badge> },
    { key: 'asking', label: '希望価格', width: 130, align: 'right', cellStyle: { fontFamily: font.family.mono }, render: (r) => priceRange(r.asking_price_min, r.asking_price_max) },
    { key: 'closed_reason', label: '結果・理由', width: 280, align: 'left', render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.closed_reason || ''}</span> },
  ];
  const lastAct = acts.rows[0]?.occurred_at;

  return (
    <div>
      <ErrorNote error={error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3] }}>
        <Button variant="outline" size="sm" onClick={onBack}>← 一覧へ</Button>
        <div style={{ flex: 1 }} />
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>編集</Button>
        <Button variant="primary" size="sm" onClick={() => setRecording(true)}>やり取りを記録</Button>
      </div>
      <div style={{ background: color.white, border: `1px solid ${color.borderLight}`, borderRadius: radius.md, padding: space[4], marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[3] }}>{contact.name}様</div>
        <InfoRows rows={[
          ['会社', contact.firm_id ? <LinkText onClick={() => onOpenFirm(contact.firm_id)}>{contact.firm?.name}</LinkText> : '—'],
          ['役職', contact.title],
          ['メール', contact.email ? <a href={`mailto:${contact.email}`} style={{ color: color.info }}>{contact.email}</a> : '—'],
          ['電話', contact.phone],
          ['連絡手段', channelText(contact.preferred_channel)],
          ['LINEの表示名', contact.line_name],
          ['紹介件数', `${myDeals.filter(d => d.current_stage !== 'candidate').length}件`],
          ['最後のやり取り', lastAct ? fmtDateTime(lastAct) : '—'],
          ['メモ', contact.notes],
        ]} />
      </div>
      <SubTabs value={tab} onChange={setTab} tabs={[
        { value: 'activities', label: 'やり取り', count: acts.rows.length },
        { value: 'deals', label: '紹介案件', count: myDeals.length },
      ]} />
      {tab === 'activities' && <ActivityList {...acts} onOpenDeal={onOpenDeal} />}
      {tab === 'deals' && <DataTable columns={dealColumns} rows={myDeals} rowKey="id" emptyMessage="紹介案件はまだありません" onRowClick={(r) => onOpenDeal(r.id)} height="auto" />}
      <div style={{ marginTop: space[4], display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>この担当者を削除</Button>
      </div>
      {editing && <ContactFormModal contact={contact} firms={firms} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await reload(); }} />}
      {recording && (
        <ActivityFormModal contacts={contacts} deals={deals} defaults={{ contactId }}
          onClose={() => setRecording(false)}
          onSaved={async () => { setRecording(false); await acts.reload(); await reload(); }} />
      )}
      {deleting && (
        <ConfirmDialog
          title={`担当者「${contact.name}」を削除`}
          sub="案件とやり取りは残り、担当者とのひも付けだけ外れます"
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
