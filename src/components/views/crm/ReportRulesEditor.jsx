import { useEffect, useMemo, useState } from 'react';
import { color, radius, font, space, alpha } from '../../../constants/design';
import { Button, Input, Select } from '../../ui';
import { saveReportRule } from '../../../lib/reportRules';
import { getOrgId } from '../../../lib/orgContext';
import { ITEM_TYPES, CHECK_FIELDS, CHECK_OPS, toStorage, previewReportBlock, scopeLabel } from '../../../utils/reportRulesEdit';

// 顧客管理の詳細「聞くこと・条件」（2026-10-07 見本どおり）
// どこに効かせるか：この会社の全リスト ／ 担当者ごと ／ リストごと（下の段が上の段を引き継ぎ、同じ項目は下が勝つ）
// 必ず聞くこと → アポ報告の画面に出て、空欄は登録前に止まる。報告の本文の【ヒアリング】に入る。
// アポにしない条件・確認すること → 登録前に警告。数字で判定できるものは売上・従業員の値で当てる。

const box = { border: `1px solid ${color.border}`, borderRadius: radius.lg, padding: '12px 14px' };
const h4 = { fontSize: 12, color: color.textMid, fontWeight: font.weight.medium, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
const hint = { fontSize: 11, color: color.textLight };
const chip = (on) => ({
  fontSize: 12, padding: '4px 10px', borderRadius: radius.pill, cursor: 'pointer', fontFamily: font.family.sans,
  border: `1px solid ${on ? color.navyLight : color.border}`, color: on ? color.navyLight : color.textMid,
  background: on ? color.infoSoft : color.white, fontWeight: on ? font.weight.semibold : font.weight.normal,
});
const xBtn = { border: 'none', background: 'transparent', color: color.textLight, cursor: 'pointer', fontSize: 14, padding: 4 };

function Toggle({ on, onChange, labels }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.textMid, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: font.family.sans, whiteSpace: 'nowrap' }}>
      <span style={{ width: 28, height: 16, borderRadius: 999, background: on ? color.navyLight : color.border, position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: color.white, transition: 'left .2s cubic-bezier(.34,1.56,.64,1)' }} />
      </span>
      {on ? labels[0] : labels[1]}
    </button>
  );
}

const toEdit = (row) => ({
  items: (row?.items || []).map(it => ({ ...it, optionsText: (it.options || []).join('、') })),
  conditions: (row?.conditions || []).map(c => ({ ...c, check: c.check ? { ...c.check, value: String(c.check.value) } : { field: '', op: '<=', value: '' } })),
  note: row?.note || '',
});

export default function ReportRulesEditor({ client, contacts = [], lists = [], rules = [], isAdmin, currentUser = '', onSaved }) {
  const [tier, setTier] = useState('all'); // all | contact | list
  const [contactId, setContactId] = useState(contacts[0]?.id || '');
  const [listId, setListId] = useState(lists[0]?._supaId || '');
  const scope = tier === 'contact' ? { contact_id: contactId || null, list_id: null } : tier === 'list' ? { contact_id: null, list_id: listId || null } : { contact_id: null, list_id: null };
  const row = useMemo(() => rules.find(r => (r.contact_id || null) === scope.contact_id && (r.list_id || null) === scope.list_id) || null,
    [rules, scope.contact_id, scope.list_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(() => toEdit(row));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setForm(toEdit(row)); setMsg(null); }, [row, tier, contactId, listId]);

  const setItem = (i, patch) => setForm(f => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const setCond = (i, patch) => setForm(f => ({ ...f, conditions: f.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const others = rules.filter(r => r !== row);
  const needPick = (tier === 'contact' && !contactId) || (tier === 'list' && !listId);

  const save = async () => {
    setSaving(true); setMsg(null);
    const rule = toStorage(form);
    const { error } = await saveReportRule({ clientId: client._supaId, contactId: scope.contact_id, listId: scope.list_id, rule, orgId: getOrgId(), updatedBy: currentUser });
    setSaving(false);
    if (error) { setMsg({ ok: false, text: '保存に失敗しました：' + (error.message || '不明なエラー') }); return; }
    setMsg({ ok: true, text: '保存しました。架電ページとアポ報告に5分以内に反映されます' });
    onSaved?.();
  };

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <div style={hint}>アポ報告に「必ず聞くこと」として出て、本文の【ヒアリング】にも入る</div>

      <div>
        <div style={{ ...hint, marginBottom: 4 }}>どこに効かせるか</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={chip(tier === 'all')} onClick={() => setTier('all')}>この会社の全リスト</button>
          <button type="button" style={chip(tier === 'contact')} onClick={() => setTier('contact')} disabled={contacts.length === 0}>担当者ごと</button>
          <button type="button" style={chip(tier === 'list')} onClick={() => setTier('list')} disabled={lists.length === 0}>リストごと</button>
          {tier === 'contact' && (
            <Select size="sm" fullWidth={false} value={contactId} onChange={e => setContactId(e.target.value)}
              options={contacts.map(c => ({ value: c.id, label: `${c.name} 様` }))} />
          )}
          {tier === 'list' && (
            <Select size="sm" fullWidth={false} value={listId} onChange={e => setListId(e.target.value)}
              options={lists.map(l => ({ value: l._supaId, label: `${l.industry || '（名前なし）'}${l.is_archived ? '（アーカイブ）' : ''}` }))} />
          )}
        </div>
        <div style={{ ...hint, marginTop: 4 }}>下の段は上の段を引き継ぎ、同じ項目は下の段が勝つ</div>
        {others.length > 0 && (
          <div style={{ ...hint, marginTop: 4 }}>
            ほかに設定のある段：{others.map(r => scopeLabel(r, { contacts, lists })).join(' ／ ')}
          </div>
        )}
      </div>

      <div style={box}>
        <div style={h4}><span>必ず聞くこと</span>
          {isAdmin && <Button size="sm" variant="ghost" onClick={() => setForm(f => ({ ...f, items: [...f.items, { label: '', type: 'text', required: true, ask: true, optionsText: '' }] }))}>＋ 項目を足す</Button>}
        </div>
        {form.items.length === 0 && <div style={hint}>まだ項目がありません</div>}
        {form.items.map((it, i) => (
          <div key={it.key || `n${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 128px 28px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${color.borderLight}` }}>
            <Input size="sm" value={it.label} placeholder="例：売上高" disabled={!isAdmin} onChange={e => setItem(i, { label: e.target.value })} />
            <Select size="sm" value={it.type} disabled={!isAdmin} onChange={e => setItem(i, { type: e.target.value })} options={ITEM_TYPES} />
            <Toggle on={!!it.required} onChange={v => isAdmin && setItem(i, { required: v })} labels={['空欄で止める', '空欄でも通す']} />
            {isAdmin ? <button type="button" style={xBtn} title="この項目を消す" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>×</button> : <span />}
            {it.type === 'select' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Input size="sm" value={it.optionsText} placeholder="選択肢を「、」で区切って（例：関心あり、わからない）" disabled={!isAdmin}
                  onChange={e => setItem(i, { optionsText: e.target.value, options: undefined })} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={box}>
        <div style={h4}><span>アポにしない条件・確認すること</span>
          {isAdmin && <Button size="sm" variant="ghost" onClick={() => setForm(f => ({ ...f, conditions: [...f.conditions, { label: '', check: { field: '', op: '<=', value: '' } }] }))}>＋ 条件を足す</Button>}
        </div>
        <div style={{ ...hint, marginBottom: 6 }}>登録前に警告（止めない）。売上・従業員の判定には金額・人数の項目が要る</div>
        {form.conditions.length === 0 && <div style={hint}>まだ条件がありません</div>}
        {form.conditions.map((c, i) => (
          <div key={c.key || `c${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 28px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${color.borderLight}` }}>
            <Input size="sm" value={c.label} placeholder="例：売上1億円以下" disabled={!isAdmin} onChange={e => setCond(i, { label: e.target.value })} />
            <Select size="sm" value={c.check?.field || ''} disabled={!isAdmin} onChange={e => setCond(i, { check: { ...(c.check || {}), field: e.target.value } })} options={CHECK_FIELDS} />
            {isAdmin ? <button type="button" style={xBtn} title="この条件を消す" onClick={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}>×</button> : <span />}
            {c.check?.field && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: color.textMid }}>
                <span>{c.check.field === 'revenue_oku' ? '売上が' : '従業員が'}</span>
                <Input size="sm" fullWidth={false} style={{ width: 80 }} value={c.check.value} disabled={!isAdmin} onChange={e => setCond(i, { check: { ...c.check, value: e.target.value } })} />
                <span>{c.check.field === 'revenue_oku' ? '億円' : '人'}</span>
                <Select size="sm" fullWidth={false} value={c.check.op || '<='} disabled={!isAdmin} onChange={e => setCond(i, { check: { ...c.check, op: e.target.value } })} options={CHECK_OPS} />
                <span>なら警告</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <div style={{ ...hint, marginBottom: 4 }}>メモ（この段の決めた理由など）</div>
        <textarea value={form.note} disabled={!isAdmin} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: font.family.sans, color: color.textDark, resize: 'vertical' }} />
      </div>

      <div style={{ background: alpha(color.navyLight, 0.04), border: `1px dashed ${alpha(color.navyLight, 0.35)}`, borderRadius: radius.lg, padding: '10px 12px' }}>
        <div style={{ ...hint, marginBottom: 4 }}>報告の本文にはこう入る</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: font.family.sans, fontSize: 12, lineHeight: 1.7, color: color.textDark }}>{previewReportBlock(form.items) || '（項目を足すと、ここに出ます）'}</pre>
      </div>

      {isAdmin ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
          {msg && <span style={{ fontSize: 12, color: msg.ok ? color.success : color.danger }}>{msg.text}</span>}
          <Button variant="primary" size="sm" loading={saving} disabled={saving || needPick} onClick={save}>この段を保存</Button>
        </div>
      ) : <div style={hint}>編集は管理者だけができます</div>}
    </div>
  );
}
