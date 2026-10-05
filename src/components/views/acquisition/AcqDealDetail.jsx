import React, { useCallback, useEffect, useState } from 'react';
import { color, space, font, radius } from '../../../constants/design';
import { Badge, Button, Input, Select } from '../../ui';
import PageHeader from '../../common/PageHeader';
import { supabase } from '../../../lib/supabase';
import {
  STAGES, STAGE_BY_VALUE, stageLabel, priceRange, priceBasisLabel, schemeLabel, channelLabel,
  yen, fmtDate, todayStr, DEFENSE_RELATIONS,
} from './acqConstants';
import { KeyFigure, InfoRows, SubTabs, LinkText, ErrorNote, AcqModal, ModalButtons, FormGrid, TextArea, ConfirmDialog } from './AcqShared';
import AcqDealFormModal from './AcqDealFormModal';
import AcqDocuments from './AcqDocuments';
import AcqFinancials from './AcqFinancials';
import { useActivities, ActivityList, ActivityFormModal } from './AcqActivities';

// 買収 > 案件の詳細。上段に価格と段階、その下に 概要／書類／やり取り／財務。
export default function AcqDealDetail({ dealId, data, onBack, onOpenFirm, onOpenContact, onOpenDeal }) {
  const { firms, contacts, deals, reload: reloadAll } = data;
  const [deal, setDeal] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const acts = useActivities({ dealId });

  const load = useCallback(async () => {
    const [d, e] = await Promise.all([
      supabase.from('acq_deal_list').select('*').eq('id', dealId).maybeSingle(),
      supabase.from('acq_deal_stage_events').select('*').eq('deal_id', dealId).order('occurred_on', { ascending: false }).order('seq', { ascending: false }),
    ]);
    if (d.error || e.error) { setError(d.error || e.error); return; }
    setDeal(d.data); setEvents(e.data || []);
  }, [dealId]);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => { await Promise.all([load(), reloadAll()]); };

  const removeDeal = async () => {
    setBusy(true);
    try {
      const { data: docs } = await supabase.from('acq_documents').select('storage_path').eq('deal_id', dealId);
      if (docs?.length) {
        const { error: e1 } = await supabase.storage.from('acq-docs').remove(docs.map(x => x.storage_path));
        if (e1) throw e1;
      }
      const { error: e2 } = await supabase.from('acq_deals').delete().eq('id', dealId);
      if (e2) throw e2;
      await reloadAll();
      onBack();
    } catch (e) {
      setError(e); setDeleting(false);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div><Button variant="outline" size="sm" onClick={onBack}>← 一覧へ</Button><div style={{ marginTop: space[3] }}><ErrorNote error={error} /></div></div>;
  if (!deal) return <div style={{ color: color.textLight }}>読み込み中…</div>;

  const st = STAGE_BY_VALUE[deal.current_stage];
  const ebitda = deal.ebitda_ours ?? deal.ebitda_im;

  return (
    <div>
      <PageHeader
        title={deal.display_name}
        description={[deal.name && deal.project_name ? deal.project_name : null, [deal.industry, deal.region].filter(Boolean).join('・')].filter(Boolean).join('　')}
        right={(
          <span style={{ display: 'inline-flex', gap: space[2] }}>
            <Button variant="outline" size="sm" onClick={onBack}>← 一覧へ</Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>編集</Button>
            <Button variant="primary" size="sm" onClick={() => setStageOpen(true)}>段階を動かす</Button>
          </span>
        )}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[3], marginBottom: space[4] }}>
        <KeyFigure label="希望価格" value={priceRange(deal.asking_price_min, deal.asking_price_max)}
          sub={deal.asking_price_min != null || deal.asking_price_max != null ? priceBasisLabel(deal.asking_price_basis) : (deal.asking_price_text || null)} />
        <KeyFigure label="倍率（希望価格÷修正EBITDA）" value={deal.multiple != null ? `${deal.multiple}倍` : '—'} />
        <KeyFigure label="修正EBITDA" value={yen(ebitda)} sub={deal.ebitda_ours != null ? `弊社修正（IM ${yen(deal.ebitda_im)}）` : (deal.ebitda_im != null ? 'IMの値' : null)} />
        <KeyFigure label="売上" value={yen(deal.revenue)} />
        <KeyFigure label="ネットキャッシュ" value={yen(deal.net_cash)} />
        <div style={{
          flex: '1 1 160px', minWidth: 160, padding: `${space[3]}px ${space[4]}px`,
          background: color.white, border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
        }}>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[1] }}>段階</div>
          <Badge variant={st?.variant || 'default'} dot>{stageLabel(deal.current_stage)}</Badge>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1] }}>
            {deal.next_deadline_on ? `次の期限 ${fmtDate(deal.next_deadline_on)} ${deal.next_deadline_label || ''}` : `更新 ${fmtDate(deal.stage_on)}`}
          </div>
        </div>
      </div>

      <SubTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: '概要' },
          { value: 'docs', label: '書類', count: deal.doc_count ?? 0 },
          { value: 'activities', label: 'やり取り', count: acts.rows.length },
          { value: 'financials', label: '財務' },
        ]}
      />

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: space[4] }}>
          <div style={{ background: color.white, border: `1px solid ${color.borderLight}`, borderRadius: radius.md, padding: space[4] }}>
            <InfoRows rows={[
              ['実名', deal.name || '（ネームクリア前）'],
              ['PJ名・見出し', deal.project_name],
              ['紹介元', deal.source_firm_id
                ? <LinkText onClick={() => onOpenFirm(deal.source_firm_id)}>{deal.source_firm_name}</LinkText> : '—'],
              ['担当者', deal.source_contact_id
                ? <LinkText onClick={() => onOpenContact(deal.source_contact_id)}>{deal.source_contact_name}様</LinkText> : '—'],
              ['売り手側FA', deal.sell_side_firm_id
                ? <LinkText onClick={() => onOpenFirm(deal.sell_side_firm_id)}>{deal.sell_side_firm_name}</LinkText> : '—'],
              ['入口', channelLabel(deal.channel)],
              ['受領日', fmtDate(deal.received_on)],
              ['スキーム', schemeLabel(deal.scheme)],
              ['希望価格の原文', deal.asking_price_text],
              ['防衛関連の領域', deal.scope_domain],
              ['防衛との関わり', DEFENSE_RELATIONS.find(x => x.value === deal.defense_relation)?.label || '—'],
              ['法人番号', deal.corporate_number],
              ['案件フォルダ', deal.folder_path],
              ['概要', deal.summary],
              ['結果・理由', deal.closed_reason],
            ]} />
            <div style={{ marginTop: space[4], display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>この案件を削除</Button>
            </div>
          </div>
          <div style={{ background: color.white, border: `1px solid ${color.borderLight}`, borderRadius: radius.md, padding: space[4] }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[2] }}>段階の履歴</div>
            {events.map(e => (
              <div key={e.id} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', padding: `${space[1]}px 0`, borderBottom: `1px solid ${color.borderLight}` }}>
                <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid, width: 84 }}>{fmtDate(e.occurred_on)}</span>
                <Badge variant={STAGE_BY_VALUE[e.stage]?.variant || 'default'}>{stageLabel(e.stage)}</Badge>
                {e.note && <span style={{ fontSize: font.size.xs, color: color.textMid }}>{e.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'docs' && <AcqDocuments dealId={dealId} onChanged={refresh} />}

      {tab === 'activities' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: space[2] }}>
            <Button variant="primary" size="sm" onClick={() => setRecording(true)}>やり取りを記録</Button>
          </div>
          <ActivityList {...acts} onOpenContact={onOpenContact} onOpenDeal={(id) => { if (id !== dealId) onOpenDeal(id); }} />
        </div>
      )}

      {tab === 'financials' && <AcqFinancials dealId={dealId} onChanged={refresh} />}

      {editing && (
        <AcqDealFormModal
          deal={deal}
          firms={firms}
          contacts={contacts}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await refresh(); }}
        />
      )}
      {stageOpen && (
        <StageModal
          dealId={dealId}
          current={deal.current_stage}
          closedReason={deal.closed_reason}
          onClose={() => setStageOpen(false)}
          onSaved={async () => { setStageOpen(false); await refresh(); }}
        />
      )}
      {recording && (
        <ActivityFormModal
          contacts={contacts}
          deals={deals}
          defaults={{ dealId, contactId: deal.source_contact_id }}
          onClose={() => setRecording(false)}
          onSaved={async () => { setRecording(false); await acts.reload(); await reloadAll(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`案件「${deal.display_name}」を削除`}
          sub="書類・やり取りのひも付け・段階の履歴・財務もまとめて消え、元に戻せません"
          okLabel="削除する"
          danger
          busy={busy}
          onOk={removeDeal}
          onCancel={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

function StageModal({ dealId, current, closedReason, onClose, onSaved }) {
  const [stage, setStage] = useState(current || 'received');
  const [on, setOn] = useState(todayStr());
  const [note, setNote] = useState('');
  const [reason, setReason] = useState(closedReason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const closing = ['declined_by_us', 'lost', 'name_clear_denied'].includes(stage);

  const save = async () => {
    setError(null);
    if (stage === current && !note.trim()) { setError('いまと同じ段階です。メモを残すか、別の段階を選んでください'); return; }
    setSaving(true);
    try {
      const { error: e1 } = await supabase.from('acq_deal_stage_events').insert({ deal_id: dealId, stage, occurred_on: on, note: note.trim() || null });
      if (e1) throw e1;
      if (closing && reason.trim() !== (closedReason || '')) {
        const { error: e2 } = await supabase.from('acq_deals').update({ closed_reason: reason.trim() || null, updated_at: new Date().toISOString() }).eq('id', dealId);
        if (e2) throw e2;
      }
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const from = stageLabel(current);
  const to = stageLabel(stage);
  return (
    <AcqModal
      title="段階を動かす"
      onClose={onClose}
      width={520}
      footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} saveLabel={stage === current ? 'メモを残す' : `${from}→${to}へ動かす`} />}
    >
      <ErrorNote error={error} />
      <FormGrid>
        <Select label="次の段階" value={stage} onChange={(e) => setStage(e.target.value)} options={STAGES} />
        <Input label="日付" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        <TextArea label="メモ" value={note} onChange={setNote} rows={2} />
        {closing && <TextArea label="見送り・不成約の理由" value={reason} onChange={setReason} rows={3} />}
      </FormGrid>
    </AcqModal>
  );
}
