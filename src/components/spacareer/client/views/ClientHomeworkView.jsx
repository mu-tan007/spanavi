import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Card, Badge, Select } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';

// 仕様書: tasks/spacareer-spec.md §6.2 事前課題
// 参考: イメージ画像③
//
// 仕様要点:
//  - 自動保存なし、ボタンで明示保存
//  - 3ボタン: 一時保存 / 全ての回答を保存 / 回答を提出
//  - 部分提出許容、未回答が1つでもあれば全体は「部分提出」
//  - 文字数カウンター
//  - ファイル添付：最大3、1ファイル50MB、形式制限なし

const MAX_FILES = 3;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
const HOMEWORK_BUCKET = 'spacareer-homework-files';

export default function ClientHomeworkView() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [homeworks, setHomeworks] = useState([]);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState('');
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [kickoffHearingStatus, setKickoffHearingStatus] = useState(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: member } = await supabase
        .from('members').select('id').eq('user_id', profile.id).maybeSingle();
      if (!member) { setLoading(false); return; }
      const { data: cust } = await supabase
        .from('spacareer_customers').select('id').eq('member_id', member.id).maybeSingle();
      if (cancelled) return;
      setCustomer(cust);

      if (cust) {
        // 第0回（キックオフヒアリング）の提出状況。事前課題画面の先頭に表示する。
        const { data: kh } = await supabase
          .from('spacareer_kickoff_hearing_sessions')
          .select('status')
          .eq('customer_id', cust.id)
          .maybeSingle();
        if (!cancelled) setKickoffHearingStatus(kh?.status || null);

        const { data: hws } = await supabase
          .from('spacareer_homework')
          .select('id, session_no, status, notified_at, due_at, submitted_at')
          .eq('customer_id', cust.id)
          .not('notified_at', 'is', null)
          .order('session_no', { ascending: true });
        if (cancelled) return;
        setHomeworks(hws || []);
        const target = (hws || []).find(h => h.status !== 'completed') || (hws || [])[0];
        setSelectedHomeworkId(target?.id || '');
      }
      setLoading(false);
    })().catch(err => {
      console.error('[ClientHomework] load error:', err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => {
    if (!selectedHomeworkId) { setItems([]); setAnswers({}); setFiles({}); return; }
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .from('spacareer_homework_items')
        .select('*')
        .eq('homework_id', selectedHomeworkId)
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) { console.error('[ClientHomework] items error:', error); return; }
      setItems(rows || []);
      const a = {}, f = {};
      (rows || []).forEach(r => {
        a[r.id] = r.answer_text || '';
        f[r.id] = Array.isArray(r.attached_files) ? r.attached_files : [];
      });
      setAnswers(a);
      setFiles(f);
    })();
    return () => { cancelled = true; };
  }, [selectedHomeworkId]);

  const selectedHomework = useMemo(
    () => homeworks.find(h => h.id === selectedHomeworkId) || null,
    [homeworks, selectedHomeworkId],
  );

  const totalItems = items.length;
  const answeredItems = useMemo(() => {
    return items.filter(it => (answers[it.id] || '').trim().length > 0).length;
  }, [items, answers]);
  const progressPct = totalItems ? Math.round((answeredItems / totalItems) * 100) : 0;

  const deadlineWarning = useMemo(() => {
    if (!selectedHomework?.due_at) return null;
    const due = new Date(selectedHomework.due_at);
    const diffDays = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { level: 'danger', text: '提出期限を過ぎています' };
    if (diffDays <= 3) return { level: 'warn', text: `提出期限まであと${diffDays}日` };
    return { level: 'info', text: `提出期限：${due.toLocaleDateString('ja-JP')}` };
  }, [selectedHomework]);

  const saveAnswers = async (itemIds, opts = { setSubmitted: false }) => {
    if (!itemIds.length) return;
    const updates = itemIds.map(id => ({
      id,
      answer_text: answers[id] ?? null,
      attached_files: files[id] || [],
      submitted_at: opts.setSubmitted ? new Date().toISOString() : (items.find(it => it.id === id)?.submitted_at || null),
    }));
    const { error } = await supabase
      .from('spacareer_homework_items')
      .upsert(updates, { onConflict: 'id' });
    if (error) throw error;
    setSavedAt(new Date());
  };

  const recomputeHomeworkStatus = async () => {
    const submittedCount = items.filter(it => (answers[it.id] || '').trim().length > 0).length;
    let newStatus = 'unsubmitted';
    if (submittedCount === 0) newStatus = 'unsubmitted';
    else if (submittedCount < totalItems) newStatus = 'partial';
    else newStatus = 'submitted';
    const patch = { status: newStatus };
    if (newStatus === 'submitted') patch.submitted_at = new Date().toISOString();
    await supabase.from('spacareer_homework').update(patch).eq('id', selectedHomeworkId);
    setHomeworks(prev => prev.map(h => h.id === selectedHomeworkId ? { ...h, ...patch } : h));
  };

  const handleTempSave = async (itemId) => {
    setSaving(true);
    try {
      await saveAnswers([itemId], { setSubmitted: false });
    } catch (e) {
      alert('保存に失敗しました: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await saveAnswers(items.map(it => it.id), { setSubmitted: false });
    } catch (e) {
      alert('保存に失敗しました: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!window.confirm('回答を提出します。提出後も修正・再提出はいつでもできます。よろしいですか？')) return;
    setSubmitting(true);
    try {
      const submitIds = items.filter(it => (answers[it.id] || '').trim().length > 0).map(it => it.id);
      await saveAnswers(submitIds, { setSubmitted: true });
      const nonSubmit = items.filter(it => !((answers[it.id] || '').trim().length > 0)).map(it => it.id);
      if (nonSubmit.length) await saveAnswers(nonSubmit, { setSubmitted: false });
      await recomputeHomeworkStatus();
    } catch (e) {
      alert('提出に失敗しました: ' + (e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileAdd = async (itemId, file) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert('1ファイル50MBまでです。');
      return;
    }
    const current = files[itemId] || [];
    if (current.length >= MAX_FILES) {
      alert('1設問あたり最大3ファイルまでです。');
      return;
    }
    const path = `${customer.id}/${selectedHomeworkId}/${itemId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from(HOMEWORK_BUCKET).upload(path, file, { contentType: file.type });
    if (upErr) {
      alert('アップロードに失敗しました: ' + upErr.message);
      return;
    }
    const { data: urlData } = supabase.storage.from(HOMEWORK_BUCKET).getPublicUrl(path);
    setFiles(prev => ({
      ...prev,
      [itemId]: [...current, { name: file.name, path, url: urlData.publicUrl, size: file.size }],
    }));
  };

  const handleFileRemove = async (itemId, idx) => {
    const list = files[itemId] || [];
    const target = list[idx];
    if (!target) return;
    if (target.path) {
      await supabase.storage.from(HOMEWORK_BUCKET).remove([target.path]);
    }
    setFiles(prev => ({ ...prev, [itemId]: list.filter((_, i) => i !== idx) }));
  };

  if (loading) return <Centered>読み込み中...</Centered>;
  if (!customer) return <Centered>受講情報が見つかりません。運営にお問い合わせください。</Centered>;

  const kickoffSubmitted = ['submitted', 'ai_extracted', 'completed'].includes(kickoffHearingStatus);
  const kickoffNote = kickoffSubmitted ? (
    <Card padding="md" variant="subtle" style={{ marginBottom: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <Badge variant="success" dot>提出済み</Badge>
        <span style={{ fontSize: font.size.sm, color: color.textMid }}>
          第0回（キックオフヒアリング）は提出済みです。
        </span>
      </div>
    </Card>
  ) : null;

  if (homeworks.length === 0) {
    return (
      <div style={{ padding: space[6] }}>
        <Heading />
        {kickoffNote}
        <Card title="現在配信中の事前課題はありません" padding="lg">
          <p style={{ fontSize: font.size.sm, color: color.textMid, margin: 0 }}>
            セッション後にトレーナーから通知されるとここに表示されます。
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[4], paddingBottom: 120 }}>
      <Heading />
      {kickoffNote}

      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <Select
            size="sm"
            value={selectedHomeworkId}
            onChange={e => setSelectedHomeworkId(e.target.value)}
            options={homeworks.map(h => ({
              value: h.id,
              label: `第${h.session_no}回 事前課題 (${labelOfStatus(h.status)})`,
            }))}
          />
        </div>
        {deadlineWarning && (
          <Badge variant={deadlineWarning.level} dot>{deadlineWarning.text}</Badge>
        )}
        {savedAt && (
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>
            最終保存: {savedAt.toLocaleTimeString('ja-JP')}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: space[4] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {items.map((item, idx) => (
            <QuestionCard
              key={item.id}
              index={idx + 1}
              item={item}
              answer={answers[item.id] || ''}
              onAnswerChange={v => setAnswers(prev => ({ ...prev, [item.id]: v }))}
              files={files[item.id] || []}
              onFileAdd={f => handleFileAdd(item.id, f)}
              onFileRemove={i => handleFileRemove(item.id, i)}
              onTempSave={() => handleTempSave(item.id)}
              saving={saving}
            />
          ))}
        </div>

        <div>
          <Card title="回答の進捗" padding="md" style={{ position: 'sticky', top: space[4] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[3] }}>
              <Donut pct={progressPct} />
              <div>
                <div style={{ fontSize: font.size.sm, color: color.textMid }}>回答済み</div>
                <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy }}>
                  {answeredItems} / {totalItems}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto', borderTop: `1px solid ${color.borderLight}`, paddingTop: space[2] }}>
              {items.map((it, idx) => {
                const done = (answers[it.id] || '').trim().length > 0;
                return (
                  <a
                    key={it.id}
                    href={`#hw-q-${it.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: space[2],
                      padding: `${space[1]}px ${space[2]}px`,
                      borderRadius: radius.sm,
                      color: color.textDark,
                      fontSize: font.size.xs,
                      textDecoration: 'none',
                      background: done ? alpha(color.success, 0.06) : 'transparent',
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: done ? color.success : color.gray200,
                      color: color.white, fontSize: 10, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{idx + 1}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.question_text}
                    </span>
                  </a>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <div style={{
        position: 'fixed', left: 220, right: 0, bottom: 0,
        padding: `${space[3]}px ${space[6]}px`,
        background: color.white,
        borderTop: `1px solid ${color.border}`,
        boxShadow: shadow.md,
        display: 'flex', justifyContent: 'flex-end', gap: space[2],
        zIndex: 50,
      }}>
        <Button variant="outline" onClick={handleSaveAll} loading={saving}>一時保存</Button>
        <Button variant="secondary" onClick={handleSaveAll} loading={saving}>全ての回答を保存</Button>
        <Button variant="primary" onClick={handleSubmit} loading={submitting}>回答を提出</Button>
      </div>
    </div>
  );
}

function labelOfStatus(s) {
  return { unnotified: '未通知', unsubmitted: '未提出', partial: '部分提出', submitted: '提出済み', completed: '完了' }[s] || s;
}

function Heading() {
  return (
    <div>
      <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>事前課題</h1>
      <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
        セッションをより有意義な時間にするために、以下の質問にご回答ください。
      </p>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>{children}</div>
  );
}

function QuestionCard({ index, item, answer, onAnswerChange, files, onFileAdd, onFileRemove, onTempSave, saving }) {
  const len = (answer || '').length;
  const max = item.max_length || null;
  return (
    <Card padding="md" style={{ scrollMarginTop: 80 }}>
      <div id={`hw-q-${item.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: space[3], marginBottom: space[3] }}>
        <div style={{
          width: 28, height: 28, flexShrink: 0,
          borderRadius: '50%', background: color.navy, color: color.white,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: font.weight.bold, fontSize: font.size.sm,
        }}>{index}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[1] }}>
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.textDark }}>
              {item.question_text}
            </span>
          </div>
          {item.question_hint && (
            <div style={{ fontSize: font.size.xs, color: color.textLight, lineHeight: font.lineHeight.relaxed, marginBottom: space[2] }}>
              {item.question_hint}
            </div>
          )}
        </div>
      </div>

      <textarea
        value={answer}
        onChange={e => onAnswerChange(e.target.value)}
        placeholder="ここに回答を入力してください"
        rows={6}
        style={{
          width: '100%',
          padding: `${space[3]}px ${space[3]}px`,
          fontSize: font.size.md,
          color: color.textDark,
          fontFamily: font.family.sans,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          outline: 'none',
          resize: 'vertical',
          minHeight: 120,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: space[2] }}>
        <FileAttachArea files={files} onAdd={onFileAdd} onRemove={onFileRemove} />
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.xs, color: max && len > max ? color.danger : color.textLight }}>
            {len}{max ? ` / ${max}` : ''} 文字
          </span>
          <Button size="sm" variant="ghost" onClick={onTempSave} loading={saving}>この設問を保存</Button>
        </div>
      </div>
    </Card>
  );
}

function FileAttachArea({ files, onAdd, onRemove }) {
  const inputId = 'fileinput-' + Math.random().toString(36).slice(2, 8);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      {files.map((f, i) => (
        <a
          key={i}
          href={f.url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: space[1],
            padding: `2px ${space[2]}px`,
            background: color.cream,
            border: `1px solid ${color.border}`,
            borderRadius: radius.sm,
            fontSize: font.size.xs,
            color: color.textDark,
            textDecoration: 'none',
            maxWidth: 200,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={f.name}
        >
          {f.name}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onRemove(i); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.textLight, padding: 0 }}
            aria-label="削除"
          >×</button>
        </a>
      ))}
      {files.length < MAX_FILES && (
        <>
          <label htmlFor={inputId} style={{
            display: 'inline-flex', alignItems: 'center', gap: space[1],
            padding: `4px ${space[2]}px`,
            border: `1px dashed ${color.border}`,
            borderRadius: radius.sm,
            cursor: 'pointer',
            color: color.textMid,
            fontSize: font.size.xs,
          }}>
            ファイル添付（{files.length}/{MAX_FILES}）
          </label>
          <input
            id={inputId}
            type="file"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onAdd(f); e.target.value = ''; }}
          />
        </>
      )}
    </div>
  );
}

function Donut({ pct }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={64} height={64} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={r} fill="none" stroke={color.gray200} strokeWidth="7" />
      <circle
        cx="32" cy="32" r={r} fill="none"
        stroke={color.navyLight} strokeWidth="7"
        strokeDasharray={`${dash} ${c}`}
        strokeDashoffset={c / 4}
        transform="rotate(-90 32 32)"
        strokeLinecap="round"
      />
      <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="700" fill={color.navy}>{pct}%</text>
    </svg>
  );
}
