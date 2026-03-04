import { C } from '../../constants/colors';

export function InlineAudioPlayer({ url, onClose }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const audioSrc = url.includes('/storage/v1/object/public/')
    ? url
    : `${supabaseUrl}/functions/v1/get-zoom-recording?mode=download&recording_url=${encodeURIComponent(url)}&token=${anonKey}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
      borderRadius: 5, background: C.offWhite, marginTop: 4, flexWrap: 'wrap' }}>
      <audio controls autoPlay src={audioSrc} style={{ height: 32, flex: 1, minWidth: 200 }} />
      <button onClick={onClose} title="閉じる"
        style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer',
          color: C.textLight, padding: '0 2px', lineHeight: 1 }}>✕</button>
    </div>
  );
}

export default InlineAudioPlayer;
