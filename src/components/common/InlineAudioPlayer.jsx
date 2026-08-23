import { useEffect, useState } from 'react';
import { color, font, radius } from '../../constants/design';
import { resolveRecordingUrl } from '../../lib/recordingUrl';

// 行の中に開く録音プレイヤー
// -----------------------------------------------------------------------------
// ⚠️ 渡された URL をそのまま <audio> に入れてはいけない（2026-08-23）。
//    録音の実体は Cloudflare R2 へ移した。DBに入っているのは移設前の公開URLなので、
//    resolveRecordingUrl を通して今の置き場所に読み替える。
//    Zoom の録音など録音バケット以外のURLは、これまでどおり
//    get-zoom-recording を経由する。
export function InlineAudioPlayer({ url, onClose }) {
  const [src, setSrc] = useState(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!url) return undefined;
    setSrc(null);
    setGone(false);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    resolveRecordingUrl(url).then((r) => {
      if (cancelled) return;
      if (r.external) {
        // 録音バケット以外（Zoom等）はこれまでどおり
        setSrc(`${supabaseUrl}/functions/v1/get-zoom-recording?mode=download`
          + `&recording_url=${encodeURIComponent(url)}&token=${anonKey}`);
      } else if (r.url) {
        setSrc(r.url);
      } else {
        setGone(true);
      }
    });
    return () => { cancelled = true; };
  }, [url]);

  if (!url) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
      borderRadius: 5, background: color.offWhite, marginTop: 4, flexWrap: 'wrap' }}>
      {gone ? (
        <span style={{ flex: 1, fontSize: font.size.sm, color: color.textLight }}>
          この録音は見つかりませんでした。
        </span>
      ) : !src ? (
        <span style={{ flex: 1, fontSize: font.size.sm, color: color.textLight }}>
          読み込んでいます...
        </span>
      ) : (
        <audio controls autoPlay src={src} style={{ height: 32, flex: 1, minWidth: 200 }} />
      )}
      {src && (
        <a
          href={src}
          download
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: color.offWhite,
            color: color.navy,
            borderRadius: radius.lg,
            fontSize: font.size.sm,
            fontWeight: font.weight.semibold,
            textDecoration: 'none',
            border: `1px solid ${color.border}`,
            marginLeft: 8,
            whiteSpace: 'nowrap',
          }}
        >
          ⬇ DL
        </a>
      )}
      <button onClick={onClose} title="閉じる"
        style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer',
          color: color.textLight, padding: '0 2px', lineHeight: 1 }}>✕</button>
    </div>
  );
}

export default InlineAudioPlayer;
