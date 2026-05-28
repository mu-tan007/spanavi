import { useState, useEffect, useRef, useCallback } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import {
  fetchClientMeetings, insertClientMeeting, updateClientMeeting,
  deleteClientMeeting, uploadMeetingRecording, invokeSummarizeMeetingRecording,
} from '../../../lib/supabaseWrite';
import { useImeSafeInput } from '../../../lib/useImeSafe';

// AI解析の進行中マーカー (DB側 summary が このプレフィックスの間ポーリング)
const ANALYZING_PREFIX = '[AI解析中';
const ERROR_PREFIX = '[AI解析エラー';

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

  // 一覧取得
  const reload = useCallback(async () => {
    if (!clientId) return;
    const { data } = await fetchClientMeetings(clientId);
    setRows(data || []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    const { data, error } = await insertClientMeeting({
      clientId, title: '面談', meetingAt: new Date().toISOString(), createdBy: currentUser,
    });
    setAdding(false);
    if (error) { alert('追加に失敗: ' + error.message); return; }
    setRows(prev => [data, ...prev]);
  };

  if (!clientId) return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, letterSpacing: 0.5 }}>
          面談・議事録 ({rows.length})
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
      ) : rows.length === 0 ? (
        <div style={{ fontSize: font.size.xs, color: color.textLight, padding: `${space[2]}px ${space[3]}px`, textAlign: 'center',
          background: color.gray50, borderRadius: radius.sm, border: `1px dashed ${color.border}` }}>
          面談記録なし — 「+ 新規面談を追加」で作成
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {rows.map(m => (
            <MeetingCard
              key={m.id} meeting={m} clientId={clientId}
              onChange={(updated) => setRows(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onDelete={() => setRows(prev => prev.filter(x => x.id !== m.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting, clientId, onChange, onDelete }) {
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
      await updateClientMeeting(meeting.id, patch);
      lastSavedRef.current = {
        ...lastSavedRef.current, ...patch,
      };
    }, 1000);
  }, [title, meetingDate, summary, nextAction, meeting.id]);

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
    const { url, error } = await uploadMeetingRecording({ clientId, meetingId: meeting.id, file });
    if (error || !url) {
      setUploading(false);
      alert('アップロード失敗: ' + (error?.message || ''));
      return;
    }
    setRecordingUrl(url);
    await updateClientMeeting(meeting.id, { recording_url: url });
    // AI解析開始
    setSummary(`${ANALYZING_PREFIX}... 1〜2分お待ちください]`);
    setAnalyzing(true);
    const { error: aiErr } = await invokeSummarizeMeetingRecording({ meetingId: meeting.id, recordingUrl: url });
    setUploading(false);
    if (aiErr) {
      alert('AI解析の起動に失敗: ' + (aiErr.message || ''));
      setAnalyzing(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (!window.confirm(`この面談記録「${title || '無題'}」を削除しますか?`)) return;
    const { error } = await deleteClientMeeting(meeting.id);
    if (error) { alert('削除失敗: ' + error.message); return; }
    onDelete();
  };

  const hasError = (summary || '').startsWith(ERROR_PREFIX);

  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`,
      borderLeft: `3px solid ${analyzing ? color.warn : hasError ? color.danger : color.navy}`,
      borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px`,
    }}>
      {/* ヘッダ: タイトル + 日付 + 削除 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
        <input
          type="text" value={titleIme.value}
          onChange={titleIme.onChange}
          onCompositionStart={titleIme.onCompositionStart}
          onCompositionEnd={titleIme.onCompositionEnd}
          placeholder="例: 6月定例 / キックオフ"
          style={{
            flex: 1, padding: '4px 8px', border: 'none', borderBottom: `1px solid transparent`,
            fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy,
            fontFamily: font.family.sans, outline: 'none',
            background: 'transparent',
          }}
          onFocus={e => e.target.style.borderBottomColor = color.navy}
          onBlur={e => e.target.style.borderBottomColor = 'transparent'}
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
        <button onClick={handleDelete} title="削除" style={{
          background: 'none', border: 'none', color: color.danger, cursor: 'pointer',
          fontSize: font.size.sm, padding: '4px 6px',
        }}>✕</button>
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
            rows={2}
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
            rows={2}
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
