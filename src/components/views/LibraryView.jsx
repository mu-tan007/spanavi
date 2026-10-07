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
import { Button, Input, Card, Badge, Select } from '../ui';
import InternRulesView from './InternRulesView';
import InlineAudioPlayer from '../common/InlineAudioPlayer';
import PageHeader from '../common/PageHeader';
import DailyReportPanel from './library/DailyReportPanel';
import MeetingStreamPlayer from './library/MeetingStreamPlayer';
import { MeetingWatchPanel, MeetingWatchGrid, meetingWatchSummary, useMeetingWatchData } from './library/MeetingWatchStats';
import './library/LibraryInner.css';
import {
  fetchRecordingBookmarks, deleteRecordingBookmark,
  fetchWeeklyMeetingVideos, uploadWeeklyMeetingVideo, deleteWeeklyMeetingVideo, updateWeeklyMeetingVideo,
  refreshWeeklyMeetingStatus, setWeeklyMeetingDocument, weeklyMeetingDocumentDownloadUrl,
  fetchLockedWeeklyMeetingIds, fetchWeeklyMeetingPlaybackId,
  fetchWeeklyMeetingViewers, saveWeeklyMeetingViewers, setWeeklyMeetingRestricted,
} from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import TrainingRoleplaySection from './TrainingRoleplaySection';
import { Book, LibraryHero, BOOK_COLORS } from './library/LibraryShelf';

const CF_STREAM_SUBDOMAIN = import.meta.env.VITE_CF_STREAM_CUSTOMER_SUBDOMAIN || '';

// 2026-10-07 見本どおり：5冊（ロープレをライブラリーに統合）。並びを見本に戻すため保存の鍵を v2 に
const STORAGE_KEY = 'spanavi_library_card_order_v2';
const DEFAULT_ORDER = ['meetings', 'roleplay', 'daily_report', 'bookmarks', 'rules'];

const CARDS = {
  meetings:     { title: '勉強会', desc: '毎週の録画と資料。見られる人を限った回もある' },
  roleplay:     { title: 'ロープレ',         desc: '毎週の篠宮・リーダーとのロープレの録音とAIの講評' },
  daily_report: { title: '日報',             desc: 'チームごとのその日の架電・アポ' },
  bookmarks:    { title: 'お気に入り録音',   desc: 'あとで聞き返したい通話' },
  rules:        { title: '22箇条',           desc: 'インターンの決まりごと' },
};
const md = (d) => (d ? `${Number(String(d).slice(5, 7))}/${Number(String(d).slice(8, 10))}` : '');

export default function LibraryView({
  currentUser, userId, members, isAdmin = false,
  clientData, callListData, setCallListData, initialCard = null,
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
    if (initialCard && DEFAULT_ORDER.includes(initialCard)) return initialCard;
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
  const [shelfStats, setShelfStats] = useState({ roleplay: null, daily: null, today: [] });
  useEffect(() => {
    let alive = true;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
    const since = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
    Promise.all([
      supabase.from('roleplay_sessions').select('id', { count: 'exact', head: true }).eq('session_type', 'weekly'),
      supabase.from('roleplay_sessions').select('session_date').eq('session_type', 'weekly').order('session_date', { ascending: false }).limit(1),
      supabase.from('daily_reports').select('id', { count: 'exact', head: true }).gte('report_date', since),
      supabase.from('daily_reports').select('id, team_name, report_date, payload').eq('report_date', today).order('team_name'),
    ]).then(([rc, rl, dc, td]) => {
      if (!alive) return;
      setShelfStats({ roleplay: { count: rc.count ?? 0, latest: rl.data?.[0]?.session_date || '' }, daily: { count: dc.count ?? 0 }, today: td.data || [] });
    });
    return () => { alive = false; };
  }, []);
  const [bookmarkPlayingId, setBookmarkPlayingId] = useState(null);
  const [meetingPlayingId, setMeetingPlayingId] = useState(null);
  const [weeklyMeetings, setWeeklyMeetings] = useState([]);
  const [wmLoading, setWmLoading] = useState(true);
  // 視聴制限（第34回以降）。見られない回のIDと、再生用ID（署名付きトークン）
  const [lockedIds, setLockedIds] = useState(() => new Set());
  const [playbackIds, setPlaybackIds] = useState({});
  const [playbackErrors, setPlaybackErrors] = useState({});
  const [viewerDialogMeeting, setViewerDialogMeeting] = useState(null);
  // 視聴状況（全員に見せる）。開くたびに最新を読み直す
  const [watchPanelId, setWatchPanelId] = useState(null);
  const [watchRefreshKey, setWatchRefreshKey] = useState(0);
  const watchData = useMeetingWatchData(watchRefreshKey);
  const toggleWatchPanel = (m) => {
    if (watchPanelId === m.id) { setWatchPanelId(null); return; }
    setWatchPanelId(m.id);
    setWatchRefreshKey(k => k + 1);
  };

  useEffect(() => {
    if (!currentUser) return;
    fetchRecordingBookmarks(currentUser).then(({ data }) => setBookmarks(data || []));
  }, [currentUser]);
  // お気に入り録音：みんなの保存と自分の保存（2026-10-07 見本どおり）
  const [bmScope, setBmScope] = useState('all');
  const [allBookmarks, setAllBookmarks] = useState([]);
  useEffect(() => {
    supabase.from('recording_bookmarks').select('*').order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setAllBookmarks(data || []));
  }, [bookmarks.length]);

  const refreshMeetings = async () => {
    setWmLoading(true);
    const [{ data }, { data: locked }] = await Promise.all([fetchWeeklyMeetingVideos(), fetchLockedWeeklyMeetingIds()]);
    setWeeklyMeetings(data || []);
    setLockedIds(locked);
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

  const handlePlayMeeting = async (m) => {
    if (meetingPlayingId === m.id) { setMeetingPlayingId(null); return; }
    setMeetingPlayingId(m.id);
    if (!m.access_restricted || lockedIds.has(m.id) || playbackIds[m.id]) return;
    setPlaybackErrors(prev => ({ ...prev, [m.id]: null }));
    const { data, forbidden } = await fetchWeeklyMeetingPlaybackId(m.id);
    if (data) setPlaybackIds(prev => ({ ...prev, [m.id]: data }));
    else setPlaybackErrors(prev => ({ ...prev, [m.id]: forbidden ? 'forbidden' : 'error' }));
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

  // 資料ボタン。ある回は動画と同じように行の下でそのまま開き、
  // 無い回はポップアップを出す（行の下に文を足すと一覧の行が太るため）
  const [docDialogMeeting, setDocDialogMeeting] = useState(null);
  const [docViewingId, setDocViewingId] = useState(null);
  const handleOpenDocument = (m) => {
    if (!m.document_url) { setDocDialogMeeting(m); return; }
    setDocViewingId(docViewingId === m.id ? null : m.id);
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

  // 勉強会（2026-10-07 見本どおり）：選んだ回を大きく、右に回の一覧、管理は ⋯ に
  const [selMeetingId, setSelMeetingId] = useState(null);
  const [showUploader, setShowUploader] = useState(false);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const renderMeetingPlayer = (m) => {
    const isLocked = lockedIds.has(m.id) || playbackErrors[m.id] === 'forbidden';
    const streamId = m.access_restricted ? playbackIds[m.id] : m.stream_uid;
    const box = (children) => <div className="li-video li-video-msg">{children}</div>;
    if (isLocked) return <div style={{ padding: 16 }}><MeetingLockedNotice /></div>;
    if (m.stream_uid && CF_STREAM_SUBDOMAIN) {
      if (!m.stream_ready) return box(<><b>処理中…</b><span>Cloudflare Stream でストリーミング変換中です（通常 1〜2分で完了）</span></>);
      if (!streamId) return box(<b>{playbackErrors[m.id] === 'error' ? '再生の準備に失敗しました。もう一度お試しください' : '読み込み中…'}</b>);
      return (
        <div className="li-video" style={{ position: 'relative' }}>
          <MeetingStreamPlayer videoId={m.id} title={m.title}
            src={`https://${CF_STREAM_SUBDOMAIN}.cloudflarestream.com/${streamId}/iframe?poster=https%3A%2F%2F${CF_STREAM_SUBDOMAIN}.cloudflarestream.com%2F${streamId}%2Fthumbnails%2Fthumbnail.jpg`} />
        </div>
      );
    }
    if (m.drive_file_id) return <div className="li-video"><iframe src={`https://drive.google.com/file/d/${m.drive_file_id}/preview`} title={m.title} allow="autoplay; fullscreen" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} /></div>;
    return <div className="li-video"><video src={m.public_url} controls style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000' }} /></div>;
  };

  const counts = useMemo(() => ({
    bookmarks: bookmarks.length,
    meetings: weeklyMeetings.length,
  }), [bookmarks, weeklyMeetings]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="ライブラリー"
        description="見返すものの本棚 ・ 勉強会・ロープレ・日報・お気に入り録音・22箇条"
        style={{ marginBottom: space[4] }}
      />

      {(() => {
        const latest = weeklyMeetings[0] || null;
        const { members: wMembers = [], stats: wStats = {}, attendedSet } = watchData || {};
        const watched = latest && wMembers.length
          ? wMembers.filter(m => (wStats?.[latest.id]?.[m.user_id]?.coveredSec || 0) > 0 || attendedSet?.has?.(`${latest.id}:${m.id}`)).length
          : null;
        const open = (id) => { setActiveCardId(id); setTimeout(() => document.getElementById('lb-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
        const stat = {
          meetings: { count: `${weeklyMeetings.length}回`, latest: md(latest?.meeting_date) },
          roleplay: { count: shelfStats.roleplay ? `${shelfStats.roleplay.count}件` : '—', latest: md(shelfStats.roleplay?.latest) },
          daily_report: { count: shelfStats.daily ? `直近30日 ${shelfStats.daily.count}件` : '—', latest: shelfStats.today.length ? md(shelfStats.today[0].report_date) : '' },
          bookmarks: { count: `${bookmarks.length}件`, latest: md(bookmarks[0]?.created_at) },
          rules: { count: '22項目', latest: '' },
        };
        const recent = (d) => d && (Date.now() - new Date(d).getTime()) < 7 * 86400000;
        return (
          <>
            <LibraryHero meeting={latest} watched={watched} members={wMembers.length} reports={shelfStats.today}
              onOpenMeetings={() => open('meetings')} onOpenReports={() => open('daily_report')} />
            <div className="lb-shelf-h"><b>本棚</b><span className="lb-lbl">押すと下に中身 ・ ⋮⋮ で並べ替え</span></div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={order} strategy={rectSortingStrategy}>
                <div className="lb-shelfbox">
                  <div className="lb-shelf">
                    {order.map((id, i) => (
                      <Book key={id} id={id} meta={CARDS[id]} stat={stat[id]} index={i} active={activeCardId === id}
                        isNew={(id === 'meetings' && recent(latest?.meeting_date)) || (id === 'roleplay' && recent(shelfStats.roleplay?.latest))}
                        onOpen={() => (activeCardId === id ? setActiveCardId(null) : open(id))} />
                    ))}
                  </div>
                  <div className="lb-plank" />
                </div>
              </SortableContext>
            </DndContext>
          </>
        );
      })()}

      {/* 開いた本の中身（本棚の下に出す） */}
      {activeCardId && CARDS[activeCardId] && (
        <div id="lb-panel" className="lb-card lb-panel">
          <div>
            <div className="lb-panel-h">
              <b><i style={{ background: (BOOK_COLORS[activeCardId] || [])[0] }} />{CARDS[activeCardId].title}</b>
              <Button size="sm" variant="ghost" onClick={() => setActiveCardId(null)}>閉じる</Button>
            </div>

            {activeCardId === 'roleplay' && (
              <TrainingRoleplaySection currentUser={currentUser} userId={userId} members={members} isAdmin={isAdmin} hideTraining />
            )}

            {activeCardId === 'daily_report' && (
              <DailyReportPanel currentUser={currentUser} userId={userId} isAdmin={isAdmin} members={members} />
            )}

            {activeCardId === 'rules' && <InternRulesView embedded />}

            {activeCardId === 'bookmarks' && (() => {
              const rows = bmScope === 'mine' ? bookmarks : allBookmarks;
              return (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {[['all', 'みんなの保存'], ['mine', '自分の保存']].map(([k, l]) => (
                      <Button key={k} size="sm" variant={bmScope === k ? 'primary' : 'outline'} onClick={() => setBmScope(k)}>{l}{k === 'mine' ? `（${bookmarks.length}）` : `（${allBookmarks.length}）`}</Button>
                    ))}
                  </div>
                  {rows.length === 0 ? (
                    <Empty>{bmScope === 'mine' ? '保存した録音はまだありません。架電の録音一覧の ☆ から保存できます。' : '保存された録音はまだありません。'}</Empty>
                  ) : (
                    <div className="lb-card" style={{ overflow: 'hidden' }}>
                      {rows.map((b, idx) => {
                        const isPlaying = bookmarkPlayingId === b.id;
                        const mine = b.user_name === currentUser;
                        return (
                          <div key={b.id} className="li-bmr" style={{ animationDelay: `${Math.min(idx, 12) * 0.03}s` }}>
                            <button type="button" className={`li-bplay${isPlaying ? ' on' : ''}`} onClick={() => setBookmarkPlayingId(isPlaying ? null : b.id)} title={isPlaying ? '止める' : '聞く'} />
                            <span style={{ minWidth: 0 }}>
                              <b>{b.company_name || '—'}</b>
                              <small>{[b.getter_name ? `架電 ${b.getter_name}` : '', b.user_name ? `保存 ${b.user_name}` : '', md((b.created_at || '').slice(0, 10))].filter(Boolean).join(' ・ ')}{b.note ? ` ・ ${b.note}` : ''}</small>
                            </span>
                            {mine
                              ? <button type="button" className="li-star" onClick={() => handleRemoveBookmark(b.id)} title="保存をやめる">★</button>
                              : <span className="li-star off">★</span>}
                            {isPlaying && <div style={{ gridColumn: '1 / -1' }}><InlineAudioPlayer url={b.recording_url} onClose={() => setBookmarkPlayingId(null)} /></div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}

            {activeCardId === 'meetings' && (() => {
              if (wmLoading) return <Empty>読み込み中…</Empty>;
              const sel = weeklyMeetings.find(m => m.id === selMeetingId) || weeklyMeetings[0];
              const isEditing = sel && editingMeetingId === sel.id;
              const isPlaying = sel && meetingPlayingId === sel.id;
              const isDocOpen = sel && docViewingId === sel.id && !!sel.document_url;
              const isWatchOpen = sel && watchPanelId === sel.id;
              const sum = sel ? meetingWatchSummary(sel, watchData) : null;
              const mins = (v) => (v?.duration_sec ? `${Math.round(v.duration_sec / 60)}分` : '');
              const thumb = (v) => (v?.stream_thumbnail ? { backgroundImage: `linear-gradient(0deg, rgba(2,27,64,.3), rgba(2,27,64,.3)), url(${v.stream_thumbnail})` } : undefined);
              return (
                <>
                  {isAdmin && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                      <Button size="sm" variant={showUploader ? 'primary' : 'outline'} onClick={() => setShowUploader(v => !v)}>{showUploader ? '閉じる' : '＋ 回を上げる'}</Button>
                    </div>
                  )}
                  {isAdmin && showUploader && <MeetingUploader currentUser={currentUser} onUploaded={() => { setShowUploader(false); refreshMeetings(); }} />}
                  {!sel ? <Empty>動画はまだアップロードされていません。</Empty> : (
                    <div className="li-stage">
                      <div className="lb-card li-player">
                        {isPlaying ? renderMeetingPlayer(sel) : (
                          <div className="li-video li-poster" style={thumb(sel)} onClick={() => handlePlayMeeting(sel)} role="button" tabIndex={0}>
                            <span className="li-play" />
                            {mins(sel) && <span className="li-dur">{mins(sel)}</span>}
                          </div>
                        )}
                        <div className="li-ph">
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <Input size="sm" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="タイトル" />
                                <Input size="sm" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} containerStyle={{ width: 160 }} />
                                <EditDocumentField meeting={sel} file={editDocFile} removed={editDocRemoved} disabled={editSaving} onPick={pickEditDoc}
                                  onUndo={() => { setEditDocFile(null); setEditDocRemoved(false); setEditDocError(''); }}
                                  onRemove={() => { setEditDocFile(null); setEditDocRemoved(true); setEditDocError(''); }} />
                                {editDocError && <div style={{ fontSize: font.size.xs, color: color.danger }}>{editDocError}</div>}
                                <div style={{ display: 'flex', gap: 6 }}><Button size="sm" onClick={saveEdit} loading={editSaving}>保存</Button><Button size="sm" variant="outline" onClick={cancelEdit} disabled={editSaving}>キャンセル</Button></div>
                              </div>
                            ) : (
                              <>
                                <span className="lb-lbl">{[sel.meeting_date ? md(sel.meeting_date) : '', mins(sel), sel.uploaded_by_name].filter(Boolean).join(' ・ ')}</span>
                                <h2 className="li-title">{sel.title}</h2>
                              </>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="li-acts">
                              {sel.access_restricted && <span className="li-chip lock">見られる人を限った回</span>}
                              {sel.document_url && <Button size="sm" variant={isDocOpen ? 'primary' : 'outline'} onClick={() => handleOpenDocument(sel)}>{isDocOpen ? '資料を閉じる' : '資料'}</Button>}
                              {isPlaying && <Button size="sm" variant="outline" onClick={() => handlePlayMeeting(sel)}>■ 止める</Button>}
                              <Button size="sm" variant={isWatchOpen ? 'primary' : 'outline'} onClick={() => toggleWatchPanel(sel)}>誰が見たか</Button>
                              {(isAdmin || sel.public_url) && (
                                <span style={{ position: 'relative' }}>
                                  <Button size="sm" variant="ghost" onClick={() => setMgmtOpen(v => !v)}>⋯ 管理</Button>
                                  {mgmtOpen && (
                                    <div className="li-menu" onMouseLeave={() => setMgmtOpen(false)}>
                                      {sel.public_url && <a href={sel.public_url} target="_blank" rel="noopener noreferrer">Google Driveで開く</a>}
                                      {isAdmin && <button type="button" onClick={() => { setMgmtOpen(false); startEdit(sel); }}>題名・日付・資料を直す</button>}
                                      {isAdmin && sel.access_restricted && <button type="button" onClick={() => { setMgmtOpen(false); setViewerDialogMeeting(sel); }}>見られる人</button>}
                                      {isAdmin && !sel.document_url && <button type="button" onClick={() => { setMgmtOpen(false); handleOpenDocument(sel); }}>資料を足す</button>}
                                      {isAdmin && <button type="button" className="danger" onClick={() => { setMgmtOpen(false); handleDeleteMeeting(sel); }}>この回を消す</button>}
                                    </div>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {sum && sum.total > 0 && (
                          <div className="li-watch">
                            <span>この回を見た人</span>
                            <span className="li-wb"><i style={{ width: `${(sum.att / sum.total) * 100}%`, background: color.navy }} /><i style={{ width: `${(sum.rec / sum.total) * 100}%`, background: '#0176D3' }} /></span>
                            <span className="lb-num">出席 {sum.att} ・ 録画で {sum.rec} ・ まだ {sum.rest} / {sum.total}人</span>
                          </div>
                        )}
                      </div>
                      <div className="lb-card li-list">
                        <h4><span>回の一覧</span><span className="lb-num">{weeklyMeetings.length}回</span></h4>
                        <div className="li-eps">
                          {weeklyMeetings.map((v, i) => (
                            <button key={v.id} type="button" className={`li-ep${v.id === sel.id ? ' is-on' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 0.03}s` }}
                              onClick={() => { if (meetingPlayingId && meetingPlayingId !== v.id) handlePlayMeeting(weeklyMeetings.find(x => x.id === meetingPlayingId)); setSelMeetingId(v.id); setMgmtOpen(false); }}>
                              <span className="li-th" style={thumb(v)}>{mins(v) && <span>{mins(v)}</span>}</span>
                              <span style={{ minWidth: 0 }}><b>{v.title}</b><small>{[md(v.meeting_date), v.document_url ? '資料あり' : '', v.access_restricted ? '限定' : ''].filter(Boolean).join(' ・ ')}</small></span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {sel && isWatchOpen && <div style={{ marginTop: 12 }}><MeetingWatchPanel meeting={sel} data={watchData} /></div>}
                  {sel && isDocOpen && (
                    <div className="lb-card" style={{ marginTop: 12, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: font.size.xs, color: color.textMid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.document_name || '資料'}</span>
                        <a className="li-link pri" href={weeklyMeetingDocumentDownloadUrl(sel)}>↓ ダウンロード</a>
                        <a className="li-link" href={sel.document_url} target="_blank" rel="noopener noreferrer">↗ 別タブで開く</a>
                      </div>
                      <iframe src={sel.document_url} title={sel.document_name || sel.title} style={{ width: '100%', height: 640, border: `1px solid ${color.borderLight}`, borderRadius: radius.md, background: color.gray50 }} />
                    </div>
                  )}
                  {weeklyMeetings.length > 0 && (
                    <div className="lb-card" style={{ marginTop: 12, padding: '14px 18px' }}>
                      <div className="li-att-h"><b>出席と視聴</b>
                        <span className="li-lg"><span><i style={{ background: color.navy }} />出席</span><span><i style={{ background: '#0176D3' }} />録画を見た（長いほど濃い）</span><span><i style={{ background: '#fff', border: '1.5px solid #E8A0AB' }} />欠席・未視聴</span><span>— 入社前・記録なし</span></span></div>
                      <MeetingWatchGrid meetings={weeklyMeetings} data={watchData} />
                      <div className="lb-lbl" style={{ marginTop: 6 }}>出席・欠席は第23回以降（Zoomの参加者記録から）。直近14回を表示</div>
                    </div>
                  )}
                </>
              );
            })()}

          </div>
        </div>
      )}

      {viewerDialogMeeting && (
        <MeetingViewersDialog
          meeting={viewerDialogMeeting}
          onClose={() => setViewerDialogMeeting(null)}
          onSaved={() => { setViewerDialogMeeting(null); refreshMeetings(); }}
        />
      )}

      {docDialogMeeting && (
        <MeetingDocumentDialog
          meeting={docDialogMeeting}
          canUpload={isAdmin}
          onClose={() => setDocDialogMeeting(null)}
          onSaved={() => {
            // 登録した資料をそのまま開いて見せる
            setDocViewingId(docDialogMeeting.id);
            setDocDialogMeeting(null);
            refreshMeetings();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 視聴制限のある回を、見る権限のない人が開いたときの案内
// ────────────────────────────────────────────────────────────
function MeetingLockedNotice() {
  return (
    <div style={{
      width: '100%', borderRadius: radius.md, background: color.navy, color: color.white,
      padding: `${space[6]}px ${space[4]}px`, textAlign: 'center',
      display: 'flex', flexDirection: 'column', gap: space[2],
    }}>
      <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold }}>この回の録画は出席者だけが見られます</div>
      <div style={{ fontSize: font.size.xs, color: color.goldLight, lineHeight: 1.7 }}>
        やむを得ず欠席した場合は、篠宮に個別にLINEで<br />
        「録画を見させてほしい」と連絡してください
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 管理者用：この回を見られる人（出席・個別許可）を決める
// その回より後に入社した人は、設定しなくても見られる
// ────────────────────────────────────────────────────────────
const VIEWER_OPTIONS = [
  { value: '', label: '見られない' },
  { value: 'attended', label: '出席' },
  { value: 'granted', label: '個別に許可' },
];

function MeetingViewersDialog({ meeting, onClose, onSaved }) {
  const [members, setMembers] = useState(null);
  const [reasons, setReasons] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: ms, error: mErr }, { data: vs }] = await Promise.all([
        supabase.from('members').select('id, name, start_date, team').eq('is_active', true)
          .not('start_date', 'is', null).order('start_date'),
        fetchWeeklyMeetingViewers(meeting.id),
      ]);
      if (mErr) setError('メンバーを読み込めませんでした');
      setMembers(ms || []);
      setReasons(Object.fromEntries(vs.map(v => [v.member_id, v.reason])));
    })();
  }, [meeting.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const joinedAfter = (mb) => !!(meeting.meeting_date && mb.start_date > meeting.meeting_date);
  const setReason = (id, v) => setReasons(prev => {
    const next = { ...prev };
    if (v) next[id] = v; else delete next[id];
    return next;
  });

  const save = async () => {
    setSaving(true); setError('');
    const { error: err } = await saveWeeklyMeetingViewers(meeting.id, reasons);
    setSaving(false);
    if (err) { setError('保存できませんでした。管理者権限がない可能性があります。'); return; }
    onSaved();
  };

  const makePublic = async () => {
    if (!window.confirm('この回を全員が見られるようにします。よろしいですか？')) return;
    setSaving(true); setError('');
    const { error: err } = await setWeeklyMeetingRestricted(meeting, false);
    setSaving(false);
    if (err) { setError('変更できませんでした。'); return; }
    onSaved();
  };

  const count = members ? members.filter(mb => reasons[mb.id] || joinedAfter(mb)).length : 0;

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
          width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl, overflow: 'hidden',
        }}
      >
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[2.5]}px ${space[4]}px`,
          fontSize: font.size.sm, fontWeight: font.weight.bold,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>視聴者 ・ {meeting.title}</div>

        <div style={{
          padding: `${space[2.5]}px ${space[4]}px`, fontSize: font.size.xs, color: color.textMid,
          borderBottom: `1px solid ${color.borderLight}`,
        }}>
          見られる人 {count}名 ・ 管理者はいつでも見られます
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: `${space[1]}px ${space[4]}px` }}>
          {!members ? (
            <div style={{ padding: space[4], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>読み込み中…</div>
          ) : members.map(mb => (
            <div key={mb.id} style={{
              display: 'flex', alignItems: 'center', gap: space[3],
              padding: `${space[1.5]}px 0`, borderBottom: `1px solid ${color.borderLight}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{mb.name}</div>
                <div style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
                  {mb.start_date} 入社{mb.team ? ` ・ ${mb.team}チーム` : ''}
                </div>
              </div>
              {joinedAfter(mb) ? (
                <Badge variant="neutral">入社前の回</Badge>
              ) : (
                <Select
                  size="sm"
                  fullWidth={false}
                  containerStyle={{ width: 140 }}
                  value={reasons[mb.id] || ''}
                  onChange={e => setReason(mb.id, e.target.value)}
                  options={VIEWER_OPTIONS}
                  disabled={saving}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ padding: `0 ${space[4]}px`, fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>
            {error}
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: space[2],
          padding: space[3], borderTop: `1px solid ${color.borderLight}`,
        }}>
          <Button size="sm" variant="ghost" onClick={makePublic} disabled={saving}>全員に公開する</Button>
          <div style={{ flex: 1 }} />
          <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!members}>保存</Button>
        </div>
      </div>
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
// 勉強会動画アップロード
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
