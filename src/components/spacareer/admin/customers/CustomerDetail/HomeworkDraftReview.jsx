import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Button, Badge, Select } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';

// ============================================================
// 事後課題ドラフトのレビュー & 公開（第2〜7回 AI生成分）
//   セッション完了時に notified_at を付けず「ドラフト」生成された事後課題を、
//   トレーナーがここで手動修正し「受講生に公開」で配信する。
//   公開済み（notified_at あり）の課題はここには出さない（TabHomework のサマリで確認）。
// ============================================================

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function HomeworkDraftReview({ detail, customerId, onRefresh }) {
  // ドラフト = 未公開(notified_at なし) かつ AI生成済み(ai_generated_at あり)
  const drafts = useMemo(
    () => (detail?.homework || []).filter((h) => !h.notified_at && h.ai_generated_at),
    [detail?.homework],
  );
  const [selectedId, setSelectedId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState(null);

  const selected = useMemo(() => drafts.find((d) => d.id === selectedId) || drafts[0] || null, [drafts, selectedId]);
  const customerName = detail?.customer?.member?.name || detail?.customer?.nickname || '受講生';

  useEffect(() => {
    if (drafts.length && !drafts.find((d) => d.id === selectedId)) setSelectedId(drafts[0].id);
  }, [drafts, selectedId]);

  useEffect(() => {
    if (!selected?.id) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('spacareer_homework_items')
        .select('*')
        .eq('homework_id', selected.id)
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) { console.error('[HomeworkDraftReview] load items error:', error); setItems([]); }
      else setItems((data || []).map((it) => ({ ...it, _key: it.id })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selected?.id]);

  if (!drafts.length) return null;

  const update = (key, patch) => setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  const remove = (key) => setItems((prev) => prev.filter((it) => it._key !== key));
  const add = () => setItems((prev) => [
    ...prev,
    { _key: `new_${prev.length}_${prev.reduce((m, i) => Math.max(m, i.position || 0), 0) + 1}`,
      position: (prev.reduce((m, i) => Math.max(m, i.position || 0), 0) || 0) + 1,
      question_text: '', question_hint: null, is_required: false, max_length: 500 },
  ]);

  // 現在の編集内容を spacareer_homework_items に保存（ドラフトは回答前なので全削除→再投入で確定）
  async function persistItems() {
    const orgId = selected.org_id;
    const payload = items.map((it, i) => ({
      org_id: orgId,
      homework_id: selected.id,
      position: i + 1,
      section: it.section || null,
      question_text: (it.question_text || '').trim() || `設問${i + 1}`,
      question_hint: it.question_hint ? String(it.question_hint).trim() : null,
      is_required: !!it.is_required,
      item_type: it.item_type || 'text',
      template_url: it.template_url || null,
      template_name: it.template_name || null,
      max_length: it.max_length || null,
    }));
    const { error: delErr } = await supabase.from('spacareer_homework_items').delete().eq('homework_id', selected.id);
    if (delErr) throw delErr;
    const { error: insErr } = await supabase.from('spacareer_homework_items').insert(payload);
    if (insErr) throw insErr;
    return payload.length;
  }

  async function handleSave() {
    setSaving(true); setMsg(null);
    try {
      const n = await persistItems();
      setMsg({ kind: 'ok', text: `下書きを保存しました（${n}項目）。` });
      onRefresh && onRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: `保存に失敗しました: ${e.message || e}` });
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!window.confirm('AIで変動課題を再生成します。固定課題はマスターから取り直し、現在の編集内容は上書きされます。よろしいですか？')) return;
    setRegenerating(true); setMsg(null);
    try {
      // 固定課題をマスターから取り直し、変動分だけAI再生成して結合する。
      const { data: fixedRows } = await supabase.from('spacareer_homework_fixed_items')
        .select('*').eq('session_no', selected.session_no).eq('is_active', true).order('position', { ascending: true });
      const fixedItems = fixedRows || [];
      const variableCount = Math.max(0, 30 - fixedItems.length);

      let variable = [];
      if (variableCount > 0) {
        const { data: gen, error: genErr } = await supabase.functions.invoke('generate-spacareer-homework30', {
          body: {
            customerName,
            sessionNo: selected.session_no,
            contextNotes: '',
            count: variableCount,
            fixedItems: fixedItems.map((f) => f.question_text),
          },
        });
        if (genErr || !Array.isArray(gen?.items) || !gen.items.length) {
          throw new Error(genErr?.message || 'AI生成に失敗しました');
        }
        variable = gen.items;
      }

      const fixedEditable = fixedItems.map((f, i) => ({
        _key: `fix_${i}`,
        position: i + 1,
        section: f.section || null,
        question_text: f.question_text || '',
        question_hint: f.question_hint || null,
        is_required: f.is_required ?? true,
        item_type: f.item_type || 'text',
        template_url: f.template_url || null,
        template_name: f.template_name || null,
      }));
      const variableEditable = variable.map((it, i) => ({
        _key: `gen_${i}`,
        position: fixedItems.length + i + 1,
        question_text: it.question_text || '',
        question_hint: it.question_hint || null,
        is_required: !!it.is_required,
        max_length: it.max_length || 500,
      }));
      setItems([...fixedEditable, ...variableEditable]);
      setMsg({ kind: 'ok', text: 'AIで再生成しました（固定課題＋AI変動）。内容を確認・修正のうえ「下書き保存」または「受講生に公開」してください。' });
    } catch (e) {
      setMsg({ kind: 'err', text: `再生成に失敗しました: ${e.message || e}` });
    } finally {
      setRegenerating(false);
    }
  }

  async function handlePublish() {
    if (!window.confirm(`第${selected.session_no}回の事後課題（${items.length}項目）を受講生に公開します。\n公開後は受講生のポータルに表示され、回答できるようになります。よろしいですか？`)) return;
    setPublishing(true); setMsg(null);
    try {
      // まず編集内容を確定保存してから公開する
      await persistItems();
      const nowIso = new Date().toISOString();
      const { error: updErr } = await supabase.from('spacareer_homework')
        .update({ status: 'unsubmitted', notified_at: nowIso })
        .eq('id', selected.id);
      if (updErr) throw updErr;

      // Slack通知（ベストエフォート。失敗しても課題自体は公開済み）
      try {
        const portalUrl = `${window.location.origin}/spacareer`;
        await supabase.functions.invoke('spacareer-slack-notify', {
          body: {
            org_id: selected.org_id, customer_id: customerId,
            notify_key: 'portal_published',
            vars: {
              顧客名: customerName,
              セッション番号: String(selected.session_no),
              締切日: selected.due_at ? fmtDateTime(selected.due_at) : '別途連絡',
              ポータルURL: portalUrl,
            },
          },
        });
      } catch (e) {
        console.error('[HomeworkDraftReview] slack notify error:', e);
      }

      setMsg({ kind: 'ok', text: `第${selected.session_no}回の事後課題を受講生に公開しました。` });
      onRefresh && onRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: `公開に失敗しました: ${e.message || e}` });
    } finally {
      setPublishing(false);
    }
  }

  const requiredCount = items.filter((i) => i.is_required).length;

  return (
    <Card padding="md"
      title="事後課題ドラフト（未公開・要確認）"
      description="AIが生成した事後課題のドラフトです。内容を確認・修正してから「受講生に公開」してください。公開するまで受講生には表示されません。"
      action={drafts.length > 1
        ? <Select
            size="sm"
            fullWidth={false}
            value={selected?.id || ''}
            onChange={(e) => setSelectedId(e.target.value)}
            options={drafts.map((d) => ({ value: d.id, label: `第${d.session_no}回` }))}
          />
        : <Badge variant="warn" dot>第{selected?.session_no}回</Badge>}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: space[2], marginBottom: space[3], flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          項目数 <strong style={{ color: color.textDark }}>{items.length}</strong>
          <span style={{ margin: '0 8px', color: color.border }}>|</span>
          必須 <strong style={{ color: color.textDark }}>{requiredCount}</strong>
          <span style={{ margin: '0 8px', color: color.border }}>|</span>
          締切目安 <span style={{ fontFamily: font.family.mono }}>{selected?.due_at ? fmtDateTime(selected.due_at) : '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={add}>＋ 項目追加</Button>
          <Button variant="outline" size="sm" loading={regenerating} onClick={handleRegenerate}>AIで再生成</Button>
          <Button variant="secondary" size="sm" loading={saving} onClick={handleSave}>下書き保存</Button>
          <Button variant="primary" size="sm" loading={publishing} onClick={handlePublish} disabled={!items.length}>受講生に公開</Button>
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: space[3], padding: space[2],
          background: msg.kind === 'ok' ? color.successSoft : color.dangerSoft,
          color: msg.kind === 'ok' ? '#1F6537' : '#A20018',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>{msg.text}</div>
      )}

      {loading ? (
        <div style={{ padding: space[4], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
          読み込み中...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {items.map((it, idx) => (
            <div key={it._key} style={{
              border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
              padding: space[3], background: color.white,
            }}>
              <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
                <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textLight, minWidth: 28 }}>
                  #{String(idx + 1).padStart(2, '0')}
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, color: color.textMid, cursor: 'pointer', marginLeft: 'auto' }}>
                  <input type="checkbox" checked={!!it.is_required} onChange={(e) => update(it._key, { is_required: e.target.checked })} />
                  必須
                </label>
                <button type="button" onClick={() => remove(it._key)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: color.textLight, padding: 4, fontSize: font.size.xs }}
                  title="削除">削除</button>
              </div>
              <textarea
                value={it.question_text || ''}
                onChange={(e) => update(it._key, { question_text: e.target.value })}
                rows={2}
                placeholder="設問文"
                style={{
                  width: '100%', border: `1px solid ${color.borderLight}`, borderRadius: radius.sm,
                  padding: space[2], fontSize: font.size.sm, color: color.textDark, background: color.snow,
                  fontFamily: font.family.sans, outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
              <input
                value={it.question_hint || ''}
                onChange={(e) => update(it._key, { question_hint: e.target.value || null })}
                placeholder="回答のヒント（任意）"
                style={{
                  width: '100%', marginTop: space[2], border: `1px solid ${color.borderLight}`, borderRadius: radius.sm,
                  padding: space[2], fontSize: font.size.xs, color: color.textMid, background: color.white,
                  fontFamily: font.family.sans, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
