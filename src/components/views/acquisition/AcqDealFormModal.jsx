import React, { useMemo, useState } from 'react';
import { Input, Select } from '../../ui';
import { supabase } from '../../../lib/supabase';
import {
  CHANNELS, PRICE_BASIS, SCHEMES, STAGES, DEFENSE_RELATIONS, parseYen, todayStr,
} from './acqConstants';
import { AcqModal, ModalButtons, FormGrid, TextArea, ErrorNote } from './AcqShared';

const toInput = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (n % 1e8 === 0) return `${n / 1e8}億`;
  if (n % 1e4 === 0) return `${n / 1e4}万`;
  return String(n);
};

// 案件の追加・編集。追加のときは最初の段階も一緒に入れる。
export default function AcqDealFormModal({ deal, firms, contacts, onClose, onSaved }) {
  const isNew = !deal;
  const [f, setF] = useState(() => ({
    name: deal?.name || '',
    project_name: deal?.project_name || '',
    industry: deal?.industry || '',
    region: deal?.region || '',
    summary: deal?.summary || '',
    channel: deal?.channel || 'intro',
    source_firm_id: deal?.source_firm_id || '',
    source_contact_id: deal?.source_contact_id || '',
    sell_side_firm_id: deal?.sell_side_firm_id || '',
    received_on: deal?.received_on || todayStr(),
    asking_price_min: toInput(deal?.asking_price_min),
    asking_price_max: toInput(deal?.asking_price_max),
    asking_price_basis: deal?.asking_price_basis || 'unknown',
    asking_price_text: deal?.asking_price_text || '',
    scheme: deal?.scheme || 'unknown',
    next_deadline_on: deal?.next_deadline_on || '',
    next_deadline_label: deal?.next_deadline_label || '',
    closed_reason: deal?.closed_reason || '',
    scope_domain: deal?.scope_domain || '',
    defense_relation: deal?.defense_relation || '',
    corporate_number: deal?.corporate_number || '',
    folder_path: deal?.folder_path || '',
    first_stage: 'received',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e?.target ? e.target.value : e }));

  const firmOptions = [{ value: '', label: '—' }, ...firms.map(x => ({ value: x.id, label: x.name }))];
  const contactOptions = useMemo(() => {
    const list = f.source_firm_id ? contacts.filter(c => c.firm_id === f.source_firm_id) : contacts;
    return [{ value: '', label: '—' }, ...list.map(c => ({ value: c.id, label: c.firm?.name ? `${c.name}（${c.firm.name}）` : c.name }))];
  }, [contacts, f.source_firm_id]);

  const save = async () => {
    setError(null);
    if (!f.name.trim() && !f.project_name.trim()) { setError('案件名かPJ名のどちらかを入れてください'); return; }
    const pmin = parseYen(f.asking_price_min);
    const pmax = parseYen(f.asking_price_max);
    if (Number.isNaN(pmin) || Number.isNaN(pmax)) { setError('希望価格は「4.2億」「3000万」「420000000」の形で入れてください'); return; }
    if (f.corporate_number && !/^[0-9]{13}$/.test(f.corporate_number)) { setError('法人番号は13桁の数字です'); return; }
    const row = {
      name: f.name.trim() || null,
      project_name: f.project_name.trim() || null,
      industry: f.industry.trim() || null,
      region: f.region.trim() || null,
      summary: f.summary.trim() || null,
      channel: f.channel,
      source_firm_id: f.source_firm_id || null,
      source_contact_id: f.source_contact_id || null,
      sell_side_firm_id: f.sell_side_firm_id || null,
      received_on: f.received_on || null,
      asking_price_min: pmin,
      asking_price_max: pmax ?? pmin,
      asking_price_basis: f.asking_price_basis,
      asking_price_text: f.asking_price_text.trim() || null,
      scheme: f.scheme,
      next_deadline_on: f.next_deadline_on || null,
      next_deadline_label: f.next_deadline_label.trim() || null,
      closed_reason: f.closed_reason.trim() || null,
      scope_domain: f.scope_domain.trim() || null,
      defense_relation: f.defense_relation || null,
      corporate_number: f.corporate_number || null,
      folder_path: f.folder_path.trim() || null,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    try {
      if (isNew) {
        const { data, error: e1 } = await supabase.from('acq_deals').insert(row).select('id').single();
        if (e1) throw e1;
        const { error: e2 } = await supabase.from('acq_deal_stage_events')
          .insert({ deal_id: data.id, stage: f.first_stage, occurred_on: f.received_on || todayStr() });
        if (e2) throw e2;
        await onSaved(data.id);
      } else {
        const { error: e1, count } = await supabase.from('acq_deals').update(row, { count: 'exact' }).eq('id', deal.id);
        if (e1) throw e1;
        if (count === 0) throw new Error('保存できませんでした（権限が無いか、案件が見つかりません）');
        await onSaved(deal.id);
      }
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AcqModal
      title={isNew ? '案件を追加' : '案件を編集'}
      onClose={onClose}
      width={760}
      footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} />}
    >
      <ErrorNote error={error} />
      <FormGrid>
        <Input label="案件名（実名）" value={f.name} onChange={set('name')} placeholder="例：株式会社辻建設" />
        <Input label="PJ名・匿名の見出し" value={f.project_name} onChange={set('project_name')} placeholder="例：PJ orange" />
        <Input label="業種" value={f.industry} onChange={set('industry')} />
        <Input label="地域" value={f.region} onChange={set('region')} />
        <Select label="入口" value={f.channel} onChange={set('channel')} options={CHANNELS} />
        <Input label="受領日" type="date" value={f.received_on} onChange={set('received_on')} />
        <Select label="紹介元の会社" value={f.source_firm_id} onChange={set('source_firm_id')} options={firmOptions} />
        <Select label="紹介元の担当者" value={f.source_contact_id} onChange={set('source_contact_id')} options={contactOptions} />
        <Select label="売り手側FA" value={f.sell_side_firm_id} onChange={set('sell_side_firm_id')} options={firmOptions} />
        {isNew
          ? <Select label="いまの段階" value={f.first_stage} onChange={set('first_stage')} options={STAGES} />
          : <div />}
        <Input label="希望価格（下限）" value={f.asking_price_min} onChange={set('asking_price_min')} placeholder="例：4億" />
        <Input label="希望価格（上限・同じなら空欄）" value={f.asking_price_max} onChange={set('asking_price_max')} placeholder="例：4.5億" />
        <Select label="希望価格の種類" value={f.asking_price_basis} onChange={set('asking_price_basis')} options={PRICE_BASIS} />
        <Input label="希望価格の原文" value={f.asking_price_text} onChange={set('asking_price_text')} placeholder="例：時価純資産＋営業権5年" />
        <Select label="スキーム" value={f.scheme} onChange={set('scheme')} options={SCHEMES} />
        <Input label="法人番号（13桁）" value={f.corporate_number} onChange={set('corporate_number')} />
        <Input label="次の期限" type="date" value={f.next_deadline_on} onChange={set('next_deadline_on')} />
        <Input label="期限の中身" value={f.next_deadline_label} onChange={set('next_deadline_label')} placeholder="例：LOI締切" />
        <Input label="防衛関連の領域" value={f.scope_domain} onChange={set('scope_domain')} placeholder="例：部品・素材・加工" />
        <Select label="防衛との関わり" value={f.defense_relation} onChange={set('defense_relation')} options={DEFENSE_RELATIONS} />
        <TextArea label="概要" value={f.summary} onChange={set('summary')} rows={3} />
        <TextArea label="結果・見送りの理由" value={f.closed_reason} onChange={set('closed_reason')} rows={2} />
        <Input label="OneDriveの案件フォルダ" value={f.folder_path} onChange={set('folder_path')} placeholder="例：02_事業運営/企業買収/案件/辻建設" />
      </FormGrid>
    </AcqModal>
  );
}
