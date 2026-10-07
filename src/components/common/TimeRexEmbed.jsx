import { useEffect, useState } from 'react';
import { color, radius, font, alpha } from '../../constants/design';

// TimeRex の予約画面を架電ページの中に出す（2026-10-07 むー様指示）。
// TimeRex の通常の予約URLは他のサイトの中に出せない（X-Frame-Options: SAMEORIGIN）が、
// 公式の埋め込み用の住所（末尾に /embed）は出せる。予約が終わると postMessage で知らせが来る。
// Spir は埋め込みを一切許していない（frame-ancestors 'none'）ので、ここでは扱わない。

const TIMEREX_RE = /https:\/\/timerex\.net\/s\/[A-Za-z0-9._-]+\/[A-Za-z0-9_-]+/;

export function timerexUrlOf(text) {
  const m = String(text || '').match(TIMEREX_RE);
  return m ? m[0] : null;
}

export function timerexEmbedUrl(url) {
  const base = timerexUrlOf(url);
  return base ? `${base}/embed` : null;
}

export default function TimeRexEmbed({ url, label, defaultOpen = false, onBooked }) {
  const src = timerexEmbedUrl(url);
  const [open, setOpen] = useState(defaultOpen);
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onMessage = (e) => {
      if (e.origin !== 'https://timerex.net') return;
      if (e.data?.timerex?.target_event === 'onBookingComplete') {
        setBooked(true);
        if (onBooked) onBooked();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, onBooked]);

  if (!src) return null;

  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.lg, overflow: 'hidden', background: color.white }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: alpha(color.navyLight, 0.08), borderBottom: open ? `1px solid ${color.border}` : 'none' }}>
        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy, flex: 1 }}>{label || 'TimeRex'}</span>
        <a href={timerexUrlOf(url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: color.textMid }}>別タブで開く</a>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{ fontSize: 10, padding: '3px 10px', background: color.navy, color: color.white, border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontWeight: font.weight.semibold }}
        >
          {open ? '閉じる' : 'ここで開く'}
        </button>
      </div>
      {booked && (
        <div style={{ padding: '6px 10px', fontSize: font.size.xs, color: color.success, background: color.successSoft }}>
          TimeRexで予約が完了しました。アポ取得報告を書いてください。
        </div>
      )}
      {open && (
        <iframe
          title={label || 'TimeRex'}
          src={src}
          style={{ display: 'block', width: '100%', height: 640, border: 'none' }}
        />
      )}
    </div>
  );
}
