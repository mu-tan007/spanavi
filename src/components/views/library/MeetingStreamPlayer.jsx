import { useEffect, useRef } from 'react';
import { saveWeeklyMeetingWatchSegment } from '../../../lib/supabaseWrite';

// Cloudflare Stream の埋め込みプレーヤー。再生位置を見て「何秒から何秒まで見たか」を記録する。
// 続けて再生している間は1区間を伸ばし、シークで飛んだら新しい区間にする。
const SDK_URL = 'https://embed.cloudflarestream.com/embed/sdk.latest.js';
// timeupdate は約0.25秒ごと。2倍速でも0.5秒なので、これを超えて進んだら飛ばしたとみなす
const JUMP_SEC = 3;
const FLUSH_MS = 10000;

let sdkPromise = null;
function loadStreamSdk() {
  if (window.Stream) return Promise.resolve(window.Stream);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = () => resolve(window.Stream);
      s.onerror = () => { sdkPromise = null; reject(new Error('stream sdk load failed')); };
      document.head.appendChild(s);
    });
  }
  return sdkPromise;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'その他';
  return `${os}${/Mobile/.test(ua) ? '・スマホ' : ''}`;
}

export default function MeetingStreamPlayer({ src, title, videoId }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    let player = null;
    let seg = null;       // { id, start, end, startedAt }
    let dirty = false;
    let cancelled = false;
    const device = deviceLabel();

    const flush = () => {
      if (!seg || !dirty) return;
      const s = Math.floor(seg.start), e = Math.floor(seg.end);
      if (e - s < 1) return;
      dirty = false;
      saveWeeklyMeetingWatchSegment({ id: seg.id, videoId, startSec: s, endSec: e, startedAt: seg.startedAt, device });
    };
    const close = () => { flush(); seg = null; };

    const onTime = () => {
      if (!player || player.paused) return;
      const t = Number(player.currentTime) || 0;
      if (seg && t >= seg.end && t - seg.end <= JUMP_SEC) {
        seg.end = t; dirty = true;
        return;
      }
      close();
      seg = { id: crypto.randomUUID(), start: t, end: t, startedAt: new Date().toISOString() };
    };
    const onPause = () => close();
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const timer = setInterval(flush, FLUSH_MS);

    loadStreamSdk().then((Stream) => {
      if (cancelled || !iframeRef.current || !Stream) return;
      player = Stream(iframeRef.current);
      player.addEventListener('timeupdate', onTime);
      player.addEventListener('pause', onPause);
      player.addEventListener('ended', onPause);
      player.addEventListener('seeking', onPause);
    }).catch((e) => console.warn('[MeetingStreamPlayer]', e));
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      close();
      if (player) {
        player.removeEventListener('timeupdate', onTime);
        player.removeEventListener('pause', onPause);
        player.removeEventListener('ended', onPause);
        player.removeEventListener('seeking', onPause);
      }
    };
  }, [src, videoId]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} />
  );
}
