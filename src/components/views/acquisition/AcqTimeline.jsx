import React, { useMemo, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { stageLabel, activityChannelLabel } from './acqConstants';
import { ErrorNote, LinkText } from './AcqShared';

// 活動履歴（Phalanx の企業情報ページのタイムラインにそろえる）
//   1本の時系列（新しい順）。縦の線と点、点の色で種類を分ける。日時と「N日前」は小さく薄く
//   一番上にメモの入力欄、その下に種類の絞り込み。段階の動きは小さく薄く混ぜる
const TONE = {
  email: color.navyLight, line: color.success, phone: color.info, meeting: color.navy, zoom: color.navy,
  memo: color.gray400, other: color.gray400, stage: color.gold,
};
const FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'email', label: 'メール' },
  { value: 'line', label: 'LINE' },
  { value: 'talk', label: '電話・面談' },
  { value: 'memo', label: 'メモ' },
  { value: 'stage', label: '進捗' },
];
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const fmtLong = (d) => { const t = new Date(d); return `${t.getMonth() + 1}月${t.getDate()}日(${WEEK[t.getDay()]})`; };
const fmtTime = (d) => { const t = new Date(d); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
const daysAgo = (d) => {
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return n <= 0 ? '今日' : n === 1 ? '昨日' : `${n}日前`;
};

export default function AcqTimeline({ dealId, acts, events, onOpenContact, onChanged }) {
  const [filter, setFilter] = useState('all');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const items = useMemo(() => {
    const a = (acts.rows || []).map(r => ({
      key: `a-${r.id}`, at: r.occurred_at, kind: r.channel, quiet: false,
      lead: r.channel === 'memo' ? 'メモ' : `${activityChannelLabel(r.channel)}・${r.direction === 'out' ? '弊社から' : '先方から'}`,
      who: r.contact, subject: r.subject, body: r.summary, url: r.source_url,
    }));
    const s = (events || []).map(e => ({
      key: `s-${e.id}`, at: `${e.occurred_on}T00:00:00`, kind: 'stage', quiet: true,
      lead: '進捗', subject: `${stageLabel(e.stage)}にしました`, body: e.note,
    }));
    return [...a, ...s].sort((x, y) => String(y.at).localeCompare(String(x.at)));
  }, [acts.rows, events]);

  const counts = useMemo(() => {
    const c = { all: items.length };
    for (const it of items) {
      const k = it.kind === 'phone' || it.kind === 'meeting' || it.kind === 'zoom' ? 'talk' : (it.kind === 'other' ? 'memo' : it.kind);
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [items]);

  const shown = items.filter(it => {
    if (filter === 'all') return true;
    if (filter === 'talk') return ['phone', 'meeting', 'zoom'].includes(it.kind);
    if (filter === 'memo') return ['memo', 'other'].includes(it.kind);
    return it.kind === filter;
  });

  const saveMemo = async () => {
    if (!memo.trim()) return;
    setSaving(true); setError(null);
    try {
      const { data, error: e1 } = await supabase.from('acq_activities').insert({
        occurred_at: new Date().toISOString(), channel: 'memo', direction: 'out', summary: memo.trim(), source_kind: 'manual',
      }).select('id').single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('acq_activity_deals').insert({ activity_id: data.id, deal_id: dealId });
      if (e2) throw e2;
      setMemo('');
      await onChanged();
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  return (
    <div>
      <ErrorNote error={error} />
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="メモ"
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box', padding: `${space[2]}px ${space[3]}px`, resize: 'vertical',
          border: `1px solid ${color.border}`, borderRadius: radius.md, fontFamily: font.family.sans, fontSize: 13, color: color.textDark,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space[1] }}>
        <Button size="sm" variant="primary" onClick={saveMemo} loading={saving} disabled={!memo.trim()}>保存</Button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], margin: `${space[3]}px 0 ${space[2]}px` }}>
        {FILTERS.map(f => {
          const on = filter === f.value;
          return (
            <Button key={f.value} size="sm" variant={on ? 'primary' : 'outline'} onClick={() => setFilter(f.value)}
              style={{ borderRadius: radius.pill, padding: '2px 10px', minHeight: 24, fontSize: 11.5 }}>
              {f.label}{counts[f.value] ? ` ${counts[f.value]}` : ''}
            </Button>
          );
        })}
      </div>

      {acts.loading && <div style={{ color: color.textLight, fontSize: font.size.sm }}>読み込み中…</div>}
      {!acts.loading && !shown.length && <div style={{ color: color.textLight, fontSize: font.size.sm }}>記録はまだありません</div>}

      <div style={{ position: 'relative', paddingLeft: 18 }}>
        {shown.length > 0 && <div style={{ position: 'absolute', left: 4, top: 10, bottom: 10, width: 1, background: color.borderLight }} />}
        {shown.map(it => (
          <div key={it.key} style={{ position: 'relative', padding: '10px 0' }}>
            <span style={{
              position: 'absolute', left: -18, top: 15, width: 9, height: 9, borderRadius: '50%',
              background: TONE[it.kind] || color.gray400, border: `2px solid ${color.white}`,
            }} />
            <div style={{ fontSize: it.quiet ? 10.5 : 11.5, color: color.textLight }}>
              {fmtLong(it.at)}{!it.quiet && <span style={{ marginLeft: 6 }}>{fmtTime(it.at)}</span>}
              <span style={{ marginLeft: 8 }}>{daysAgo(it.at)}</span>
              {it.url && <a href={it.url} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: color.info }}>原文</a>}
            </div>
            <div style={{ marginTop: 3, lineHeight: 1.7, fontSize: it.quiet ? 12 : 13.5, color: it.quiet ? color.textLight : color.textDark }}>
              <span>{it.lead}</span>
              {it.who && (
                <span>{'・'}{onOpenContact ? <LinkText onClick={() => onOpenContact(it.who.id)}>{it.who.name}様</LinkText> : `${it.who.name}様`}</span>
              )}
              {it.subject && <b style={{ fontWeight: it.quiet ? font.weight.medium : font.weight.bold, marginLeft: 6 }}>{it.subject}</b>}
            </div>
            {it.body && (
              it.kind === 'memo' || it.kind === 'other'
                ? <div style={{ marginTop: 6, padding: '8px 11px', borderRadius: radius.md, background: color.snow, fontSize: 12.5, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{it.body}</div>
                : <div style={{ marginTop: 4, fontSize: it.quiet ? 11.5 : 12.5, color: it.quiet ? color.textLight : color.textMid, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{it.body}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
