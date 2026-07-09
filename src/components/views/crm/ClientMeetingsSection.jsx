import { useState, useEffect, useRef, useCallback } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import {
  fetchClientMeetings, insertClientMeeting, updateClientMeeting,
  deleteClientMeeting, reorderClientMeetings,
} from '../../../lib/supabaseWrite';
import { useImeSafeInput } from '../../../lib/useImeSafe';


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

  // 一覧取得: 不足分の DEFAULT_TITLES 3枠は即時 INSERT して全カードを実DB行で揃える
  const reload = useCallback(async () => {
    if (!clientId) return;
    const { data } = await fetchClientMeetings(clientId);
    const list = data || [];
    const tagged = list.map(r => ({ ...r, _cat: matchDefaultCategory(r.title) }));
    const present = new Set(tagged.map(r => r._cat).filter(Boolean));
    const missing = DEFAULT_TITLES.filter(t => !present.has(t));
    let merged = tagged;
    if (missing.length > 0) {
      const inserted = [];
      for (let i = 0; i < missing.length; i++) {
        const title = missing[i];
        const { data: row } = await insertClientMeeting({
          clientId, title, meetingAt: new Date().toISOString(), createdBy: currentUser,
        });
        if (row) {
          // 先頭3枠の初期 sort_order を 1,2,3 として確保
          const so = DEFAULT_TITLES.indexOf(title) + 1;
          await updateClientMeeting(row.id, { sort_order: so });
          inserted.push({ ...row, sort_order: so, _cat: title });
        }
      }
      merged = [...tagged, ...inserted];
    }
    // sort_order 昇順で表示(=ドラッグ並び替え結果が保存・反映される)。
    // 初期状態のデフォルト順(初回1/キックオフ2/定期3)は INSERT 時の
    // sort_order と既存データの正規化で担保する。null は末尾→meeting_at 昇順。
    merged.sort((a, b) => {
      const sa = a.sort_order, sb = b.sort_order;
      if (sa != null && sb != null) return sa - sb;
      if (sa != null) return -1;
      if (sb != null) return 1;
      return new Date(a.meeting_at || 0) - new Date(b.meeting_at || 0);
    });
    setRows(merged);
    setLoading(false);
  }, [clientId, currentUser]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    // 末尾に追加するため、現在の最大 sort_order + 1000
    const maxOrder = Math.max(0, ...rows.map(r => Number(r.sort_order || 0)));
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

  // ドラッグ並び替え
  const handleDrop = async (targetId) => {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    const fromIdx = rows.findIndex(r => r.id === draggingId);
    const toIdx = rows.findIndex(r => r.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingId(null); setDragOverId(null); return; }
    const reordered = [...rows];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const orderedIds = reordered.map(r => r.id);
    setRows(reordered.map((r, i) => ({ ...r, sort_order: (i + 1) * 1000 })));
    setDraggingId(null);
    setDragOverId(null);
    await reorderClientMeetings(orderedIds);
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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {rows.map(m => {
            const isDragOver = dragOverId === m.id && draggingId && draggingId !== m.id;
            return (
              <div
                key={m.id}
                draggable
                onDragStart={(e) => {
                  setDraggingId(m.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverId !== m.id) setDragOverId(m.id);
                }}
                onDragLeave={() => { if (dragOverId === m.id) setDragOverId(null); }}
                onDrop={(e) => { e.preventDefault(); handleDrop(m.id); }}
                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                style={{
                  opacity: draggingId === m.id ? 0.4 : 1,
                  transition: 'opacity 0.15s',
                  borderTop: isDragOver ? `2px solid ${color.navy}` : '2px solid transparent',
                }}
              >
                <MeetingCard
                  meeting={m} clientId={clientId}
                  draggable
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

function MeetingCard({ meeting, clientId, onChange, onDelete, draggable = false }) {
  const [title, setTitle] = useState(meeting.title || '面談');
  const [meetingDate, setMeetingDate] = useState(isoToDateInput(meeting.meeting_at));
  const [summary, setSummary] = useState(meeting.summary || '');
  const [nextAction, setNextAction] = useState(meeting.next_action || '');
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

  // 親から meeting prop が更新されたら反映
  useEffect(() => {
    setTitle(meeting.title || '面談');
    setMeetingDate(isoToDateInput(meeting.meeting_at));
    setSummary(meeting.summary || '');
    setNextAction(meeting.next_action || '');
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

  const handleDelete = async () => {
    if (!window.confirm(`この面談記録「${title || '無題'}」を削除しますか?`)) return;
    const { error } = await deleteClientMeeting(meeting.id);
    if (error) { alert('削除失敗: ' + error.message); return; }
    onDelete();
  };

  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`,
      borderLeft: `3px solid ${color.navy}`,
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
        <button onClick={handleDelete} title="削除" style={{
          background: 'none', border: 'none', color: color.danger, cursor: 'pointer',
          fontSize: font.size.sm, padding: '4px 6px',
        }}>✕</button>
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
            rows={12}
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
            rows={12}
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
