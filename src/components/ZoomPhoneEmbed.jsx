import { useEffect, useRef, useState } from 'react';
import { zoomPhone } from '../lib/zoomPhoneStore';

const ZOOM_EMBED_URL = 'https://applications.zoom.us/integration/phone/embeddablephone/home';
const ZOOM_ORIGIN = 'https://applications.zoom.us';

// Zoom Smart Embed がiframeから送るイベントのフォーマットは複数パターンあるため
// callId をすべての既知フィールドパスから抽出する
function extractCallId(msg) {
  return (
    msg.callId ??
    msg.data?.callId ??
    msg.payload?.callId ??
    msg.data?.call_id ??
    msg.payload?.call_id ??
    null
  );
}

function extractEventType(msg) {
  return (
    msg.event ??
    msg.action ??
    msg.type ??
    msg.data?.event ??
    msg.payload?.action ??
    ''
  ).toLowerCase();
}

export default function ZoomPhoneEmbed() {
  const iframeRef = useRef(null);
  const [minimized, setMinimized] = useState(false);

  // postMessage hangup fallback（callId不明時のみ有効）
  useEffect(() => {
    zoomPhone.register(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'hangup' },
        ZOOM_ORIGIN,
      );
    });
    return () => zoomPhone.register(null);
  }, []);

  // iframeからのイベントを監視してcallIdを取得する
  useEffect(() => {
    const handler = (e) => {
      if (e.origin !== ZOOM_ORIGIN) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;

      const callId = extractCallId(msg);
      const ev = extractEventType(msg);

      // 通話開始系イベント → callIdを保存
      if (callId && (
        ev.includes('connect') ||
        ev.includes('start') ||
        ev.includes('incoming') ||
        ev.includes('answered') ||
        ev.includes('in_call')
      )) {
        zoomPhone.setCallId(callId);
      }

      // 通話終了系イベント → callIdをクリア
      if (ev.includes('end') || ev.includes('disconnect') || ev.includes('hangup')) {
        zoomPhone.setCallId(null);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      border: '1px solid #E5E7EB',
      width: minimized ? 200 : 320,
      height: minimized ? 40 : 480,
      background: '#fff',
      transition: 'width 0.2s, height 0.2s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 10px', height: 40, background: '#0D2247', color: '#fff',
        cursor: 'pointer', userSelect: 'none', flexShrink: 0,
      }} onClick={() => setMinimized(m => !m)}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Zoom Phone</span>
        <span style={{ fontSize: 14 }}>{minimized ? '▲' : '▼'}</span>
      </div>
      {!minimized && (
        <iframe
          ref={iframeRef}
          src={ZOOM_EMBED_URL}
          style={{ width: '100%', height: 'calc(100% - 40px)', border: 'none', display: 'block' }}
          allow="microphone; camera; autoplay"
          title="Zoom Phone"
        />
      )}
    </div>
  );
}
