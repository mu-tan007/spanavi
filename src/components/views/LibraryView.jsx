import { useState, useEffect, useRef } from 'react';
import { C } from '../../constants/colors';
import InternRulesView from './InternRulesView';
import ScriptView from './ScriptView';
import InlineAudioPlayer from '../common/InlineAudioPlayer';
import PageHeader from '../common/PageHeader';
import {
  fetchRecordingBookmarks, deleteRecordingBookmark,
  fetchWeeklyMeetingVideos, uploadWeeklyMeetingVideo, deleteWeeklyMeetingVideo, updateWeeklyMeetingVideo,
} from '../../lib/supabaseWrite';

function CollapsibleSection({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: C.white, border: '1px solid #E5E7EB', borderRadius: 4, marginBottom: 12 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 700, color: C.navy, textAlign: 'left',
        }}
      >
        <span>
          {title}
          {count != null && (
            <span style={{ fontSize: 11, fontWeight: 400, color: C.textLight, marginLeft: 8 }}>
              {count}件
            </span>
          )}
        </span>
        <span style={{ fontSize: 11, color: C.textLight }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px 20px', borderTop: '1px solid #F3F4F6' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function LibraryView({
  currentUser,
  userId,
  members,
  isAdmin = false,
  clientData,
  callListData,
  setCallListData,
}) {
  const [bookmarks, setBookmarks] = useState([]);
  const [bookmarkPlayingId, setBookmarkPlayingId] = useState(null);
  const [meetingPlayingId, setMeetingPlayingId] = useState(null);

  // 週次ミーティング動画
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
  };
  useEffect(() => { refreshMeetings(); }, []);

  const handleRemoveBookmark = async (id) => {
    await deleteRecordingBookmark(id);
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  const handleDeleteMeeting = async (m) => {
    if (!window.confirm(`「${m.title}」を削除します。よろしいですか？`)) return;
    await deleteWeeklyMeetingVideo(m.id, m.storage_path);
    refreshMeetings();
  };

  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const startEdit = (m) => {
    setEditingMeetingId(m.id);
    setEditTitle(m.title || '');
    setEditDate(m.meeting_date || '');
  };
  const saveEdit = async () => {
    await updateWeeklyMeetingVideo(editingMeetingId, {
      title: editTitle.trim() || null,
      meeting_date: editDate || null,
    });
    setEditingMeetingId(null);
    refreshMeetings();
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="Library"
        description="22箇条・スクリプト・ロープレ履歴・録音・ミーティングアーカイブを一箇所に集約。"
      />
      <div style={{ height: 16 }} />

      <CollapsibleSection title="22箇条" defaultOpen={false}>
        <InternRulesView embedded />
      </CollapsibleSection>

      <CollapsibleSection title="お気に入り録音" count={bookmarks.length} defaultOpen={true}>
        {bookmarks.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
            ブックマークはまだありません。Search → 録音一覧 から追加できます。
          </div>
        ) : bookmarks.map((b, idx) => {
          const isPlaying = bookmarkPlayingId === b.id;
          return (
            <div key={b.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #F0F0F0', padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontFamily: "'Noto Sans JP'" }}>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#0D2247', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.company_name || '—'}
                  </div>
                  <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>
                    {b.getter_name || '—'} ・ {(b.created_at || '').slice(0, 10)}
                  </div>
                </div>
                <button onClick={() => setBookmarkPlayingId(isPlaying ? null : b.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 4, border: '1px solid #0D2247',
                    background: isPlaying ? '#0D2247' : '#fff', color: isPlaying ? '#fff' : '#0D2247',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  }}>
                  {isPlaying ? '■ 停止' : '▶ 再生'}
                </button>
                <button onClick={() => handleRemoveBookmark(b.id)} title="ブックマーク解除"
                  style={{
                    padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB',
                    background: '#fff', cursor: 'pointer', fontSize: 14, color: '#F59E0B',
                  }}>★</button>
              </div>
              {isPlaying && <InlineAudioPlayer url={b.recording_url} onClose={() => setBookmarkPlayingId(null)} />}
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title="週次ミーティングアーカイブ" count={weeklyMeetings.length} defaultOpen={true}>
        {isAdmin && (
          <MeetingUploader
            currentUser={currentUser}
            onUploaded={refreshMeetings}
          />
        )}
        {wmLoading ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
            読み込み中…
          </div>
        ) : weeklyMeetings.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
            動画はまだアップロードされていません。
          </div>
        ) : weeklyMeetings.map((m, idx) => {
          const isPlaying = meetingPlayingId === m.id;
          const isEditing = editingMeetingId === m.id;
          return (
            <div key={m.id} style={{ borderTop: idx === 0 && !isAdmin ? 'none' : '1px solid #F0F0F0', padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        placeholder="タイトル"
                        style={{ padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, fontWeight: 700, color: C.navy }} />
                      <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                        style={{ padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, width: 160 }} />
                    </div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700, color: C.navy, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.title}
                      </div>
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
                    <button onClick={saveEdit}
                      style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: C.navy, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>保存</button>
                    <button onClick={() => setEditingMeetingId(null)}
                      style={{ padding: '6px 12px', borderRadius: 4, border: `1px solid ${C.border}`, background: '#fff', color: C.textMid, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>キャンセル</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setMeetingPlayingId(isPlaying ? null : m.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 4, border: '1px solid #0D2247',
                        background: isPlaying ? '#0D2247' : '#fff', color: isPlaying ? '#fff' : '#0D2247',
                        cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      }}>
                      {isPlaying ? '■ 停止' : '▶ 再生'}
                    </button>
                    {isAdmin && (
                      <button onClick={() => startEdit(m)} title="タイトル・日付を編集"
                        style={{
                          padding: '6px 10px', borderRadius: 4, border: `1px solid ${C.border}`,
                          background: '#fff', color: C.navy, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        }}>✎ 編集</button>
                    )}
                    {isAdmin && (
                      <button onClick={() => handleDeleteMeeting(m)} title="削除"
                        style={{
                          padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB',
                          background: '#fff', color: '#DC2626', cursor: 'pointer', fontSize: 11,
                        }}>削除</button>
                    )}
                  </>
                )}
              </div>
              {isPlaying && (
                <div style={{ marginTop: 10 }}>
                  {m.drive_file_id ? (
                    <iframe
                      src={`https://drive.google.com/file/d/${m.drive_file_id}/preview`}
                      title={m.title}
                      allow="autoplay"
                      allowFullScreen
                      style={{ width: '100%', height: 480, borderRadius: 4, background: '#000', border: 'none' }}
                    />
                  ) : (
                    <video src={m.public_url} controls style={{ width: '100%', maxHeight: 480, borderRadius: 4, background: '#000' }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title="スクリプト一覧" defaultOpen={false}>
        <ScriptView
          isAdmin={isAdmin}
          clientData={clientData}
          callListData={callListData}
          setCallListData={setCallListData}
          embedded
        />
      </CollapsibleSection>
    </div>
  );
}

// 週次ミーティング動画アップロード（クリック選択 + ドラッグ&ドロップ）
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
    if (!file.type.startsWith('video/')) {
      setError('動画ファイルのみアップロードできます');
      return;
    }
    setError('');
    setSelectedFile(file);
    // タイトル未入力なら、ファイル名（拡張子除く）を初期値に
    if (!title) {
      const base = file.name.replace(/\.[^.]+$/, '');
      setTitle(base);
    }
    // 日付も今日を初期値に
    if (!meetingDate) {
      const d = new Date();
      setMeetingDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  };

  const doUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadPct(0);
    setError('');
    const { error } = await uploadWeeklyMeetingVideo({
      file: selectedFile,
      title: title || selectedFile.name,
      meetingDate: meetingDate || null,
      uploadedByName: currentUser || null,
      onProgress: (uploaded, total) => {
        if (total > 0) setUploadPct(Math.round((uploaded / total) * 100));
      },
    });
    setUploading(false);
    setUploadPct(0);
    if (error) {
      setError(typeof error === 'string' ? error : (error.message || 'アップロードに失敗しました'));
      return;
    }
    setSelectedFile(null);
    setTitle('');
    setMeetingDate('');
    onUploaded?.();
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
          borderRadius: 6, padding: '20px', textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 12, color: C.navy, fontWeight: 600 }}>
          {selectedFile
            ? `選択中: ${selectedFile.name} (${Math.round(selectedFile.size / 1024 / 1024)}MB)`
            : '📁 クリックまたはドラッグ＆ドロップで動画ファイルを選択'}
        </div>
        <div style={{ fontSize: 10, color: C.textLight, marginTop: 4 }}>
          対応形式: mp4 / webm / mov / mkv（最大2GB）
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={e => pickFile(e.target.files?.[0])}
        />
      </div>

      {selectedFile && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="タイトル（例: 週次MTG 第1回）"
            style={{ flex: '1 1 240px', padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12 }}
          />
          <input
            type="date"
            value={meetingDate}
            onChange={e => setMeetingDate(e.target.value)}
            style={{ padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
          />
          <button
            onClick={doUpload}
            disabled={uploading || !title.trim()}
            style={{
              padding: '7px 18px', fontSize: 12, fontWeight: 600,
              background: uploading ? C.textLight : C.navy, color: C.white,
              border: 'none', borderRadius: 4,
              cursor: uploading ? 'wait' : 'pointer',
            }}
          >{uploading ? `アップロード中… ${uploadPct}%` : 'アップロード'}</button>
          <button
            onClick={() => { setSelectedFile(null); setTitle(''); setMeetingDate(''); setError(''); }}
            disabled={uploading}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 600,
              background: C.white, color: C.textMid,
              border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
            }}
          >キャンセル</button>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 600 }}>{error}</div>
      )}
    </div>
  );
}
