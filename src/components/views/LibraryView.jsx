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
import InlineAudioPlayer from '../common/InlineAudioPlayer';
import PageHeader from '../common/PageHeader';
import DailyReportPanel from './library/DailyReportPanel';
import {
  fetchRecordingBookmarks, deleteRecordingBookmark,
  fetchWeeklyMeetingVideos, uploadWeeklyMeetingVideo, deleteWeeklyMeetingVideo, updateWeeklyMeetingVideo,
  refreshWeeklyMeetingStatus, setWeeklyMeetingDocument,
} from '../../lib/supabaseWrite';

const CF_STREAM_SUBDOMAIN = import.meta.env.VITE_CF_STREAM_CUSTOMER_SUBDOMAIN || '';

const STORAGE_KEY = 'spanavi_library_card_order_v1';
const DEFAULT_ORDER = ['daily_report', 'bookmarks', 'rules', 'meetings'];

const CARDS = {
  daily_report: { title: 'Daily Report',         eyebrow: '本日の活動レポート', accent: color.navy },
  bookmarks:    { title: 'お気に入り録音',        eyebrow: '保存した録音',       accent: color.navy },
  rules:        { title: '22箇条',               eyebrow: 'インターン心得',     accent: color.navy },
  meetings:     { title: '週次ミーティング',     eyebrow: 'アーカイブ',         accent: color.navy },
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
    await deleteWeeklyMeetingVideo(m.id, {
      streamUid: m.stream_uid, storagePath: m.storage_path, documentPath: m.document_path,
    });
    refreshMeetings();
  };

  // 資料ボタン。ある回はそのままPDFを開き、無い回はポップアップを出す
  // （行の下に出すと一覧の行が太るため・2026-08-21 むー様指示）
  const [docDialogMeeting, setDocDialogMeeting] = useState(null);
  const handleOpenDocument = (m) => {
    if (m.document_url) { window.open(m.document_url, '_blank', 'noopener,noreferrer'); return; }
    setDocDialogMeeting(m);
  };

  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  // 編集中の資料の扱い。新しいPDFを選んだか、今の資料を外すか
  const [editDocFile, setEditDocFile] = useState(null);
  const [editDocRemoved, setEditDocRemoved] = useState(false);
  const [editDocError, setEditDocError] = useState('');
  const startEdit = (m) => {
    setEditingMeetingId(m.id);
    setEditTitle(m.title || '');
    setEditDate(m.meeting_date || '');
    setEditDocFile(null); setEditDocRemoved(false); setEditDocError('');
  };
  const cancelEdit = () => {
    setEditingMeetingId(null);
    setEditDocFile(null); setEditDocRemoved(false); setEditDocError('');
  };
  const pickEditDoc = (file) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { setEditDocError('資料はPDFファイルのみ登録できます'); return; }
    setEditDocError(''); setEditDocRemoved(false); setEditDocFile(file);
  };
  const [editSaving, setEditSaving] = useState(false);
  const saveEdit = async () => {
    const target = weeklyMeetings.find(x => x.id === editingMeetingId);
    setEditSaving(true); setEditDocError('');
    const { data, error } = await updateWeeklyMeetingVideo(editingMeetingId, {
      title: editTitle.trim() || null, meeting_date: editDate || null,
    });
    // 更新権限がないと 0 行更新のまま成功したように見えるため、明示的に失敗を伝える
    if (error || !data) {
      setEditSaving(false);
      window.alert('保存できませんでした。更新権限がない可能性があります。');
      return;
    }
    if (editDocFile || editDocRemoved) {
      const r = await setWeeklyMeetingDocument(editingMeetingId, {
        file: editDocFile, remove: editDocRemoved, currentPath: target?.document_path || null,
      });
      if (r.error) {
        setEditSaving(false);
        setEditDocError('資料を保存できませんでした。タイトルと日付だけ保存されています。');
        return;
      }
    }
    setEditSaving(false);
    cancelEdit();
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
        title="ライブラリ"
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
                          fontWeight: font.weight.bold, color: color.navy,
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
                        style={{ borderColor: color.navy, color: isPlaying ? color.white : color.navy, background: isPlaying ? color.navy : color.white }}
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
                {isAdmin && <MeetingUploader currentUser={currentUser} onUploaded={refreshMeetings} />}
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
                                <EditDocumentField
                                  meeting={m}
                                  file={editDocFile}
                                  removed={editDocRemoved}
                                  disabled={editSaving}
                                  onPick={pickEditDoc}
                                  onUndo={() => { setEditDocFile(null); setEditDocRemoved(false); setEditDocError(''); }}
                                  onRemove={() => { setEditDocFile(null); setEditDocRemoved(true); setEditDocError(''); }}
                                />
                                {editDocError && (
                                  <div style={{ fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>
                                    {editDocError}
                                  </div>
                                )}
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
                                  {m.document_url ? ' ・ 資料あり' : ''}
                                </div>
                              </>
                            )}
                          </div>
                          {isEditing ? (
                            <>
                              <Button size="sm" onClick={saveEdit} loading={editSaving}>保存</Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={editSaving}>キャンセル</Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant={isPlaying ? 'primary' : 'outline'}
                                onClick={() => setMeetingPlayingId(isPlaying ? null : m.id)}
                                style={{ borderColor: color.navy, color: isPlaying ? color.white : color.navy, background: isPlaying ? color.navy : color.white }}
                              >
                                {isPlaying ? '■ 停止' : '▶ 再生'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenDocument(m)}
                                title={m.document_name || 'PDF資料を開く'}
                              >資料</Button>
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
                                  background: color.navy,
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

          </div>
        </Card>
      )}

      {docDialogMeeting && (
        <MeetingDocumentDialog
          meeting={docDialogMeeting}
          canUpload={isAdmin}
          onClose={() => setDocDialogMeeting(null)}
          onSaved={() => { setDocDialogMeeting(null); refreshMeetings(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 資料が無い回で出すポップアップ。そのまま資料を入れられる
// ────────────────────────────────────────────────────────────
function MeetingDocumentDialog({ meeting, canUpload, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const pick = (f) => {
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!isPdf) { setError('資料はPDFファイルのみアップロードできます'); return; }
    setError(''); setFile(f);
  };

  const save = async () => {
    if (!file) return;
    setSaving(true); setError('');
    const { error: err } = await setWeeklyMeetingDocument(meeting.id, {
      file, currentPath: meeting.document_path || null,
    });
    setSaving(false);
    if (err) { setError('資料を保存できませんでした。権限がない可能性があります。'); return; }
    onSaved();
  };

  return (
    <div
      onClick={() => { if (!saving) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: space[4],
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: color.white, borderRadius: radius.lg,
          boxShadow: shadow.xl, overflow: 'hidden',
        }}
      >
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[2.5]}px ${space[4]}px`,
          fontSize: font.size.sm, fontWeight: font.weight.bold,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{meeting.title}</div>

        <div style={{ padding: space[4] }}>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>
            この回は資料がありません。
          </div>

          {canUpload ? (
            <>
              <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1.5] }}>
                この場で資料を登録できます。
              </div>
              <div
                onDragOver={e => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
                onClick={() => { if (!saving) inputRef.current?.click(); }}
                style={{
                  marginTop: space[3],
                  border: `2px dashed ${over ? color.gold : color.border}`,
                  background: over ? '#FFFBEB' : '#F8F9FA',
                  borderRadius: radius.lg, padding: space[5],
                  textAlign: 'center', cursor: saving ? 'default' : 'pointer',
                }}
              >
                <div style={{ fontSize: font.size.sm, color: color.navy, fontWeight: font.weight.semibold }}>
                  {file ? `選択中: ${file.name}` : '資料をアップロード'}
                </div>
                <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: space[1] }}>
                  クリックまたはドラッグ＆ドロップ（PDF）
                </div>
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                  onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1.5] }}>
              登録されしだい、この資料ボタンから開けるようになります。
            </div>
          )}

          {error && (
            <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], marginTop: space[4] }}>
            <Button variant="outline" onClick={onClose} disabled={saving}>閉じる</Button>
            {canUpload && (
              <Button onClick={save} loading={saving} disabled={!file}>登録</Button>
            )}
          </div>
        </div>
      </div>
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
        // スマホでは1列になりカード幅が画面いっぱいになるため、
        // 4:3 のままだと1枚で画面の3分の1以上を占めてしまう。高さに上限を置く。
        aspectRatio: '4 / 3', maxHeight: 230,
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

// ────────────────────────────────────────────────────────────
// 編集中の「資料」欄。既にある回に後から入れる／差し替える／外す
// ────────────────────────────────────────────────────────────
function EditDocumentField({ meeting, file, removed, disabled, onPick, onUndo, onRemove }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const pending = !!file || removed;
  const hasCurrent = !!meeting.document_name;

  const label = file ? `差し替え: ${file.name}`
    : removed ? '保存すると資料を外します'
    : hasCurrent ? `資料: ${meeting.document_name}`
    : '資料を追加（クリックまたはドラッグ＆ドロップ・PDF）';

  const openPicker = () => { if (!disabled && !pending) inputRef.current?.click(); };

  return (
    <div
      onDragOver={e => { if (!disabled && !pending) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); setOver(false);
        if (!disabled && !pending) onPick(e.dataTransfer.files?.[0]);
      }}
      onClick={openPicker}
      style={{
        display: 'flex', alignItems: 'center', gap: space[2],
        border: `1px dashed ${over ? color.gold : color.border}`,
        background: over ? '#FFFBEB' : color.white,
        borderRadius: radius.md,
        padding: `${space[1.5]}px ${space[2]}px`,
        cursor: disabled || pending ? 'default' : 'pointer',
      }}
    >
      <span style={{
        flex: 1, minWidth: 0, fontSize: font.size.xs,
        color: pending ? color.navy : hasCurrent ? color.textMid : color.textLight,
        fontWeight: pending ? font.weight.semibold : font.weight.normal,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>

      {pending ? (
        <Button size="sm" variant="ghost" disabled={disabled}
          onClick={e => { e.stopPropagation(); onUndo(); }}>取り消し</Button>
      ) : hasCurrent ? (
        <>
          <Button size="sm" variant="ghost" disabled={disabled}
            onClick={e => { e.stopPropagation(); openPicker(); }}>差し替え</Button>
          <Button size="sm" variant="ghost" disabled={disabled}
            style={{ color: color.danger }}
            onClick={e => { e.stopPropagation(); onRemove(); }}>外す</Button>
        </>
      ) : null}

      <input
        ref={inputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
        onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }}
      />
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
function MeetingUploader({ currentUser, onUploaded }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [docDragOver, setDocDragOver] = useState(false);
  const inputRef = useRef(null);
  const docInputRef = useRef(null);

  const fillDefaults = (file) => {
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    if (!meetingDate) {
      const d = new Date();
      setMeetingDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  };

  const pickFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError('動画ファイルのみアップロードできます'); return; }
    setError('');
    setSelectedFile(file);
    fillDefaults(file);
  };
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  };

  // 資料はPDFのみ。type が空で届くブラウザがあるので拡張子でも見る
  const pickDoc = (file) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { setError('資料はPDFファイルのみアップロードできます'); return; }
    setError('');
    setDocFile(file);
  };
  const handleDocDrop = (e) => {
    e.preventDefault(); setDocDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickDoc(file);
  };

  const reset = () => {
    setSelectedFile(null); setDocFile(null);
    setTitle(''); setMeetingDate(''); setError('');
  };

  const doUpload = async () => {
    if (!selectedFile) return;
    setUploading(true); setUploadPct(0); setError(''); setNotice('');
    const { data, error, documentError } = await uploadWeeklyMeetingVideo({
      file: selectedFile, title: title || selectedFile.name, meetingDate: meetingDate || null,
      uploadedByName: currentUser || null,
      documentFile: docFile,
      onProgress: (uploaded, total) => { if (total > 0) setUploadPct(Math.round((uploaded / total) * 100)); },
    });
    setUploading(false); setUploadPct(0);
    if (error) { setError(typeof error === 'string' ? error : (error.message || 'アップロードに失敗しました')); return; }
    // 動画は登録できたが資料だけ失敗した場合は、黙って成功にしない
    if (documentError) setNotice('動画は登録できましたが、資料のアップロードに失敗しました。資料だけ入れ直してください。');
    reset();
    onUploaded?.(data);
  };

  return (
    <div style={{ marginBottom: space[4] }}>
      {/* まず動画を選ぶ。タイトルと資料はそのあとに出す（2026-08-21 むー様指示） */}
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
        <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: space[1] }}>
          クリックまたはドラッグ＆ドロップ
        </div>
        <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => pickFile(e.target.files?.[0])} />
      </div>

      {selectedFile && (
        <div style={{
          marginTop: space[3], padding: space[3],
          border: `1px solid ${color.borderLight}`, borderRadius: radius.lg,
          background: color.white,
          display: 'flex', flexDirection: 'column', gap: space[2.5],
        }}>
          <div style={{ display: 'flex', gap: space[2.5], alignItems: 'center', flexWrap: 'wrap' }}>
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
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDocDragOver(true); }}
            onDragLeave={() => setDocDragOver(false)}
            onDrop={handleDocDrop}
            onClick={() => { if (!uploading && !docFile) docInputRef.current?.click(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: space[2],
              border: `1px dashed ${docDragOver ? color.gold : color.border}`,
              background: docDragOver ? '#FFFBEB' : color.white,
              borderRadius: radius.md,
              padding: `${space[2]}px ${space[2.5]}px`,
              cursor: uploading || docFile ? 'default' : 'pointer',
            }}
          >
            <span style={{
              flex: 1, minWidth: 0, fontSize: font.size.xs,
              color: docFile ? color.navy : color.textLight,
              fontWeight: docFile ? font.weight.semibold : font.weight.normal,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {docFile ? `資料: ${docFile.name}` : '資料をアップロード（クリックまたはドラッグ＆ドロップ・PDF・任意）'}
            </span>
            {docFile && (
              <Button size="sm" variant="ghost" disabled={uploading}
                onClick={e => { e.stopPropagation(); setDocFile(null); }}>外す</Button>
            )}
            <input ref={docInputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
              onChange={e => { pickDoc(e.target.files?.[0]); e.target.value = ''; }} />
          </div>

          <div style={{ display: 'flex', gap: space[2.5], alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onClick={doUpload} loading={uploading} disabled={!title.trim()}>
              {uploading ? `アップロード中… ${uploadPct}%` : 'アップロード'}
            </Button>
            <Button variant="outline" onClick={reset} disabled={uploading}>キャンセル</Button>
          </div>
        </div>
      )}
      {error && <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>{error}</div>}
      {notice && <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.warn, fontWeight: font.weight.semibold }}>{notice}</div>}
    </div>
  );
}
