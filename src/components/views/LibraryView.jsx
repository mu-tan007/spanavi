import { useState, useEffect } from 'react';
import { C } from '../../constants/colors';
import InternRulesView from './InternRulesView';
import ScriptView from './ScriptView';
import InlineAudioPlayer from '../common/InlineAudioPlayer';
import PageHeader from '../common/PageHeader';
import { fetchRecordingBookmarks, deleteRecordingBookmark } from '../../lib/supabaseWrite';

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

  useEffect(() => {
    if (!currentUser) return;
    fetchRecordingBookmarks(currentUser).then(({ data }) => setBookmarks(data || []));
  }, [currentUser]);

  const handleRemoveBookmark = async (id) => {
    await deleteRecordingBookmark(id);
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  // 週次ミーティング動画は後ほど格納（weekly_meeting_videos テーブル想定）
  const weeklyMeetings = [];

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
        {weeklyMeetings.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
            動画は順次アップロード予定です。
          </div>
        ) : weeklyMeetings.map((m, idx) => {
          const isPlaying = meetingPlayingId === m.id;
          return (
            <div key={m.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #F0F0F0', padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>{m.title}</div>
                  <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>{m.date}</div>
                </div>
                <button onClick={() => setMeetingPlayingId(isPlaying ? null : m.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 4, border: '1px solid #0D2247',
                    background: isPlaying ? '#0D2247' : '#fff', color: isPlaying ? '#fff' : '#0D2247',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  }}>
                  {isPlaying ? '■ 停止' : '▶ 再生'}
                </button>
              </div>
              {isPlaying && (
                <div style={{ marginTop: 10 }}>
                  <video src={m.video_url} controls style={{ width: '100%', maxHeight: 480, borderRadius: 4, background: '#000' }} />
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
