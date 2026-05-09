import { useState, useEffect, useRef, useMemo } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Card, Badge } from '../ui';
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

// このビュー独自のレガシーカード色（既存の見た目を維持）
const CARD_COLOR = '#1F3B6B';
const LEGACY_NAVY = '#0D2247';

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

  const ACTIVE_CARD_KEY = 'spanavi_library_active_card_v1';
  const [activeCardId, _setActiveCardId] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_CARD_KEY);
      return saved && DEFAULT_ORDER.includes(saved) ? saved : null;
    } catch { return null; }
  });
  const setActiveCardId = (id) => {
    _setActiveCardId(id);
    try {
      if (id) localStorage.setItem(ACTIVE_CARD_KEY, id);
      else localStorage.removeItem(ACTIVE_CARD_KEY);
    } catch { /* ignore */ }
  };

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
        style={{ marginBottom: space[5] }}
      />

      {/* カードグリッド（本棚） */}
      {!activeCardId && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <div style={{
              display: 'grid', gap: space[4],
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              padding: `4px 0 ${space[6]}px`,
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
        <Card padding="none" style={{ padding: '14px 18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2.5], marginBottom: 14 }}>
              <Button size="sm" variant="outline" onClick={() => setActiveCardId(null)}>
                ← Library に戻る
              </Button>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
                {CARDS[activeCardId].title}
              </div>
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
                  <div key={b.id} style={{
                    borderTop: idx === 0 ? 'none' : `1px solid ${color.borderLight}`,
                    padding: `${space[2.5]}px 0`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space[3], fontSize: font.size.sm }}>
                      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                        <div style={{
                          fontWeight: font.weight.bold, color: LEGACY_NAVY,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {b.company_name || '—'}
                        </div>
                        <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>
                          {b.getter_name || '—'} ・ {(b.created_at || '').slice(0, 10)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isPlaying ? 'primary' : 'outline'}
                        onClick={() => setBookmarkPlayingId(isPlaying ? null : b.id)}
                        style={{ borderColor: LEGACY_NAVY, color: isPlaying ? color.white : LEGACY_NAVY, background: isPlaying ? LEGACY_NAVY : color.white }}
                      >
                        {isPlaying ? '■ 停止' : '▶ 再生'}
                      </Button>
                      <button onClick={() => handleRemoveBookmark(b.id)} title="ブックマーク解除"
                        style={{
                          padding: `${space[1.5]}px ${space[2.5]}px`,
                          borderRadius: radius.md, border: `1px solid ${color.gray200}`,
                          background: color.white, cursor: 'pointer',
                          fontSize: font.size.md, color: '#F59E0B',
                        }}>★</button>
                    </div>
                    {isPlaying && <InlineAudioPlayer url={b.recording_url} onClose={() => setBookmarkPlayingId(null)} />}
                  </div>
                );
              })
            )}

            {activeCardId === 'meetings' && (
              <>
                {isAdmin && <MeetingUploader currentUser={currentUser} onUploaded={refreshMeetings} isAdmin={isAdmin} />}
                {wmLoading ? <Empty>読み込み中…</Empty>
                  : weeklyMeetings.length === 0 ? <Empty>動画はまだアップロードされていません。</Empty>
                  : weeklyMeetings.map((m, idx) => {
                    const isPlaying = meetingPlayingId === m.id;
                    const isEditing = editingMeetingId === m.id;
                    return (
                      <div key={m.id} style={{
                        borderTop: idx === 0 && !isAdmin ? 'none' : `1px solid ${color.borderLight}`,
                        padding: `${space[3]}px 0`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
                                <Input
                                  size="sm"
                                  value={editTitle}
                                  onChange={e => setEditTitle(e.target.value)}
                                  placeholder="タイトル"
                                  style={{ fontWeight: font.weight.bold, color: color.navy }}
                                />
                                <Input
                                  size="sm"
                                  type="date"
                                  value={editDate}
                                  onChange={e => setEditDate(e.target.value)}
                                  containerStyle={{ width: 160 }}
                                />
                              </div>
                            ) : (
                              <>
                                <div style={{
                                  fontWeight: font.weight.bold, color: color.navy,
                                  fontSize: font.size.base,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>{m.title}</div>
                                <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>
                                  {m.meeting_date || m.created_at?.slice(0, 10) || ''}
                                  {m.uploaded_by_name ? ` ・ ${m.uploaded_by_name}` : ''}
                                  {m.size_bytes ? ` ・ ${Math.round(m.size_bytes / 1024 / 1024)}MB` : ''}
                                </div>
                              </>
                            )}
                          </div>
                          {isEditing ? (
                            <>
                              <Button size="sm" onClick={saveEdit}>保存</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingMeetingId(null)}>キャンセル</Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant={isPlaying ? 'primary' : 'outline'}
                                onClick={() => setMeetingPlayingId(isPlaying ? null : m.id)}
                                style={{ borderColor: LEGACY_NAVY, color: isPlaying ? color.white : LEGACY_NAVY, background: isPlaying ? LEGACY_NAVY : color.white }}
                              >
                                {isPlaying ? '■ 停止' : '▶ 再生'}
                              </Button>
                              {m.public_url && (
                                <a href={m.public_url} target="_blank" rel="noopener noreferrer" title="Google Driveで開く"
                                  style={{
                                    padding: `${space[1.5]}px ${space[2.5]}px`,
                                    borderRadius: radius.md, border: `1px solid ${color.border}`,
                                    background: color.white, color: color.navy, cursor: 'pointer',
                                    fontSize: font.size.xs, fontWeight: font.weight.semibold,
                                    fontFamily: font.family.sans, textDecoration: 'none',
                                    display: 'inline-flex', alignItems: 'center',
                                  }}>↗ Drive</a>
                              )}
                              {isAdmin && <Button size="sm" variant="outline" onClick={() => startEdit(m)} title="編集">✎ 編集</Button>}
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteMeeting(m)}
                                  title="削除"
                                  style={{ color: color.danger }}
                                >削除</Button>
                              )}
                            </>
                          )}
                        </div>
                        {isPlaying && (
                          <div style={{ marginTop: space[2.5] }}>
                            {m.stream_uid && CF_STREAM_SUBDOMAIN ? (
                              m.stream_ready ? (
                                <div style={{ maxWidth: 960, margin: '0 auto' }}>
                                  <div style={{
                                    position: 'relative', width: '100%', paddingTop: '56.25%',
                                    borderRadius: radius.md, overflow: 'hidden', background: '#000',
                                  }}>
                                    <iframe
                                      src={`https://${CF_STREAM_SUBDOMAIN}.cloudflarestream.com/${m.stream_uid}/iframe?poster=https%3A%2F%2F${CF_STREAM_SUBDOMAIN}.cloudflarestream.com%2F${m.stream_uid}%2Fthumbnails%2Fthumbnail.jpg`}
                                      title={m.title} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen
                                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} />
                                  </div>
                                </div>
                              ) : (
                                <div style={{
                                  width: '100%', height: 240, borderRadius: radius.md,
                                  background: LEGACY_NAVY,
                                  display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', justifyContent: 'center',
                                  color: color.white, gap: space[1.5],
                                }}>
                                  <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold }}>処理中…</div>
                                  <div style={{ fontSize: font.size.xs, color: color.goldLight }}>Cloudflare Stream でストリーミング変換中です（通常 1〜2分で完了）</div>
                                </div>
                              )
                            ) : m.drive_file_id ? (
                              <iframe src={`https://drive.google.com/file/d/${m.drive_file_id}/preview`} title={m.title} allow="autoplay; fullscreen" allowFullScreen
                                style={{ width: '100%', height: 480, borderRadius: radius.md, background: '#000', border: 'none' }} />
                            ) : (
                              <video src={m.public_url} controls style={{ width: '100%', maxHeight: 480, borderRadius: radius.md, background: '#000' }} />
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
        </Card>
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
        background: meta.accent, color: color.white,
        borderRadius: radius.lg, overflow: 'hidden',
        boxShadow: shadow.sm,
        position: 'relative',
        aspectRatio: '4 / 3',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: `${space[4]}px ${space[4] + 2}px`,
        userSelect: 'none',
      }}
      onClick={() => onOpen()}
    >
      <div
        {...attributes} {...listeners}
        onClick={e => e.stopPropagation()}
        title="ドラッグして並び替え"
        style={{
          position: 'absolute', top: space[2], right: space[2],
          width: 22, height: 22, borderRadius: radius.md,
          color: alpha(color.white, 0.55), cursor: 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: font.size.md,
        }}
      >⋮⋮</div>

      <div>
        <div style={{
          fontSize: 9.5, fontWeight: font.weight.semibold,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: alpha(color.white, 0.65),
        }}>
          {meta.eyebrow}
        </div>
        <div style={{ fontSize: 18, fontWeight: font.weight.bold, marginTop: space[1.5], lineHeight: 1.3 }}>
          {meta.title}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: alpha(color.white, 0.7) }}>
        {count != null ? `${count} 件` : '開く →'}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      padding: space[4], textAlign: 'center',
      color: color.textLight, fontSize: font.size.sm,
    }}>{children}</div>
  );
}

// ────────────────────────────────────────────────────────────
// 週次ミーティング動画アップロード
// ────────────────────────────────────────────────────────────
function MeetingUploader({ currentUser, onUploaded, isAdmin }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const inputRef = useRef(null);

  // Cloudflare Stream の未完了アップロードを一括削除して容量を解放
  const runCleanup = async () => {
    if (!confirm('未完了のアップロード残骸 (pendingupload状態) を全削除します。業務動画には影響しません。実行しますか?')) return;
    setCleanupRunning(true);
    setCleanupResult(null);
    try {
      const { supabase } = await import('../../lib/supabase');
      // まず現状確認
      const { data: stats } = await supabase.functions.invoke('cf-stream', { body: { mode: 'list_stats' } });
      // 削除実行
      const { data: result, error } = await supabase.functions.invoke('cf-stream', { body: { mode: 'force_cleanup_pending' } });
      if (error) {
        setCleanupResult({ ok: false, message: error.message || String(error) });
      } else if (result?.error) {
        setCleanupResult({ ok: false, message: result.error });
      } else {
        setCleanupResult({
          ok: true,
          stats,
          result,
          message: `削除完了: ${result?.deleted || 0} 件 / 検出 ${result?.found || 0} 件 (失敗 ${result?.failed || 0})`,
        });
      }
    } catch (e) {
      setCleanupResult({ ok: false, message: String(e) });
    } finally {
      setCleanupRunning(false);
    }
  };

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
    <div style={{ marginBottom: space[4] }}>
      {/* 管理者向け: Cloudflare Stream 容量整理 */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: space[2], marginBottom: space[2], flexWrap: 'wrap' }}>
          {cleanupResult && (
            <span style={{
              fontSize: font.size.xs,
              color: cleanupResult.ok ? color.success : color.danger,
              fontWeight: font.weight.semibold,
            }}>
              {cleanupResult.message}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={runCleanup} loading={cleanupRunning}>
            未完了アップロード整理
          </Button>
        </div>
      )}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? color.gold : color.border}`,
          background: dragOver ? '#FFFBEB' : '#F8F9FA',
          borderRadius: radius.lg, padding: space[5],
          textAlign: 'center', cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: font.size.sm, color: color.navy, fontWeight: font.weight.semibold }}>
          {selectedFile ? `選択中: ${selectedFile.name} (${Math.round(selectedFile.size / 1024 / 1024)}MB)` : '動画ファイルを選択'}
        </div>
        <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => pickFile(e.target.files?.[0])} />
      </div>
      {selectedFile && (
        <div style={{ display: 'flex', gap: space[2.5], alignItems: 'center', marginTop: space[3], flexWrap: 'wrap' }}>
          <Input
            size="sm"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="タイトル"
            containerStyle={{ flex: '1 1 240px' }}
          />
          <Input
            size="sm"
            type="date"
            value={meetingDate}
            onChange={e => setMeetingDate(e.target.value)}
            fullWidth={false}
          />
          <Button onClick={doUpload} loading={uploading} disabled={!title.trim()}>
            {uploading ? `アップロード中… ${uploadPct}%` : 'アップロード'}
          </Button>
          <Button
            variant="outline"
            onClick={() => { setSelectedFile(null); setTitle(''); setMeetingDate(''); setError(''); }}
            disabled={uploading}
          >キャンセル</Button>
        </div>
      )}
      {error && <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>{error}</div>}
    </div>
  );
}
