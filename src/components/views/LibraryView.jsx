import { useState, useEffect, useRef, useMemo } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { C } from '../../constants/colors';
import InternRulesView from './InternRulesView';
import ScriptView from './ScriptView';
import InlineAudioPlayer from '../common/InlineAudioPlayer';
import PageHeader from '../common/PageHeader';
import DailyReportPanel from './library/DailyReportPanel';
import {
  fetchRecordingBookmarks, deleteRecordingBookmark,
  fetchWeeklyMeetingVideos, uploadWeeklyMeetingVideo, deleteWeeklyMeetingVideo, updateWeeklyMeetingVideo,
  refreshWeeklyMeetingStatus,
} from '../../lib/supabaseWrite';

const CF_STREAM_SUBDOMAIN = import.meta.env.VITE_CF_STREAM_CUSTOMER_SUBDOMAIN || '';

const STORAGE_KEY = 'spanavi_library_card_order_v1';
const DEFAULT_ORDER = ['daily_report', 'bookmarks', 'rules', 'meetings', 'scripts'];

const CARD_COLOR = '#1F3B6B';
const CARDS = {
  daily_report: { title: 'Daily Report',         eyebrow: '本日の活動レポート', accent: CARD_COLOR },
  bookmarks:    { title: 'お気に入り録音',        eyebrow: '保存した録音',       accent: CARD_COLOR },
  rules:        { title: '22箇条',               eyebrow: 'インターン心得',     accent: CARD_COLOR },
  meetings:     { title: '週次ミーティング',     eyebrow: 'アーカイブ',         accent: CARD_COLOR },
  scripts:      { title: 'スクリプト一覧',       eyebrow: 'クライアント別',     accent: CARD_COLOR },
};

export default function LibraryView({
  currentUser, userId, members, isAdmin = false,
  clientData, callListData, setCallListData,
}) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(saved) && saved.length > 0) {
        // 不明 ID は除き、欠けている ID は末尾に追加
        const filtered = saved.filter(id => DEFAULT_ORDER.includes(id));
        for (const id of DEFAULT_ORDER) if (!filtered.includes(id)) filtered.push(id);
        return filtered;
      }
    } catch { /* ignore */ }
    return DEFAULT_ORDER;
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)); } catch { /* ignore */ }
  }, [order]);

  const [activeCardId, setActiveCardId] = useState(null);

  const [bookmarks, setBookmarks] = useState([]);
  const [bookmarkPlayingId, setBookmarkPlayingId] = useState(null);
  const [meetingPlayingId, setMeetingPlayingId] = useState(null);
  const [weeklyMeetings, setWeeklyMeetings] = useState([]);
  const [wmLoading, setWmLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    fetchRecordingBookmarks(currentUser).then(({ data }) => setBookmarks(data || []));
  }, [currentUser]);

  const refreshMeetings = async () => {
    setWmLoading(true);
    const { data } = await fetchWeeklyMeetingVideos();
    setWeeklyMeetings(data || []);
    setWmLoading(false);
    (data || []).filter(m => m.stream_uid && !m.stream_ready).forEach(m => pollStreamStatus(m.id, m.stream_uid));
  };
  useEffect(() => { refreshMeetings(); }, []);

  const pollStreamStatus = async (id, uid) => {
    for (let i = 0; i < 40; i++) {
      const { data } = await refreshWeeklyMeetingStatus(id, uid);
      if (data?.stream_ready) {
        setWeeklyMeetings(prev => prev.map(m => m.id === id ? {
          ...m, stream_ready: true, stream_thumbnail: data.stream_thumbnail, duration_sec: data.duration_sec,
        } : m));
        return;
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  };

  const handleRemoveBookmark = async (id) => {
    await deleteRecordingBookmark(id);
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  const handleDeleteMeeting = async (m) => {
    if (!window.confirm(`「${m.title}」を削除します。よろしいですか？`)) return;
    await deleteWeeklyMeetingVideo(m.id, { streamUid: m.stream_uid, storagePath: m.storage_path });
    refreshMeetings();
  };

  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const startEdit = (m) => { setEditingMeetingId(m.id); setEditTitle(m.title || ''); setEditDate(m.meeting_date || ''); };
  const saveEdit = async () => {
    await updateWeeklyMeetingVideo(editingMeetingId, { title: editTitle.trim() || null, meeting_date: editDate || null });
    setEditingMeetingId(null);
    refreshMeetings();
  };

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(active.id);
    const newIdx = order.indexOf(over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    setOrder(arrayMove(order, oldIdx, newIdx));
  };

  const counts = useMemo(() => ({
    bookmarks: bookmarks.length,
    meetings: weeklyMeetings.length,
  }), [bookmarks, weeklyMeetings]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="Library"
        description="営業ナレッジの統合アーカイブ"
        style={{ marginBottom: 20 }}
      />

      {/* カードグリッド（本棚） */}
      {!activeCardId && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <div style={{
              display: 'grid', gap: 16,
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              padding: '4px 0 24px',
            }}>
              {order.map(id => (
                <BookCard
                  key={id} id={id} meta={CARDS[id]}
                  count={counts[id]}
                  onOpen={() => setActiveCardId(id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 詳細ビュー */}
      {activeCardId && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <button
              onClick={() => setActiveCardId(null)}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                background: C.white, color: C.navy, border: `1px solid ${C.border}`, borderRadius: 3,
                cursor: 'pointer',
              }}
            >← Library に戻る</button>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{CARDS[activeCardId].title}</div>
          </div>

          {activeCardId === 'daily_report' && (
            <DailyReportPanel currentUser={currentUser} userId={userId} isAdmin={isAdmin} members={members} />
          )}

          {activeCardId === 'rules' && <InternRulesView embedded />}

          {activeCardId === 'bookmarks' && (
            bookmarks.length === 0 ? (
              <Empty>ブックマークはまだありません。Search → 録音一覧 から追加できます。</Empty>
            ) : bookmarks.map((b, idx) => {
              const isPlaying = bookmarkPlayingId === b.id;
              return (
                <div key={b.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #F0F0F0', padding: '10px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0D2247', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.company_name || '—'}
                      </div>
                      <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>
                        {b.getter_name || '—'} ・ {(b.created_at || '').slice(0, 10)}
                      </div>
                    </div>
                    <button onClick={() => setBookmarkPlayingId(isPlaying ? null : b.id)}
                      style={btnPrimary(isPlaying)}>{isPlaying ? '■ 停止' : '▶ 再生'}</button>
                    <button onClick={() => handleRemoveBookmark(b.id)} title="ブックマーク解除"
                      style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#F59E0B' }}>★</button>
                  </div>
                  {isPlaying && <InlineAudioPlayer url={b.recording_url} onClose={() => setBookmarkPlayingId(null)} />}
                </div>
              );
            })
          )}

          {activeCardId === 'meetings' && (
            <>
              {isAdmin && <MeetingUploader currentUser={currentUser} onUploaded={refreshMeetings} />}
              {wmLoading ? <Empty>読み込み中…</Empty>
                : weeklyMeetings.length === 0 ? <Empty>動画はまだアップロードされていません。</Empty>
                : weeklyMeetings.map((m, idx) => {
                  const isPlaying = meetingPlayingId === m.id;
                  const isEditing = editingMeetingId === m.id;
                  return (
                    <div key={m.id} style={{ borderTop: idx === 0 && !isAdmin ? 'none' : '1px solid #F0F0F0', padding: '12px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="タイトル"
                                style={{ padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, fontWeight: 700, color: C.navy }} />
                              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                                style={{ padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, width: 160 }} />
                            </div>
                          ) : (
                            <>
                              <div style={{ fontWeight: 700, color: C.navy, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                              <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>
                                {m.meeting_date || m.created_at?.slice(0, 10) || ''}
                                {m.uploaded_by_name ? ` ・ ${m.uploaded_by_name}` : ''}
                                {m.size_bytes ? ` ・ ${Math.round(m.size_bytes / 1024 / 1024)}MB` : ''}
                              </div>
                            </>
                          )}
                        </div>
                        {isEditing ? (
                          <>
                            <button onClick={saveEdit} style={btnPrimary(true)}>保存</button>
                            <button onClick={() => setEditingMeetingId(null)} style={btnSecondary}>キャンセル</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setMeetingPlayingId(isPlaying ? null : m.id)} style={btnPrimary(isPlaying)}>
                              {isPlaying ? '■ 停止' : '▶ 再生'}
                            </button>
                            {m.public_url && (
                              <a href={m.public_url} target="_blank" rel="noopener noreferrer" title="Google Driveで開く" style={{ ...btnSecondary, textDecoration: 'none' }}>↗ Drive</a>
                            )}
                            {isAdmin && <button onClick={() => startEdit(m)} title="編集" style={btnSecondary}>✎ 編集</button>}
                            {isAdmin && <button onClick={() => handleDeleteMeeting(m)} title="削除"
                              style={{ ...btnSecondary, color: '#DC2626' }}>削除</button>}
                          </>
                        )}
                      </div>
                      {isPlaying && (
                        <div style={{ marginTop: 10 }}>
                          {m.stream_uid && CF_STREAM_SUBDOMAIN ? (
                            m.stream_ready ? (
                              <div style={{ maxWidth: 960, margin: '0 auto' }}>
                                <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 4, overflow: 'hidden', background: '#000' }}>
                                  <iframe
                                    src={`https://${CF_STREAM_SUBDOMAIN}.cloudflarestream.com/${m.stream_uid}/iframe?poster=https%3A%2F%2F${CF_STREAM_SUBDOMAIN}.cloudflarestream.com%2F${m.stream_uid}%2Fthumbnails%2Fthumbnail.jpg`}
                                    title={m.title} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} />
                                </div>
                              </div>
                            ) : (
                              <div style={{ width: '100%', height: 240, borderRadius: 4, background: '#0D2247', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.white, gap: 6 }}>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>処理中…</div>
                                <div style={{ fontSize: 11, color: C.goldLight }}>Cloudflare Stream でストリーミング変換中です（通常 1〜2分で完了）</div>
                              </div>
                            )
                          ) : m.drive_file_id ? (
                            <iframe src={`https://drive.google.com/file/d/${m.drive_file_id}/preview`} title={m.title} allow="autoplay; fullscreen" allowFullScreen
                              style={{ width: '100%', height: 480, borderRadius: 4, background: '#000', border: 'none' }} />
                          ) : (
                            <video src={m.public_url} controls style={{ width: '100%', maxHeight: 480, borderRadius: 4, background: '#000' }} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
          )}

          {activeCardId === 'scripts' && (
            <ScriptView isAdmin={isAdmin} clientData={clientData} callListData={callListData} setCallListData={setCallListData} embedded />
          )}
        </div>
      )}
    </div>
  );
}

function BookCard({ id, meta, count, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'pointer',
  };
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: meta.accent, color: C.white,
        borderRadius: 6, overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        position: 'relative',
        aspectRatio: '4 / 3',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '16px 18px',
        userSelect: 'none',
      }}
      onClick={() => onOpen()}
    >
      <div
        {...attributes} {...listeners}
        onClick={e => e.stopPropagation()}
        title="ドラッグして並び替え"
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 22, height: 22, borderRadius: 4,
          color: 'rgba(255,255,255,0.55)', cursor: 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
        }}
      >⋮⋮</div>

      <div>
        <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>
          {meta.eyebrow}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6, lineHeight: 1.3 }}>
          {meta.title}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)' }}>
        {count != null ? `${count} 件` : '開く →'}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>{children}</div>;
}

const btnPrimary = (active) => ({
  padding: '6px 12px', borderRadius: 4, border: '1px solid #0D2247',
  background: active ? '#0D2247' : '#fff', color: active ? '#fff' : '#0D2247',
  cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
});
const btnSecondary = {
  padding: '6px 10px', borderRadius: 4, border: `1px solid ${C.border}`,
  background: '#fff', color: C.navy, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
};

// ────────────────────────────────────────────────────────────
// 週次ミーティング動画アップロード
// ────────────────────────────────────────────────────────────
function MeetingUploader({ currentUser, onUploaded }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const pickFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError('動画ファイルのみアップロードできます'); return; }
    setError('');
    setSelectedFile(file);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    if (!meetingDate) {
      const d = new Date();
      setMeetingDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  };
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  };
  const doUpload = async () => {
    if (!selectedFile) return;
    setUploading(true); setUploadPct(0); setError('');
    const { data, error } = await uploadWeeklyMeetingVideo({
      file: selectedFile, title: title || selectedFile.name, meetingDate: meetingDate || null,
      uploadedByName: currentUser || null,
      onProgress: (uploaded, total) => { if (total > 0) setUploadPct(Math.round((uploaded / total) * 100)); },
    });
    setUploading(false); setUploadPct(0);
    if (error) { setError(typeof error === 'string' ? error : (error.message || 'アップロードに失敗しました')); return; }
    setSelectedFile(null); setTitle(''); setMeetingDate('');
    onUploaded?.(data);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? C.gold : C.border}`,
          background: dragOver ? '#FFFBEB' : '#F8F9FA',
          borderRadius: 6, padding: '20px', textAlign: 'center', cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 12, color: C.navy, fontWeight: 600 }}>
          {selectedFile ? `選択中: ${selectedFile.name} (${Math.round(selectedFile.size / 1024 / 1024)}MB)` : '動画ファイルを選択'}
        </div>
        <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => pickFile(e.target.files?.[0])} />
      </div>
      {selectedFile && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル" style={{ flex: '1 1 240px', padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12 }} />
          <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} style={{ padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12 }} />
          <button onClick={doUpload} disabled={uploading || !title.trim()} style={{ padding: '7px 18px', fontSize: 12, fontWeight: 600, background: uploading ? C.textLight : C.navy, color: C.white, border: 'none', borderRadius: 4, cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? `アップロード中… ${uploadPct}%` : 'アップロード'}
          </button>
          <button onClick={() => { setSelectedFile(null); setTitle(''); setMeetingDate(''); setError(''); }} disabled={uploading} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer' }}>キャンセル</button>
        </div>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
