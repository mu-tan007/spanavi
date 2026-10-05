import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../constants/design';
import { Badge, Button, Input, Select } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { ACTIVITY_CHANNELS, activityChannelLabel, fmtDateTime } from './acqConstants';
import { AcqModal, ModalButtons, FormGrid, TextArea, ErrorNote, LinkText } from './AcqShared';

// やり取り（活動履歴）。案件・担当者・会社のどれから開いても同じ記録を出す。
//   filter: { dealId } | { contactId } | { firmId }
export function useActivities(filter) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const key = JSON.stringify(filter);

  const reload = useCallback(async () => {
    setError(null);
    let query;
    if (filter.dealId) {
      query = supabase.from('acq_activities')
        .select('*, contact:acq_contacts(id,name), firm:acq_firms(id,name), links:acq_activity_deals!inner(deal_id), deals:acq_activity_deals(deal:acq_deals(id,name,project_name))')
        .eq('links.deal_id', filter.dealId);
    } else {
      query = supabase.from('acq_activities')
        .select('*, contact:acq_contacts(id,name), firm:acq_firms(id,name), deals:acq_activity_deals(deal:acq_deals(id,name,project_name))');
      if (filter.contactId) query = query.eq('contact_id', filter.contactId);
      if (filter.firmId) query = query.eq('firm_id', filter.firmId);
    }
    const { data, error: e } = await query.order('occurred_at', { ascending: false }).limit(500);
    if (e) setError(e); else setRows(data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { reload(); }, [reload]);
  return { rows, loading, error, reload };
}

export function ActivityList({ rows, loading, error, onOpenDeal, onOpenContact, showDeals = true }) {
  if (loading) return <div style={{ color: color.textLight, fontSize: font.size.sm }}>読み込み中…</div>;
  if (error) return <ErrorNote error={error} />;
  if (!rows.length) return <div style={{ color: color.textLight, fontSize: font.size.sm }}>やり取りの記録はまだありません</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {rows.map(a => (
        <div key={a.id} style={{
          border: `1px solid ${color.borderLight}`, borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px`,
          background: a.direction === 'out' ? color.cream : color.white,
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2], fontSize: font.size.xs, color: color.textMid }}>
            <span style={{ fontFamily: font.family.mono }}>{fmtDateTime(a.occurred_at)}</span>
            <Badge variant="neutral">{activityChannelLabel(a.channel)}</Badge>
            <span>{a.direction === 'out' ? '弊社 →' : '← 先方'}</span>
            {a.contact
              ? (onOpenContact ? <LinkText onClick={() => onOpenContact(a.contact.id)}>{a.contact.name}様</LinkText> : <span>{a.contact.name}様</span>)
              : (a.firm ? <span>{a.firm.name}</span> : null)}
            {showDeals && (a.deals || []).filter(x => x.deal).map(x => (
              <span key={x.deal.id}>
                {onOpenDeal
                  ? <LinkText onClick={() => onOpenDeal(x.deal.id)}>{x.deal.name || x.deal.project_name}</LinkText>
                  : (x.deal.name || x.deal.project_name)}
              </span>
            ))}
            {a.source_url && <a href={a.source_url} target="_blank" rel="noreferrer" style={{ color: color.info }}>原文</a>}
          </div>
          {a.subject && <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark, marginTop: space[1] }}>{a.subject}</div>}
          {a.summary && <div style={{ fontSize: font.size.sm, color: color.textDark, marginTop: space[1], whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{a.summary}</div>}
        </div>
      ))}
    </div>
  );
}

const nowLocal = () => {
  const t = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
};

// やり取りを手で記録する。案件は複数選べる。
export function ActivityFormModal({ contacts, deals, defaults = {}, onClose, onSaved }) {
  const [f, setF] = useState({
    occurred_at: nowLocal(),
    channel: 'email',
    direction: 'in',
    contact_id: defaults.contactId || '',
    subject: '',
    summary: '',
    source_url: '',
  });
  const [dealIds, setDealIds] = useState(defaults.dealId ? [defaults.dealId] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e?.target ? e.target.value : e }));

  const contactOptions = useMemo(() => [{ value: '', label: '—' },
    ...contacts.map(c => ({ value: c.id, label: c.firm?.name ? `${c.name}（${c.firm.name}）` : c.name }))], [contacts]);
  const dealOptions = useMemo(() => deals.filter(d => !dealIds.includes(d.id))
    .map(d => ({ value: d.id, label: d.display_name || d.name || d.project_name })), [deals, dealIds]);

  const save = async () => {
    setError(null);
    if (!f.summary.trim() && !f.subject.trim()) { setError('件名か要約を入れてください'); return; }
    setSaving(true);
    try {
      const contact = contacts.find(c => c.id === f.contact_id);
      const { data, error: e1 } = await supabase.from('acq_activities').insert({
        occurred_at: new Date(f.occurred_at).toISOString(),
        channel: f.channel,
        direction: f.direction,
        contact_id: f.contact_id || null,
        firm_id: contact?.firm_id || null,
        subject: f.subject.trim() || null,
        summary: f.summary.trim() || null,
        source_url: f.source_url.trim() || null,
        source_kind: 'manual',
      }).select('id').single();
      if (e1) throw e1;
      if (dealIds.length) {
        const { error: e2 } = await supabase.from('acq_activity_deals').insert(dealIds.map(id => ({ activity_id: data.id, deal_id: id })));
        if (e2) throw e2;
      }
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AcqModal title="やり取りを記録" onClose={onClose} footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} />}>
      <ErrorNote error={error} />
      <FormGrid>
        <Input label="日時" type="datetime-local" value={f.occurred_at} onChange={set('occurred_at')} />
        <Select label="手段" value={f.channel} onChange={set('channel')} options={ACTIVITY_CHANNELS} />
        <Select label="向き" value={f.direction} onChange={set('direction')} options={[{ value: 'in', label: '先方から' }, { value: 'out', label: '弊社から' }]} />
        <Select label="相手" value={f.contact_id} onChange={set('contact_id')} options={contactOptions} />
        <Input label="件名" value={f.subject} onChange={set('subject')} />
        <Input label="原文のリンク" value={f.source_url} onChange={set('source_url')} placeholder="Gmailのリンクなど" />
        <TextArea label="要約" value={f.summary} onChange={set('summary')} rows={5} />
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[1] }}>関わる案件</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], marginBottom: space[2] }}>
            {dealIds.map(id => {
              const d = deals.find(x => x.id === id);
              return (
                <Button key={id} size="sm" variant="secondary" onClick={() => setDealIds(prev => prev.filter(x => x !== id))}>
                  {(d?.display_name || d?.name || d?.project_name || '案件')} ×
                </Button>
              );
            })}
          </div>
          <Select size="sm" value="" onChange={(e) => { const v = e.target.value; if (v) setDealIds(prev => [...prev, v]); }}
            options={[{ value: '', label: '案件を足す…' }, ...dealOptions]} />
        </div>
      </FormGrid>
    </AcqModal>
  );
}
