import { useState, useEffect, useRef, useCallback } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import {
  fetchClientMeetings, insertClientMeeting, updateClientMeeting,
  deleteClientMeeting, uploadMeetingRecording, invokeSummarizeMeetingRecording,
  reorderClientMeetings,
} from '../../../lib/supabaseWrite';
import { useImeSafeInput } from '../../../lib/useImeSafe';

// AI解析の進行中マーカー (DB側 summary が このプレフィックスの間ポーリング)
const ANALYZING_PREFIX = '[AI解析中';
const ERROR_PREFIX = '[AI解析エラー';

// 全クライアントにデフォルトで用意する3枠（実DBに無ければ仮想カードで表示し、
// 編集された時点でINSERTして実レコードに昇格する）
const DEFAULT_TITLES = ['初回面談', 'キックオフミーティング', '定期MTG'];
const TITLE_ALIASES = {
  '初回面談':           ['初回面談', '初回'],
  'キックオフミーティング': ['キックオフミーティング', 'キックオフMTG', 'キックオフ', 'KO'],
  '定期MTG':            ['定期MTG', '定例MTG', '定例ミーティング', '定例会議', '定期', '定例'],
};
function matchDefaultCategory(title) {
  const t = (title || '').trim();
  if (!t) return null;
  for (const [cat, aliases] of Object.entries(TITLE_ALIASES)) {
    if (aliases.some(a => t.includes(a))) return cat;
  }
  return null;
}
function mergeWithDefaults(list) {
  const tagged = (list || []).map(r => ({ ...r, _cat: matchDefaultCategory(r.title) }));
  const present = new Set(tagged.map(r => r._cat).filter(Boolean));
  const virtuals = DEFAULT_TITLES
    .filter(t => !present.has(t))
    .map(t => ({
      id: `virtual:${t}`, virtual: true, title: t, meeting_at: null,
      summary: '', next_action: '', recording_url: '', transcript: '',
      _cat: t,
    }));
  // デフォルト3枠は固定順、それ以外は新しい順
  const defaults = DEFAULT_TITLES.map(cat =>
    tagged.find(r => r._cat === cat) || virtuals.find(v => v._cat === cat)
  ).filter(Boolean);
  const others = tagged
    .filter(r => !r._cat)
    .sort((a, b) => new Date(b.meeting_at || 0) - new Date(a.meeting_at || 0));
  return [...defaults, ...others];
}

// 「2026-06-05」形式 → ISOタイムスタンプ (00:00 JST)
function dateInputToIso(s) {
  if (!s) return new Date().toISOString();
  return new Date(s + 'T00:00:00+09:00').toISOString();
}
function isoToDateInput(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }); }
  catch { return ''; }
}

export default function ClientMeetingsSection({ clientId, currentUser = '' }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // 一覧取得 (仮想カード3枠を補完)
  const reload = useCallback(async () => {
    if (!clientId) return;
    const { data } = await fetchClientMeetings(clientId);
    setRows(mergeWithDefaults(data));
    setLoading(false);
  }, [clientId]);

  useEffect(() => { reload(); }, [reload]);

  // 仮想カード → 実DBレコードに昇格
  const materializeVirtual = useCallback(async (virtualMeeting, initialPatch = {}) => {
    const { data, error } = await insertClientMeeting({
      clientId,
      title: initialPatch.title || virtualMeeting.title,
      meetingAt: initialPatch.meetingAt || new Date().toISOString(),
      createdBy: currentUser,
    });
    if (error) { alert('追加に失敗: ' + error.message); return null; }
    setRows(prev => prev.map(r => (r.id === virtualMeeting.id) ? { ...data, _cat: virtualMeeting._cat } : r));
    return data;
  }, [clientId, currentUser]);

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    // 末尾に追加するため、現在の最大 sort_order + 1000
    const maxOrder = Math.max(0, ...rows.filter(r => !r.virtual).map(r => Number(r.sort_order || 0)));
    const { data, error } = await insertClientMeeting({
      clientId, title: '面談', meetingAt: new Date().toISOString(), createdBy: currentUser,
    });
    if (data) {
      await updateClientMeeting(data.id, { sort_order: maxOrder + 1000 });
      data.sort_order = maxOrder + 1000;
    }
    setAdding(false);
    if (error) { alert('追加に失敗: ' + error.message); return; }
    setRows(prev => [...prev, { ...data, _cat: null }]);
  };

  // ドラッグ並び替え (実カードのみ対象、仮想カードはドラッグ不可)
  const handleDrop = async (targetId) => {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    const realRows = rows.filter(r => !r.virtual);
    const fromIdx = realRows.findIndex(r => r.id === draggingId);
    const toIdx = realRows.findIndex(r => r.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingId(null); setDragOverId(null); return; }
    const reordered = [...realRows];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // ローカル更新
    const orderedIds = reordered.map(r => r.id);
    setRows(prev => {
      const virtuals = prev.filter(r => r.virtual);
      const reorderedWithOrder = reordered.map((r, i) => ({ ...r, sort_order: (i + 1) * 1000 }));
      return [...virtuals, ...reorderedWithOrder];
    });
    setDraggingId(null);
    setDragOverId(null);
    // DB 反映
    await reorderClientMeetings(orderedIds);
  };

  if (!clientId) return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, letterSpacing: 0.5 }}>
          面談・議事録 ({rows.filter(r => !r.virtual).length})
        </div>
        <button onClick={handleAdd} disabled={adding} style={{
          padding: '6px 14px', background: color.navy, color: color.white,
          border: 'none', borderRadius: radius.md, fontSize: font.size.xs,
          fontWeight: font.weight.semibold, cursor: adding ? 'wait' : 'pointer',
          fontFamily: font.family.sans,
        }}>
          {adding ? '追加中…' : '+ 新規面談を追加'}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: font.size.xs, color: color.textMid, padding: space[2] }}>読み込み中…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {rows.map(m => {
            const isReal = !m.virtual;
            const isDragOver = dragOverId === m.id && draggingId && draggingId !== m.id;
            return (
              <div
                key={m.id}
                draggable={isReal}
                onDragStart={isReal ? (e) => {
                  setDraggingId(m.id);
                  e.dataTransfer.effectAllowed = 'move';
                } : undefined}
                onDragOver={isReal ? (e) => {
                  e.preventDefault();
                  if (dragOverId !== m.id) setDragOverId(m.id);
                } : undefined}
                onDragLeave={isReal ? () => { if (dragOverId === m.id) setDragOverId(null); } : undefined}
                onDrop={isReal ? (e) => { e.preventDefault(); handleDrop(m.id); } : undefined}
                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                style={{
                  opacity: draggingId === m.id ? 0.4 : 1,
                  transition: 'opacity 0.15s',
                  borderTop: isDragOver ? `2px solid ${color.navy}` : '2px solid transparent',
                }}
              >
                <MeetingCard
                  meeting={m} clientId={clientId}
                  draggable={isReal}
                  onMaterialize={materializeVirtual}
                  onChange={(updated) => setRows(prev => prev.map(x => x.id === updated.id ? { ...updated, _cat: x._cat } : x))}
                  onDelete={() => setRows(prev => prev.filter(x => x.id !== m.id))}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting, clientId, onChange, onDelete, onMaterialize, draggable = false }) {
  const isVirtual = !!meeting.virtual;
  const [title, setTitle] = useState(meeting.title || '面談');
  const [meetingDate, setMeetingDate] = useState(isoToDateInput(meeting.meeting_at));
  const [summary, setSummary] = useState(meeting.summary || '');
  const [nextAction, setNextAction] = useState(meeting.next_action || '');
  const [recordingUrl, setRecordingUrl] = useState(meeting.recording_url || '');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(
    (meeting.summary || '').startsWith(ANALYZING_PREFIX)
  );
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);
  const lastSavedRef = useRef({
    title: meeting.title || '',
    meeting_at: meeting.meeting_at,
    summary: meeting.summary || '',
    next_action: meeting.next_action || '',
  });

  // IME safe inputs
  const titleIme = useImeSafeInput(title, setTitle);
  const summaryIme = useImeSafeInput(summary, setSummary);
  const nextActionIme = useImeSafeInput(nextAction, setNextAction);

  // 親から meeting prop が更新されたら反映 (AI解析完了時等)
  useEffect(() => {
    setTitle(meeting.title || '面談');
    setMeetingDate(isoToDateInput(meeting.meeting_at));
    setSummary(meeting.summary || '');
    setNextAction(meeting.next_action || '');
    setRecordingUrl(meeting.recording_url || '');
    lastSavedRef.current = {
      title: meeting.title || '',
      meeting_at: meeting.meeting_at,
      summary: meeting.summary || '',
      next_action: meeting.next_action || '',
    };
  }, [meeting.id, meeting.updated_at]);

  // 自動保存 (debounce 1秒)
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const meetingAtIso = dateInputToIso(meetingDate);
      const patch = {};
      if (title !== lastSavedRef.current.title) patch.title = title;
      if (meetingAtIso !== lastSavedRef.current.meeting_at) patch.meeting_at = meetingAtIso;
      if (summary !== lastSavedRef.current.summary) patch.summary = summary;
      if (nextAction !== lastSavedRef.current.next_action) patch.next_action = nextAction;
      if (Object.keys(patch).length === 0) return;
      // 仮想カード → 中身が入った時点で実DBレコードに昇格
      if (isVirtual) {
        const onlyTextEmpty = !summary.trim() && !nextAction.trim();
        if (onlyTextEmpty && title === meeting.title) return;
        const real = await onMaterialize?.(meeting, { title, meetingAt: meetingAtIso });
        if (!real) return;
        await updateClientMeeting(real.id, patch);
        lastSavedRef.current = { ...lastSavedRef.current, ...patch };
        return;
      }
      await updateClientMeeting(meeting.id, patch);
      lastSavedRef.current = {
        ...lastSavedRef.current, ...patch,
      };
    }, 1000);
  }, [title, meetingDate, summary, nextAction, meeting.id, isVirtual, meeting, onMaterialize]);

  useEffect(() => { scheduleSave(); return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, [scheduleSave]);

  // AI 解析中ポーリング (summary が完了形になるまで 3秒毎、最大10分)
  useEffect(() => {
    if (!analyzing) return;
    let cancelled = false;
    const pollUntil = Date.now() + 10 * 60 * 1000;
    const tick = async () => {
      if (cancelled) return;
      const { data } = await fetchClientMeetings(clientId);
      const updated = (data || []).find(x => x.id === meeting.id);
      if (!updated) return;
      const s = updated.summary || '';
      if (!s.startsWith(ANALYZING_PREFIX)) {
        setAnalyzing(false);
        onChange(updated);
        return;
      }
      if (Date.now() < pollUntil) setTimeout(tick, 3000);
      else { setAnalyzing(false); }
    };
    const t = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [analyzing, clientId, meeting.id, onChange]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    // 仮想カードの場合は先に実DBレコードに昇格
    let meetingId = meeting.id;
    if (isVirtual) {
      const real = await onMaterialize?.(meeting, { title, meetingAt: dateInputToIso(meetingDate) });
      if (!real) { setUploading(false); return; }
      meetingId = real.id;
    }
    const { url, error } = await uploadMeetingRecording({ clientId, meetingId, file });
    if (error || !url) {
      setUploading(false);
      alert('アップロード失敗: ' + (error?.message || ''));
      return;
    }
    setRecordingUrl(url);
    await updateClientMeeting(meetingId, { recording_url: url });
    // AI解析開始
    setSummary(`${ANALYZING_PREFIX}... 1〜2分お待ちください]`);
    setAnalyzing(true);
    const { error: aiErr } = await invokeSummarizeMeetingRecording({ meetingId, recordingUrl: url });
    setUploading(false);
    if (aiErr) {
      alert('AI解析の起動に失敗: ' + (aiErr.message || ''));
      setAnalyzing(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (isVirtual) {
      // 仮想カードは削除不可（リセットは中身を空にする）
      setSummary(''); setNextAction(''); setRecordingUrl('');
      return;
    }
    if (!window.confirm(`この面談記録「${title || '無題'}」を削除しますか?`)) return;
    const { error } = await deleteClientMeeting(meeting.id);
    if (error) { alert('削除失敗: ' + error.message); return; }
    onDelete();
  };

  const hasError = (summary || '').startsWith(ERROR_PREFIX);

  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`,
      borderLeft: `3px solid ${analyzing ? color.warn : hasError ? color.danger : isVirtual ? color.borderLight : color.navy}`,
      borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px`,
    }}>
      {/* ヘッダ: ドラッグハンドル + タイトル + 日付 + 削除 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
        {draggable && (
          <span
            title="ドラッグして並び替え"
            style={{
              cursor: 'grab', color: color.textLight, fontSize: 14,
              padding: '0 2px', userSelect: 'none', lineHeight: 1,
            }}
          >⋮⋮</span>
        )}
        <input
          type="text" value={titleIme.value}
          onChange={titleIme.onChange}
          onCompositionStart={titleIme.onCompositionStart}
          onCompositionEnd={titleIme.onCompositionEnd}
          placeholder="タイトル (例: 6月定例)"
          title="クリックして編集"
          style={{
            flex: 1, padding: '4px 8px',
            border: `1px dashed ${color.border}`, borderRadius: radius.sm,
            fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy,
            fontFamily: font.family.sans, outline: 'none',
            background: 'transparent', cursor: 'text',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { if (document.activeElement !== e.target) e.target.style.background = color.gray50; }}
          onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.background = 'transparent'; }}
          onFocus={e => {
            e.target.style.borderColor = color.navy;
            e.target.style.borderStyle = 'solid';
            e.target.style.background = color.white;
          }}
          onBlur={e => {
            e.target.style.borderColor = color.border;
            e.target.style.borderStyle = 'dashed';
            e.target.style.background = 'transparent';
          }}
        />
        <input
          type="date" value={meetingDate}
          onChange={e => setMeetingDate(e.target.value)}
          style={{
            padding: '4px 6px', border: `1px solid ${color.border}`,
            borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.mono,
            color: color.textDark, outline: 'none',
          }}
        />
        {!isVirtual && (
          <button onClick={handleDelete} title="削除" style={{
            background: 'none', border: 'none', color: color.danger, cursor: 'pointer',
            fontSize: font.size.sm, padding: '4px 6px',
          }}>✕</button>
        )}
      </div>

      {/* 録音アップロード行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || analyzing} style={{
          padding: '4px 12px', background: color.white, color: color.navy,
          border: `1px solid ${color.navy}`, borderRadius: radius.sm,
          fontSize: font.size.xs, fontWeight: font.weight.semibold,
          cursor: uploading || analyzing ? 'wait' : 'pointer', fontFamily: font.family.sans,
        }}>
          {uploading ? 'アップロード中…' : analyzing ? 'AI解析中…' : recordingUrl ? '🎙 別の録音をアップロード' : '🎙 録音をアップロード'}
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*,video/*" onChange={handleUpload} style={{ display: 'none' }} />
        {recordingUrl && (
          <a href={recordingUrl} target="_blank" rel="noreferrer" style={{
            fontSize: font.size.xs, color: color.navy, textDecoration: 'underline',
          }}>録音を開く</a>
        )}
        {analyzing && (
          <span style={{ fontSize: font.size.xs, color: color.warn }}>
            (Whisper + Claude で要約生成中…)
          </span>
        )}
      </div>

      {/* 概要 + Next Action を横並びでコンパクトに */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: 2 }}>
            概要
          </div>
          <textarea
            value={summaryIme.value}
            onChange={summaryIme.onChange}
            onCompositionStart={summaryIme.onCompositionStart}
            onCompositionEnd={summaryIme.onCompositionEnd}
            rows={5}
            placeholder="面談の概要…"
            style={{
              width: '100%', padding: '4px 8px', border: `1px solid ${color.border}`,
              borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.sans,
              color: color.textDark, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              lineHeight: 1.5, background: color.white,
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: 2 }}>
            Next Action
          </div>
          <textarea
            value={nextActionIme.value}
            onChange={nextActionIme.onChange}
            onCompositionStart={nextActionIme.onCompositionStart}
            onCompositionEnd={nextActionIme.onCompositionEnd}
            rows={5}
            placeholder="次のアクション…"
            style={{
              width: '100%', padding: '4px 8px', border: `1px solid ${color.border}`,
              borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.sans,
              color: color.textDark, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              lineHeight: 1.5, background: color.white,
            }}
          />
        </div>
      </div>
    </div>
  );
}
