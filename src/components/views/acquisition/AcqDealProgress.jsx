import React, { useMemo, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Input, Select } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { PROGRESS_STAGES, CLOSED_STAGES, stageLabel, todayStr, fmtDate } from './acqConstants';
import { AcqModal, ModalButtons, FormGrid, TextArea, ErrorNote, ConfirmDialog } from './AcqShared';

// 案件の進捗（Phalanx の企業情報ページの進捗にそろえる）
//   段は平らなボタンを横に並べる。達成した段は濃紺、いまの段は内側に金の線、2行目に「達成 M/D」
//   ブレイク（見送り・不成約・ネームクリア不可）は段の外の右端。ブレイク中は赤い帯を出し、段は薄く残して止まった段が分かるようにする
const md = (d) => {
  if (!d) return '';
  const [, m, dd] = String(d).slice(0, 10).split('-');
  return `${Number(m)}/${Number(dd)}`;
};

export default function AcqDealProgress({ dealId, deal, events, onChanged }) {
  const [picking, setPicking] = useState(null); // 進捗を登録する画面
  const [breaking, setBreaking] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // 段ごとの達成日（その段を最初に通った日）
  const achieved = useMemo(() => {
    const m = {};
    for (const e of [...events].sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on)) || a.seq - b.seq)) {
      if (!m[e.stage]) m[e.stage] = e.occurred_on;
    }
    return m;
  }, [events]);

  const current = deal.progress_stage;
  const closed = deal.is_closed;
  const closedEvent = closed ? [...events].reverse().find(e => CLOSED_STAGES.some(s => s.value === e.stage)) : null;

  const reopen = async () => {
    setBusy(true); setError(null);
    try {
      const { error: e } = await supabase.from('acq_deal_stage_events').insert({
        deal_id: dealId, stage: current || 'received', occurred_on: todayStr(), note: 'ブレイクを取り消して再開',
      });
      if (e) throw e;
      setReopening(false);
      await onChanged();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div style={{
      background: color.white, border: `1px solid ${color.borderLight}`, borderRadius: radius.xl,
      padding: `${space[3]}px ${space[4]}px`, marginBottom: space[3],
    }}>
      <ErrorNote error={error} />
      {closed && closedEvent && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap',
          background: color.dangerSoft, color: color.danger, borderRadius: radius.md,
          padding: `${space[2]}px ${space[3]}px`, marginBottom: space[2], fontSize: font.size.sm,
        }}>
          <b>ブレイク</b>
          <span>{stageLabel(closedEvent.stage)}</span>
          <span style={{ color: color.textMid }}>{fmtDate(closedEvent.occurred_on)}・{stageLabel(current)}で止まった</span>
          {(deal.closed_reason || closedEvent.note) && (
            <span style={{ color: color.textDark }}>{deal.closed_reason || closedEvent.note}</span>
          )}
          <div style={{ flex: 1 }} />
          <Button size="sm" variant="outline" onClick={() => setReopening(true)}>取り消して再開</Button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 3, flexWrap: 'wrap' }}>
        {PROGRESS_STAGES.map(s => {
          const done = !!achieved[s.value];
          const here = current === s.value && !closed;
          const stoppedHere = closed && current === s.value;
          return (
            <Button
              key={s.value}
              variant="ghost"
              onClick={() => !closed && setPicking(s.value)}
              disabled={closed}
              style={{
                flex: '1 1 0', minWidth: 92, padding: '7px 10px', textAlign: 'left', justifyContent: 'flex-start',
                borderRadius: radius.md, height: 'auto', display: 'block',
                background: done ? color.navy : color.snow,
                color: done ? color.white : color.textLight,
                opacity: closed ? 0.45 : 1,
                boxShadow: here || stoppedHere ? `inset 0 0 0 2px ${stoppedHere ? color.danger : color.gold}` : 'none',
                cursor: closed ? 'default' : 'pointer',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: done ? font.weight.bold : font.weight.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
              <div style={{ fontSize: 10, marginTop: 1, opacity: 0.85, whiteSpace: 'nowrap' }}>
                {here ? '現在 · ' : stoppedHere ? 'ここで停止 · ' : ''}{done ? `達成 ${md(achieved[s.value])}` : '未達成'}
              </div>
            </Button>
          );
        })}
        <Button
          variant="outline"
          onClick={() => setBreaking(true)}
          disabled={closed}
          style={{ minWidth: 92, borderColor: closed ? color.border : color.danger, color: closed ? color.textLight : color.danger, background: closed ? color.snow : color.white }}
        >ブレイク</Button>
      </div>
      {picking && (
        <ProgressModal dealId={dealId} initial={picking} achieved={achieved} onClose={() => setPicking(null)}
          onSaved={async () => { setPicking(null); await onChanged(); }} />
      )}
      {breaking && (
        <BreakModal dealId={dealId} currentLabel={stageLabel(current)} reason={deal.closed_reason}
          onClose={() => setBreaking(false)} onSaved={async () => { setBreaking(false); await onChanged(); }} />
      )}
      {reopening && (
        <ConfirmDialog
          title="ブレイクを取り消して再開"
          sub={`${stageLabel(current)}から再開します。ブレイクの記録は活動履歴に残ります`}
          okLabel="再開する"
          busy={busy}
          onOk={reopen}
          onCancel={() => setReopening(false)}
        />
      )}
    </div>
  );
}

function ProgressModal({ dealId, initial, achieved, onClose, onSaved }) {
  const [stage, setStage] = useState(initial);
  const [on, setOn] = useState(achieved[initial] || todayStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const { error: e } = await supabase.from('acq_deal_stage_events').insert({ deal_id: dealId, stage, occurred_on: on, note: note.trim() || null });
      if (e) throw e;
      await onSaved();
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  return (
    <AcqModal title="進捗を登録" onClose={onClose} width={480}
      footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} saveLabel={`${stageLabel(stage)}にする`} />}>
      <ErrorNote error={error} />
      <FormGrid>
        <Select label="段階" value={stage} onChange={(e) => setStage(e.target.value)} options={PROGRESS_STAGES.map(s => ({ value: s.value, label: s.label }))} />
        <Input label="達成日" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        <TextArea label="メモ" value={note} onChange={setNote} rows={2} />
      </FormGrid>
    </AcqModal>
  );
}

function BreakModal({ dealId, currentLabel, reason, onClose, onSaved }) {
  const [stage, setStage] = useState('declined_by_us');
  const [on, setOn] = useState(todayStr());
  const [why, setWhy] = useState(reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (!why.trim()) { setError('理由を入れてください'); return; }
    setSaving(true); setError(null);
    try {
      const { error: e1 } = await supabase.from('acq_deal_stage_events').insert({ deal_id: dealId, stage, occurred_on: on, note: why.trim() });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('acq_deals').update({ closed_reason: why.trim(), updated_at: new Date().toISOString() }).eq('id', dealId);
      if (e2) throw e2;
      await onSaved();
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  return (
    <AcqModal title={`${currentLabel}でブレイク`} onClose={onClose} width={480}
      footer={<ModalButtons onCancel={onClose} onSave={save} saving={saving} saveLabel="ブレイクにする" />}>
      <ErrorNote error={error} />
      <FormGrid>
        <Select label="種類" value={stage} onChange={(e) => setStage(e.target.value)} options={CLOSED_STAGES.map(s => ({ value: s.value, label: s.label }))} />
        <Input label="日付" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        <TextArea label="理由" value={why} onChange={setWhy} rows={3} placeholder="例：マルチプル7.7倍で融資が付かない" />
      </FormGrid>
    </AcqModal>
  );
}

