import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Button, Badge, Select } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { generateHomework30Items } from '../../../../../lib/spacareer/ai/mock';

// ============================================================
// 事後課題：変動課題エディタ（第2〜7回）
// ------------------------------------------------------------
// 新フロー（むー様 2026-06-23）:
//   - 固定事後課題＋感想 … 各回をセッション完了(status='completed')にすると自動公開cronが配信（fixed_published_at）。
//   - 変動事後課題       … 本エディタで AI 生成 → 修正 → 「追加公開」で公開済み課題に追記。
// 対象は固定公開済み（fixed_published_at あり）の第2〜7回。
// 固定項目(source='fixed')と公開済み変動(is_published=true)は受講生の回答保護のため読取専用。
// 編集対象は未公開の変動ドラフト(source='variable' && is_published=false)のみ。
// ============================================================

const TARGET_TOTAL = 30; // 固定＋変動で目指す総項目数

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function HomeworkVariableEditor({ detail, customerId, sessionNo = null, onRefresh }) {
  // 変動課題の対象は「固定公開済み（fixed_published_at あり）」または「セッション完了済み」の第2〜8回。
  // → セッション完了直後（固定の自動公開cronを待たずに）から変動課題を生成・下書き保存できる。
  //   ただし受講生への「追加公開」は固定公開後(fixed_published_at)に限定する（handlePublish で保護）。
  // sessionNo 指定時はその回のみ（セッション管理タブ埋め込み用）。
  const completedSessionNos = useMemo(
    () => new Set((detail?.sessions || []).filter((s) => s.status === 'completed').map((s) => s.session_no)),
    [detail?.sessions],
  );
  const targets = useMemo(
    () => (detail?.homework || [])
      .filter((h) => h.session_no >= 2 && h.session_no <= 8
        && (h.fixed_published_at || completedSessionNos.has(h.session_no))
        && (sessionNo ? h.session_no === sessionNo : true))
      .sort((a, b) => a.session_no - b.session_no),
    [detail?.homework, completedSessionNos, sessionNo],
  );
  const [selectedId, setSelectedId] = useState('');
  const [fixedDrafts, setFixedDrafts] = useState([]);      // source='fixed'（編集可・回答は保持）
  const [removedFixedIds, setRemovedFixedIds] = useState([]);
  const [publishedVar, setPublishedVar] = useState([]);    // source='variable' && is_published（読取専用）
  const [drafts, setDrafts] = useState([]);                // source='variable' && !is_published（編集対象）
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingFixed, setSavingFixed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState(null);

  const selected = useMemo(
    () => targets.find((t) => t.id === selectedId) || targets[0] || null,
    [targets, selectedId],
  );
  const customerName = detail?.customer?.member?.name || detail?.customer?.nickname || '受講生';

  useEffect(() => {
    if (targets.length && !targets.find((t) => t.id === selectedId)) setSelectedId(targets[0].id);
  }, [targets, selectedId]);

  // homework_items をDBから取得し、固定/公開済み変動/変動ドラフトに振り分けて state へ。
  async function fetchItems(homeworkId) {
    const { data, error } = await supabase
      .from('spacareer_homework_items')
      .select('*')
      .eq('homework_id', homeworkId)
      .order('position', { ascending: true });
    if (error) { console.error('[HomeworkVariableEditor] load error:', error); return []; }
    return data || [];
  }
  function applyRows(rows) {
    setFixedDrafts(rows
      .filter((it) => it.source === 'fixed')
      .map((it) => ({
        ...it,
        _key: it.id,
        // 受講生の回答があるか（削除時の警告に使う）
        _answered: !!(it.answer_text && String(it.answer_text).trim())
          || (Array.isArray(it.attached_files) && it.attached_files.length > 0),
      })));
    setRemovedFixedIds([]);
    setPublishedVar(rows.filter((it) => it.source === 'variable' && it.is_published));
    setDrafts(rows
      .filter((it) => it.source === 'variable' && !it.is_published)
      .map((it) => ({ ...it, _key: it.id })));
  }

  useEffect(() => {
    if (!selected?.id) { setFixedDrafts([]); setRemovedFixedIds([]); setPublishedVar([]); setDrafts([]); return; }
    let cancelled = false;
    setLoading(true); setMsg(null);
    (async () => {
      const rows = await fetchItems(selected.id);
      if (cancelled) return;
      applyRows(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selected?.id]);

  if (!targets.length) {
    // セッション管理タブ埋め込み時は、未公開でも案内を出す（第2〜7回のみ対象）。
    if (sessionNo && sessionNo >= 2 && sessionNo <= 8) {
      return (
        <Card padding="md" title="事後課題：変動課題（AI生成）">
          <div style={{ fontSize: font.size.sm, color: color.textMid }}>
            第{sessionNo}回のセッションがまだ完了していません。セッションを完了
            （動画アップロード＋AI議事録＋チェック完了、または「セッション完了」ボタン）すると、
            すぐにここで変動課題を生成・下書き保存できるようになります
            （受講生への追加公開は、固定事後課題が自動公開されたあとに行えます）。
          </div>
        </Card>
      );
    }
    return null;
  }

  const lockedCount = fixedDrafts.length + publishedVar.length;
  const variableTarget = Math.max(1, TARGET_TOTAL - fixedDrafts.length - publishedVar.length);

  const update = (key, patch) => setDrafts((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  const remove = (key) => setDrafts((prev) => prev.filter((it) => it._key !== key));
  const add = () => setDrafts((prev) => [
    ...prev,
    { _key: `new_${prev.length}_${Date.now()}`, question_text: '', question_hint: null, is_required: false, max_length: 500, item_type: 'text' },
  ]);

  // ---- 固定課題の編集（むー様指示 2026-07-09: 受講生ごとに毎回編集できるように） ----
  // 本文/ヒント/必須/形式を編集し「固定課題を保存」でDBへUPDATE（内容列のみ＝回答は保持）。
  // 追加はINSERT、削除は行削除（回答があるものは確認あり）。
  const updateFixed = (key, patch) =>
    setFixedDrafts((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  const addFixed = () => setFixedDrafts((prev) => [
    ...prev,
    { _key: `newfixed_${prev.length}_${Date.now()}`, question_text: '', question_hint: null, is_required: false, max_length: 500, item_type: 'text', _answered: false },
  ]);
  const removeFixed = (key) => {
    const it = fixedDrafts.find((x) => x._key === key);
    if (it?._answered && !window.confirm('この固定課題には受講生の回答があります。削除すると回答も失われます。よろしいですか？')) return;
    if (it?.id) setRemovedFixedIds((prev) => [...prev, it.id]);
    setFixedDrafts((prev) => prev.filter((x) => x._key !== key));
  };

  async function handleSaveFixed() {
    if (!selected?.id) return;
    setSavingFixed(true); setMsg(null);
    try {
      const orgId = selected.org_id;
      // 既存の固定課題は内容列のみUPDATE（answer_text/attached_files/submitted_atは触らない＝回答保持）。
      const existing = fixedDrafts.filter((it) => it.id);
      for (const it of existing) {
        const { error } = await supabase.from('spacareer_homework_items').update({
          question_text: (it.question_text || '').trim() || '設問',
          question_hint: it.question_hint ? String(it.question_hint).trim() : null,
          is_required: !!it.is_required,
          item_type: ['file', 'checkbox'].includes(it.item_type) ? it.item_type : 'text',
          max_length: ['file', 'checkbox'].includes(it.item_type) ? null : (it.max_length || null),
        }).eq('id', it.id);
        if (error) throw error;
      }
      // 追加された固定課題はINSERT（固定ブロックの末尾に付ける）。
      const news = fixedDrafts.filter((it) => !it.id);
      if (news.length) {
        const maxPos = existing.reduce((mx, it) => Math.max(mx, it.position || 0), 0);
        const payload = news.map((it, i) => ({
          org_id: orgId,
          homework_id: selected.id,
          position: maxPos + i + 1,
          section: null,
          question_text: (it.question_text || '').trim() || `設問`,
          question_hint: it.question_hint ? String(it.question_hint).trim() : null,
          is_required: !!it.is_required,
          max_length: ['file', 'checkbox'].includes(it.item_type) ? null : (it.max_length || null),
          item_type: ['file', 'checkbox'].includes(it.item_type) ? it.item_type : 'text',
          template_url: null,
          template_name: null,
          source: 'fixed',
          is_published: true,
        }));
        const { error } = await supabase.from('spacareer_homework_items').insert(payload);
        if (error) throw error;
      }
      // 削除された固定課題を反映。
      if (removedFixedIds.length) {
        const { error } = await supabase.from('spacareer_homework_items').delete().in('id', removedFixedIds);
        if (error) throw error;
      }
      // 実IDを取り直すためDBから再読込（追加分に本物のidを付け、二重INSERTを防ぐ）。
      const rows = await fetchItems(selected.id);
      applyRows(rows);
      setMsg({ kind: 'ok', text: '固定課題を保存しました。受講生の回答は保持されます。' });
    } catch (e) {
      setMsg({ kind: 'err', text: `固定課題の保存に失敗しました: ${e.message || e}` });
    } finally {
      setSavingFixed(false);
    }
  }

  // 議事録など、AIへ渡す当該回の文脈メモを組み立てる。
  function buildContextNotes() {
    const lines = [];
    const c = detail?.customer || {};
    if (c.goal) lines.push(`目標: ${c.goal}`);
    const sess = (detail?.sessions || []).find((s) => s.session_no === selected.session_no);
    const minutes = sess?.minutes_final || sess?.minutes_draft;
    if (minutes) lines.push(`第${selected.session_no}回セッションの議事録抜粋:\n${String(minutes).slice(0, 2500)}`);
    return lines.join('\n');
  }

  async function handleGenerate() {
    if (drafts.length && !window.confirm('現在の変動ドラフトを破棄して、AIで作り直します。よろしいですか？')) return;
    setGenerating(true); setMsg(null);
    try {
      let items = null;
      try {
        const { data, error } = await supabase.functions.invoke('generate-spacareer-homework30', {
          body: {
            customerName,
            sessionNo: selected.session_no,
            contextNotes: buildContextNotes(),
            count: variableTarget,
            fixedItems: fixedDrafts.map((f) => f.question_text),
          },
        });
        if (!error && Array.isArray(data?.items) && data.items.length) items = data.items;
      } catch (e) {
        console.error('[HomeworkVariableEditor] AI error:', e);
      }
      let source = 'ai';
      if (!items) {
        const mock = await generateHomework30Items({ customerId, nextSessionNo: selected.session_no });
        items = mock.slice(0, variableTarget);
        source = 'mock';
      }
      setDrafts(items.map((it, i) => ({
        _key: `gen_${i}_${Date.now()}`,
        question_text: it.question_text || '',
        question_hint: it.question_hint || null,
        is_required: !!it.is_required,
        item_type: ['file', 'checkbox'].includes(it.item_type) ? it.item_type : 'text',
        max_length: ['file', 'checkbox'].includes(it.item_type) ? null : (it.max_length || 500),
      })));
      setMsg({ kind: 'ok', text: source === 'mock'
        ? 'AI生成に失敗したため、テンプレを仮置きしました。内容を確認・修正のうえ「追加公開」してください。'
        : `AIで変動課題を${items.length}項目生成しました。内容を確認・修正のうえ「追加公開」してください。` });
    } catch (e) {
      setMsg({ kind: 'err', text: `生成に失敗しました: ${e.message || e}` });
    } finally {
      setGenerating(false);
    }
  }

  // 変動ドラフトを spacareer_homework_items に保存する。
  // is_published=false のまま保存（公開は handlePublish）。回答前提なので差し替えで確定。
  async function persistDrafts(publish) {
    const orgId = selected.org_id;
    const base = lockedCount; // 固定＋公開済み変動の後ろに続ける
    const payload = drafts.map((it, i) => ({
      org_id: orgId,
      homework_id: selected.id,
      position: base + i + 1,
      section: null,
      question_text: (it.question_text || '').trim() || `設問${base + i + 1}`,
      question_hint: it.question_hint ? String(it.question_hint).trim() : null,
      is_required: !!it.is_required,
      max_length: ['file', 'checkbox'].includes(it.item_type) ? null : (it.max_length || null),
      item_type: ['file', 'checkbox'].includes(it.item_type) ? it.item_type : 'text',
      template_url: null,
      template_name: null,
      source: 'variable',
      is_published: !!publish,
    }));
    // 未公開の変動ドラフトのみ削除（固定・公開済み変動は触らない＝回答保護）。
    const { error: delErr } = await supabase.from('spacareer_homework_items')
      .delete().eq('homework_id', selected.id).eq('source', 'variable').eq('is_published', false);
    if (delErr) throw delErr;
    if (payload.length) {
      const { error: insErr } = await supabase.from('spacareer_homework_items').insert(payload);
      if (insErr) throw insErr;
    }
    return payload.length;
  }

  async function handleSaveDraft() {
    setSaving(true); setMsg(null);
    try {
      const n = await persistDrafts(false);
      setMsg({ kind: 'ok', text: `変動ドラフトを保存しました（${n}項目・未公開）。` });
      onRefresh && onRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: `保存に失敗しました: ${e.message || e}` });
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!drafts.length) return;
    // 順序保護: 固定の事後課題がまだ自動公開されていない回は、変動課題を先に追加公開しない
    // （固定より先に変動だけが受講生に見える状態を防ぐ）。下書きは保存済みなので固定公開後に追加公開できる。
    if (!selected?.fixed_published_at) {
      setMsg({ kind: 'err', text: 'この回の固定事後課題がまだ自動公開されていないため、変動課題の追加公開はできません。固定が公開（セッション完了後の自動公開）されると追加公開できます。下書きはこのまま保持されます。' });
      return;
    }
    if (!window.confirm(`第${selected.session_no}回の変動事後課題（${drafts.length}項目）を受講生に追加公開します。\n公開後は受講生のポータルに表示され、回答できるようになります。よろしいですか？`)) return;
    setPublishing(true); setMsg(null);
    try {
      await persistDrafts(true);
      // 公開済みに昇格したのでヘッダの状態も整える（既に固定公開済みのはず）。
      await supabase.from('spacareer_homework')
        .update({ status: 'unsubmitted', notified_at: selected.notified_at || new Date().toISOString() })
        .eq('id', selected.id);

      // Slack通知（ベストエフォート）
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
        console.error('[HomeworkVariableEditor] slack notify error:', e);
      }

      setMsg({ kind: 'ok', text: `第${selected.session_no}回の変動事後課題を追加公開しました。` });
      onRefresh && onRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: `追加公開に失敗しました: ${e.message || e}` });
    } finally {
      setPublishing(false);
    }
  }

  // 固定公開の手動停止／再公開（notified_at をトグル）。
  async function toggleFixedPublish(stop) {
    if (stop && !window.confirm(`第${selected.session_no}回の事後課題の公開を停止します（受講生のポータルから非表示になります）。よろしいですか？`)) return;
    setToggling(true); setMsg(null);
    try {
      const { error } = await supabase.from('spacareer_homework')
        .update({ notified_at: stop ? null : new Date().toISOString() })
        .eq('id', selected.id);
      if (error) throw error;
      setMsg({ kind: 'ok', text: stop ? '公開を停止しました（ポータル非表示）。' : '再公開しました（ポータル表示）。' });
      onRefresh && onRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: `操作に失敗しました: ${e.message || e}` });
    } finally {
      setToggling(false);
    }
  }

  const isPublished = !!selected?.notified_at;
  // 固定の事後課題が自動公開済みか。未公開の間は「追加公開」を禁止し、生成・下書き保存のみ許可する。
  const fixedPublished = !!selected?.fixed_published_at;

  return (
    <Card padding="md"
      title={`事後課題：変動課題（第${selected?.session_no}回・AI生成）`}
      description="固定の事後課題は予定日時に自動公開済みです。ここでは議事録等を踏まえた変動課題をAI生成→修正し「追加公開」で受講生に追記します。記述/ファイル提出を切り替えられます。"
      action={targets.length > 1
        ? <Select size="sm" fullWidth={false} value={selected?.id || ''}
            onChange={(e) => setSelectedId(e.target.value)}
            options={targets.map((t) => ({ value: t.id, label: `第${t.session_no}回` }))} />
        : <Badge variant="info" dot>第{selected?.session_no}回</Badge>}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: space[2], marginBottom: space[3], flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          固定 <strong style={{ color: color.textDark }}>{fixedDrafts.length}</strong>
          <span style={{ margin: '0 8px', color: color.border }}>|</span>
          公開済み変動 <strong style={{ color: color.textDark }}>{publishedVar.length}</strong>
          <span style={{ margin: '0 8px', color: color.border }}>|</span>
          変動ドラフト <strong style={{ color: color.textDark }}>{drafts.length}</strong>
          <span style={{ margin: '0 8px', color: color.border }}>|</span>
          公開状態 {isPublished
            ? <Badge variant="success" dot>公開中</Badge>
            : fixedPublished
              ? <Badge variant="warn" dot>停止中</Badge>
              : <Badge variant="neutral" dot>固定公開待ち</Badge>}
        </div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={add}>＋ 項目追加</Button>
          <Button variant="outline" size="sm" loading={generating} onClick={handleGenerate}>AIで変動課題を生成</Button>
          <Button variant="secondary" size="sm" loading={saving} onClick={handleSaveDraft} disabled={!drafts.length}>下書き保存</Button>
          <Button variant="primary" size="sm" loading={publishing} onClick={handlePublish}
            disabled={!drafts.length || !fixedPublished}
            title={!fixedPublished ? '固定の事後課題が自動公開されてから追加公開できます（順序保護）。それまでは下書き保存でご準備ください。' : undefined}>追加公開</Button>
          {/* 公開停止／再公開は固定が自動公開された後のみ操作可能にする（固定公開前に notified_at を立てない）。 */}
          {fixedPublished && (isPublished
            ? <Button variant="ghost" size="sm" loading={toggling} onClick={() => toggleFixedPublish(true)}>公開を停止</Button>
            : <Button variant="ghost" size="sm" loading={toggling} onClick={() => toggleFixedPublish(false)}>再公開</Button>)}
        </div>
      </div>

      {!fixedPublished && (
        <div style={{
          marginBottom: space[3], padding: space[2],
          background: color.infoSoft, color: color.textMid,
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>
          この回はセッション完了済みのため、変動課題を今すぐ生成・下書き保存して準備できます。
          受講生への「追加公開」は、固定事後課題が自動公開（セッション完了後、毎時の自動処理で公開）されると行えます。
        </div>
      )}

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
          {/* 固定課題（編集可）。むー様指示 2026-07-09: この受講生の固定課題を毎回編集できる。
              本文などを直すと即ポータルへ反映。既存の回答は保持される。 */}
          <div style={{
            padding: space[3], background: color.cream, borderRadius: radius.md,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: space[2], flexWrap: 'wrap', marginBottom: space[2],
            }}>
              <div style={{ fontWeight: font.weight.semibold, color: color.textDark, fontSize: font.size.xs }}>
                固定課題（この受講生・編集可）{fixedDrafts.length}項目
                <span style={{ marginLeft: space[2], color: color.textLight, fontWeight: font.weight.normal }}>
                  ※本文を直すとポータルに即反映。既存回答は保持されます。
                </span>
              </div>
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                <Button variant="outline" size="sm" onClick={addFixed}>＋ 固定項目を追加</Button>
                <Button variant="primary" size="sm" loading={savingFixed} onClick={handleSaveFixed}>固定課題を保存</Button>
              </div>
            </div>
            {fixedDrafts.length === 0 ? (
              <div style={{ fontSize: font.size.sm, color: color.textLight }}>
                固定課題はまだありません。「＋ 固定項目を追加」で作成できます。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
                {fixedDrafts.map((it, idx) => (
                  <div key={it._key} style={{
                    border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
                    padding: space[3], background: color.white,
                  }}>
                    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
                      <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textLight, minWidth: 40 }}>
                        固定#{String(idx + 1).padStart(2, '0')}
                      </span>
                      {it._answered && (
                        <Badge variant="warn" dot>回答あり</Badge>
                      )}
                      <div style={{ display: 'inline-flex', border: `1px solid ${color.border}`, borderRadius: radius.sm, overflow: 'hidden' }}>
                        {['text', 'file', 'checkbox'].map((t) => (
                          <button key={t} type="button"
                            onClick={() => updateFixed(it._key, { item_type: t, max_length: (t === 'file' || t === 'checkbox') ? null : (it.max_length || 500) })}
                            style={{
                              border: 'none', cursor: 'pointer',
                              padding: `2px ${space[2]}px`, fontSize: font.size.xs,
                              background: (it.item_type || 'text') === t ? color.navy : color.white,
                              color: (it.item_type || 'text') === t ? color.white : color.textMid,
                            }}>{t === 'text' ? '記述' : t === 'file' ? 'ファイル' : 'チェック'}</button>
                        ))}
                      </div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, color: color.textMid, cursor: 'pointer', marginLeft: 'auto' }}>
                        <input type="checkbox" checked={!!it.is_required} onChange={(e) => updateFixed(it._key, { is_required: e.target.checked })} />
                        必須
                      </label>
                      <button type="button" onClick={() => removeFixed(it._key)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: color.textLight, padding: 4, fontSize: font.size.xs }}
                        title="削除">削除</button>
                    </div>
                    <textarea
                      value={it.question_text || ''}
                      onChange={(e) => updateFixed(it._key, { question_text: e.target.value })}
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
                      onChange={(e) => updateFixed(it._key, { question_hint: e.target.value || null })}
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
          </div>
          {publishedVar.length > 0 && (
            <div style={{
              padding: space[2], background: color.cream, borderRadius: radius.md,
              fontSize: font.size.xs, color: color.textMid,
            }}>
              公開済みの変動課題 {publishedVar.length} 項目（回答保護のため編集不可）。
            </div>
          )}

          {/* 変動ドラフト（編集対象） */}
          {drafts.length === 0 ? (
            <div style={{ padding: space[3], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
              変動ドラフトはまだありません。「AIで変動課題を生成」または「＋ 項目追加」で作成してください。
            </div>
          ) : drafts.map((it, idx) => (
            <div key={it._key} style={{
              border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
              padding: space[3], background: color.white,
            }}>
              <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
                <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textLight, minWidth: 40 }}>
                  #{String(lockedCount + idx + 1).padStart(2, '0')}
                </span>
                {/* 提出形式トグル: text=記述 / file=ファイル添付 / checkbox=Slack報告→チェックのみ */}
                <div style={{ display: 'inline-flex', border: `1px solid ${color.border}`, borderRadius: radius.sm, overflow: 'hidden' }}>
                  {['text', 'file', 'checkbox'].map((t) => (
                    <button key={t} type="button"
                      onClick={() => update(it._key, { item_type: t, max_length: (t === 'file' || t === 'checkbox') ? null : (it.max_length || 500) })}
                      style={{
                        border: 'none', cursor: 'pointer',
                        padding: `2px ${space[2]}px`, fontSize: font.size.xs,
                        background: (it.item_type || 'text') === t ? color.navy : color.white,
                        color: (it.item_type || 'text') === t ? color.white : color.textMid,
                      }}>{t === 'text' ? '記述' : t === 'file' ? 'ファイル' : 'チェック'}</button>
                  ))}
                </div>
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
