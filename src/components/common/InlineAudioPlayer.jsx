import { C } from '../../constants/colors';

export function InlineAudioPlayer({ url, onClose }) {
  if (!url) return null;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const audioSrc = url.includes('/storage/v1/object/public/')
    ? url
    : `${supabaseUrl}/functions/v1/get-zoom-recording?mode=download&recording_url=${encodeURIComponent(url)}&token=${anonKey}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
      borderRadius: 5, background: C.offWhite, marginTop: 4, flexWrap: 'wrap' }}>
      <audio controls autoPlay src={audioSrc} style={{ height: 32, flex: 1, minWidth: 200 }} />
      <a
        href={url}
        download
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          background: '#F3F2F2',
          color: '#032D60',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
          border: '1px solid #E5E5E5',
          marginLeft: 8,
          whiteSpace: 'nowrap',
        }}
      >
        ⬇ DL
      </a>
      <button onClick={onClose} title="閉じる"
        style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer',
          color: C.textLight, padding: '0 2px', lineHeight: 1 }}>✕</button>
    </div>
  );
}

export default InlineAudioPlayer;
