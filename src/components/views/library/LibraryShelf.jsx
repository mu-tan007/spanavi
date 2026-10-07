import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './LibraryShelf.css';

// ライブラリーの本棚（2026-10-07 むー様確認の見本どおり：5冊を横一列、本の形、紺の棚板）

const ICONS = {
  meetings: <path d="M3 6h13v12H3zM16 10l5-3v10l-5-3" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />,
  roleplay: <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />,
  daily_report: <path d="M5 3h10l4 4v14H5zM9 12h6M9 16h6" fill="none" stroke="#fff" strokeWidth="2" />,
  bookmarks: <path d="M6 3h12v18l-6-4-6 4z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />,
  rules: <path d="M4 5h16M4 10h16M4 15h10M4 20h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />,
};
export const BOOK_COLORS = {
  meetings: ['#032D60', '#021B40'], roleplay: ['#0176D3', '#03509A'], daily_report: ['#4F8FD6', '#2E6FB8'],
  bookmarks: ['#8A6A2A', '#5E4718'], rules: ['#4B5868', '#2F3945'],
};

export function Book({ id, meta, stat, active, isNew, index, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [c1, c2] = BOOK_COLORS[id] || ['#032D60', '#021B40'];
  return (
    <div ref={setNodeRef} className={`lb-book${active ? ' is-on' : ''}`} onClick={onOpen}
      style={{ background: `linear-gradient(160deg, ${c1}, ${c2})`, transform: CSS.Transform.toString(transform) || undefined, transition, opacity: isDragging ? 0.6 : 1, animationDelay: `${index * 0.07}s` }}>
      {isNew && <span className="lb-new">新着</span>}
      <span className="lb-ic"><svg viewBox="0 0 24 24">{ICONS[id]}</svg></span>
      <h5>{meta.title}</h5>
      <p>{meta.desc}</p>
      <div className="lb-meta"><b className="lb-num">{stat?.count ?? '—'}</b><span>{stat?.latest ? `最新 ${stat.latest}` : ''}</span></div>
      <span className="lb-grip" {...attributes} {...listeners} onClick={e => e.stopPropagation()} title="ドラッグで並べ替え">⋮⋮</span>
    </div>
  );
}

/** 上の段：最新の週次ミーティング（押すと週次ミーティングを開く）と今日の日報 */
export function LibraryHero({ meeting, watched, members, reports, onOpenMeetings, onOpenReports }) {
  const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
  const min = meeting?.duration_sec ? `${Math.floor(meeting.duration_sec / 60)}:${String(meeting.duration_sec % 60).padStart(2, '0')}` : '';
  return (
    <div className="lb-hero">
      {meeting ? (
        <div className="lb-card lb-feat" onClick={onOpenMeetings} role="button" tabIndex={0}>
          <div className="lb-thumb" style={meeting.stream_thumbnail ? { backgroundImage: `linear-gradient(0deg, rgba(2,27,64,.35), rgba(2,27,64,.35)), url(${meeting.stream_thumbnail})` } : undefined}>
            <span className="lb-rib">最新</span>{min && <span className="lb-dur lb-num">{min}</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <span className="lb-lbl">週次ミーティング ・ {md(meeting.meeting_date)}</span>
            <h3>{meeting.title || '（題名なし）'}</h3>
            <p>{[meeting.document_url ? '資料PDFつき' : '', meeting.access_restricted ? '見られる人を限った回' : ''].filter(Boolean).join(' ・ ') || '録画'}</p>
            {watched != null && members > 0 && (
              <div className="lb-watch"><span>見た人</span><span className="lb-wbar"><i style={{ width: `${Math.min(100, (watched / members) * 100)}%` }} /></span><span className="lb-num">{watched} / {members}人</span></div>
            )}
          </div>
        </div>
      ) : <div className="lb-card lb-feat lb-empty">週次ミーティングはまだありません</div>}
      <div className="lb-card lb-today" onClick={onOpenReports} role="button" tabIndex={0}>
        <h4><span>今日の日報</span><span>チームごと</span></h4>
        {reports.length === 0 && <div className="lb-lbl" style={{ padding: '10px 0' }}>今日の日報はまだありません</div>}
        {reports.map(r => {
          const k = r.payload?.kpi || {};
          return (
            <div key={r.id} className="lb-tm">
              <b>{r.team_name || '—'}</b>
              <span><span className="lb-nn lb-num">{Number(k.calls || 0).toLocaleString()}<small>件</small></span>架電</span>
              <span><span className="lb-nn lb-num">{Number(k.keyman_connects || 0).toLocaleString()}<small>件</small></span>社長につながった</span>
              <span><span className="lb-nn lb-num">{Number(k.appointments || 0)}<small>件</small></span>アポ</span>
            </div>
          );
        })}
        <div className="lb-lbl" style={{ marginTop: 6 }}>押すと日報を開く</div>
      </div>
    </div>
  );
}
