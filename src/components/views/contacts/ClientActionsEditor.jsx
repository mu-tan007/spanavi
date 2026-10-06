import { useCallback, useEffect, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Input, Select } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { NEXT_ACTION_OWNERS, ACTION_CATEGORIES, actionKindsFor } from '../crm/utils';

// ============================================================
// 会社ごとの予定（次の一手）を複数持つ（2026-10-06）
// 例：支援中なら「次のリスト依頼 10/20」「報告書の提出 10/31」。
// 一覧の「次の一手」列には、まだ済んでいない予定のうち一番早いものが出る
// （client_actions のトリガーが clients.next_action* に写す）。
// ============================================================

const empty = (status, category = '連絡') => ({ category, kind: actionKindsFor(status, category)[0] || 'その他', note: '', owner: '当方', due: '', at_time: '' });

export default function ClientActionsEditor({ client, onChanged }) {
  const [items, setItems] = useState([]);
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState(null);   // 追加中の予定
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!client?._supaId) return;
    const { data } = await supabase.from('client_actions')
      .select('id,category,kind,note,owner,due,at_time,gcal_event_id,done_at,created_at')
      .eq('client_id', client._supaId)
      .order('done_at', { ascending: true, nullsFirst: true })
      .order('due', { ascending: true, nullsFirst: false });
    setItems(data || []);
  }, [client?._supaId]);
  useEffect(() => { load(); }, [load]);

  // 予定を変えたら一覧の「次の一手」も変わるので、会社の行を読み直して親に渡す
  const after = async () => {
    await load();
    const { data } = await supabase.from('clients')
      .select('next_action,next_action_owner,next_action_due').eq('id', client._supaId).maybeSingle();
    if (data) onChanged?.({ nextAction: data.next_action || '', nextActionOwner: data.next_action_owner || '', nextActionDue: data.next_action_due || '' });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const row = { category: draft.category, kind: draft.kind, note: draft.note || null, owner: draft.owner, due: draft.due || null, at_time: draft.category === '面談' ? (draft.at_time || null) : null };
    const { error } = draft.id
      ? await supabase.from('client_actions').update(row).eq('id', draft.id)
      : await supabase.from('client_actions').insert({ ...row, client_id: client._supaId, org_id: client.orgId || client.org_id || (await orgOf(client._supaId)) });
    setBusy(false);
    if (error) { alert('保存に失敗しました: ' + error.message); return; }
    setDraft(null);
    await after();
  };
  const setDone = async (it, done) => {
    const { error } = await supabase.from('client_actions').update({ done_at: done ? new Date().toISOString() : null }).eq('id', it.id);
    if (error) { alert('更新に失敗しました: ' + error.message); return; }
    await after();
  };
  const remove = async (it) => {
    if (!window.confirm(`「${it.kind}${it.note ? '：' + it.note : ''}」を消しますか？`)) return;
    const { error } = await supabase.from('client_actions').delete().eq('id', it.id);
    if (error) { alert('削除に失敗しました: ' + error.message); return; }
    await after();
  };

  const open = items.filter(i => !i.done_at);
  const done = items.filter(i => i.done_at);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ marginBottom: space[3] }}>
      {open.length === 0 && !draft && (
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[2] }}>予定はまだありません</div>
      )}
      {open.map(it => draft?.id === it.id ? null : (
        <div key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 0', borderBottom: `1px solid ${color.borderLight}` }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: font.size.xs, lineHeight: 1.5 }}>
            <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.white, background: it.owner === '先方' ? color.textLight : color.navy, borderRadius: radius.sm, padding: '0 5px', marginRight: 4 }}>{it.owner}</span>
            <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: it.category === '面談' ? color.success : color.navy, border: `1px solid ${it.category === '面談' ? color.success : color.navy}`, borderRadius: radius.sm, padding: '0 4px', marginRight: 4 }}>{it.category}</span>
            <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{it.kind}</span>
            {it.note && <span style={{ color: color.textDark }}>：{it.note}</span>}
            <div style={{ color: it.due && it.due < today ? color.danger : color.textMid, fontWeight: it.due && it.due < today ? font.weight.bold : undefined }}>
              {it.due ? `${it.category === '面談' ? '' : '期限 '}${it.due.replaceAll('-', '/')}${it.at_time ? ' ' + it.at_time : ''}${it.due < today ? '（期限切れ）' : ''}` : '期限なし'}
              {it.gcal_event_id && <span style={{ marginLeft: 6, color: color.textLight }}>Googleカレンダーから</span>}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDone(it, true)}>完了</Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft({ ...it, due: it.due || '', note: it.note || '', at_time: it.at_time || '' })}>直す</Button>
        </div>
      ))}

      {draft ? (
        <div style={{ padding: space[2], marginTop: space[2], background: color.gray50, border: `1px solid ${color.border}`, borderRadius: radius.md, display: 'grid', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px', gap: 6 }}>
            <Select size="sm" value={draft.category} onChange={e => { const category = e.target.value; setDraft({ ...draft, category, kind: actionKindsFor(client.status, category)[0] }); }}
              options={ACTION_CATEGORIES.map(k => ({ value: k, label: k }))} />
            <Select size="sm" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}
              options={actionKindsFor(client.status, draft.category).map(k => ({ value: k, label: k }))} />
            <Select size="sm" value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })}
              options={NEXT_ACTION_OWNERS.map(k => ({ value: k, label: k }))} />
          </div>
          <Input size="sm" placeholder="中身（例：10/5配布リストの次を依頼）" value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: draft.category === '面談' ? '1fr 110px' : '1fr', gap: 6 }}>
            <Input size="sm" type="date" value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })} />
            {draft.category === '面談' && <Input size="sm" type="time" value={draft.at_time} onChange={e => setDraft({ ...draft, at_time: e.target.value })} />}
          </div>
          {draft.gcal_event_id && <div style={{ fontSize: 11, color: color.textLight }}>Googleカレンダーの予定です。日時はカレンダーで直すと、ここにも反映されます</div>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            {draft.id && <Button size="sm" variant="danger" onClick={() => { const d = draft; setDraft(null); remove(d); }}>消す</Button>}
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>やめる</Button>
            <Button size="sm" variant="primary" loading={busy} onClick={save}>保存</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setDraft(empty(client.status))} style={{ marginTop: space[2] }}>＋ 予定を足す</Button>
      )}

      {done.length > 0 && (
        <div style={{ marginTop: space[2] }}>
          <Button size="sm" variant="ghost" onClick={() => setShowDone(v => !v)}>{showDone ? '済んだ予定を隠す' : `済んだ予定 ${done.length}件`}</Button>
          {showDone && done.map(it => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: font.size.xs, color: color.textLight, padding: '4px 0' }}>
              <span style={{ flex: 1, textDecoration: 'line-through' }}>{it.kind}{it.note ? '：' + it.note : ''}</span>
              <span>{(it.done_at || '').slice(0, 10).replaceAll('-', '/')} 完了</span>
              <Button size="sm" variant="ghost" onClick={() => setDone(it, false)}>戻す</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function orgOf(clientId) {
  const { data } = await supabase.from('clients').select('org_id').eq('id', clientId).maybeSingle();
  return data?.org_id;
}
