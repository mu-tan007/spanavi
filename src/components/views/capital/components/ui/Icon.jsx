// Caesar 共通アイコン — 細線・モノクロ (currentColor) でプロフェッショナル
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }

const ICONS = {
  // --- ファイル種別 ---
  'file':       <g {...base}><path d="M4 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M11 2v5h5"/></g>,
  'file-pdf':   <g {...base}><path d="M4 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M11 2v5h5"/><text x="10" y="17" fontSize="4.5" stroke="none" fill="currentColor" textAnchor="middle" fontWeight="600">PDF</text></g>,
  'file-xls':   <g {...base}><path d="M4 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M11 2v5h5"/><path d="M6 12l3 5M6 17l3-5"/></g>,
  'file-doc':   <g {...base}><path d="M4 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M11 2v5h5"/><path d="M6 13h7M6 16h5"/></g>,
  'file-ppt':   <g {...base}><path d="M4 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M11 2v5h5"/><rect x="6" y="12" width="7" height="4"/></g>,
  'image':      <g {...base}><rect x="3" y="4" width="16" height="14" rx="1"/><circle cx="8" cy="9" r="1.5"/><path d="M3 15l4-3 5 4 4-3 3 2"/></g>,
  'paperclip':  <g {...base}><path d="M15 7l-7 7a3 3 0 01-4-4l8-8a2 2 0 013 3l-7 7a1 1 0 01-1-1l6-6"/></g>,

  // --- カテゴリ ---
  'folder':     <g {...base}><path d="M3 5a1 1 0 011-1h4l2 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V5z"/></g>,
  'folder-open':<g {...base}><path d="M3 5a1 1 0 011-1h4l2 2h8a1 1 0 011 1v3H3V5z"/><path d="M3 10l2 8h12l2-8H3z"/></g>,
  'star':       <g {...base}><polygon points="11,2 13.5,8 20,8.5 15,13 16.5,19.5 11,16 5.5,19.5 7,13 2,8.5 8.5,8" /></g>,
  'star-fill':  <g {...base} fill="currentColor"><polygon points="11,2 13.5,8 20,8.5 15,13 16.5,19.5 11,16 5.5,19.5 7,13 2,8.5 8.5,8" /></g>,
  'clock':      <g {...base}><circle cx="11" cy="11" r="8.5"/><path d="M11 6v5l3.5 2"/></g>,
  'trending-up':<g {...base}><polyline points="3,16 8,11 12,14 18,6"/><polyline points="14,6 18,6 18,10"/></g>,
  'yen':        <g {...base}><circle cx="11" cy="11" r="8.5"/><path d="M7 6l4 6 4-6M7 12h8M7 15h8"/></g>,
  'scales':     <g {...base}><path d="M11 3v16M4 7h14M4 7l-2 5a4 4 0 008 0L8 7M14 7l-2 5a4 4 0 008 0l-2-5"/></g>,
  'users':      <g {...base}><circle cx="8" cy="8" r="3"/><path d="M2 18c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="15" cy="9" r="2.5"/><path d="M14 13.5c3 .5 5 3 5 4.5"/></g>,
  'server':     <g {...base}><rect x="3" y="4" width="16" height="6" rx="1"/><rect x="3" y="12" width="16" height="6" rx="1"/><circle cx="7" cy="7" r="0.5" fill="currentColor"/><circle cx="7" cy="15" r="0.5" fill="currentColor"/></g>,
  'receipt':    <g {...base}><path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21V3H5z"/><path d="M8 8h6M8 11h6M8 14h4"/></g>,
  'leaf':       <g {...base}><path d="M4 18c0-8 7-14 15-14 0 8-6 14-15 14z"/><path d="M5 19c2-4 6-7 10-8"/></g>,
  'scroll':     <g {...base}><path d="M5 4h11a3 3 0 013 3v10a3 3 0 01-3 3H5V4z"/><path d="M5 4a3 3 0 010 6h1"/><path d="M9 9h6M9 12h6M9 15h4"/></g>,
  'document':   <g {...base}><rect x="4" y="3" width="14" height="18" rx="1"/><path d="M7 7h8M7 10h8M7 13h8M7 16h5"/></g>,
  'grid-view':  <g {...base}><rect x="3" y="3" width="7" height="7"/><rect x="12" y="3" width="7" height="7"/><rect x="3" y="12" width="7" height="7"/><rect x="12" y="12" width="7" height="7"/></g>,
  'list-view':  <g {...base}><path d="M3 5h16M3 11h16M3 17h16"/></g>,

  // --- アクション ---
  'download':   <g {...base}><path d="M11 3v11m0 0l-4-4m4 4l4-4M4 18h14"/></g>,
  'upload':     <g {...base}><path d="M11 18V7m0 0l-4 4m4-4l4 4M4 20h14"/></g>,
  'trash':      <g {...base}><path d="M4 7h14M9 7V4h4v3M6 7l1 13h8l1-13"/></g>,
  'close':      <g {...base}><path d="M5 5l12 12M17 5L5 17"/></g>,
  'plus':       <g {...base}><path d="M11 5v12M5 11h12"/></g>,
  'search':     <g {...base}><circle cx="9" cy="9" r="6"/><path d="M14 14l5 5"/></g>,
  'bell':       <g {...base}><path d="M11 3a5 5 0 00-5 5v3l-2 3h14l-2-3V8a5 5 0 00-5-5z"/><path d="M9 17a2 2 0 004 0"/></g>,
  'check':      <g {...base}><path d="M4 11l5 5 9-10"/></g>,

  // --- その他 ---
  'archive':    <g {...base}><rect x="3" y="4" width="16" height="4" rx="1"/><path d="M4 8v10a1 1 0 001 1h12a1 1 0 001-1V8M9 12h4"/></g>,
}

export default function Icon({ name, size = 16, color, style, className }) {
  const svg = ICONS[name]
  if (!svg) return null
  return (
    <svg
      width={size} height={size} viewBox="0 0 22 22"
      className={className}
      style={{ color: color || 'currentColor', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}>
      {svg}
    </svg>
  )
}
