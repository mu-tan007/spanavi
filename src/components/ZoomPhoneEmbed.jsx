import { useEffect, useRef, useState } from 'react';
import { zoomPhone } from '../lib/zoomPhoneStore';

const ZOOM_EMBED_URL = 'https://applications.zoom.us/integration/phone/embeddablephone/home';
const ZOOM_ORIGIN   = 'https://applications.zoom.us';
const IFRAME_ID     = 'zoom-embeddable-phone-iframe';

export default function ZoomPhoneEmbed() {
  const iframeRef = useRef(null);
  const [minimized, setMinimized] = useState(false);
  const [ready, setReady] = useState(false);

  // iframeロード時: zp-init-config を送信してソフトフォンを初期化
  const handleLoad = () => {
    console.log('[ZoomPhoneEmbed] iframe loaded → zp-init-config 送信');
    iframeRef.current?.contentWindow?.postMessage({ type: 'zp-init-config' }, ZOOM_ORIGIN);
  };

  // iframeからのメッセージを監視
  useEffect(() => {
    const handler = (e) => {
      // 全メッセージをログ出力（デバッグ用）
      console.log('[Zoom postMessage]', e.origin, e.data);

      if (e.origin !== ZOOM_ORIGIN) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;

      const type = msg.type ?? '';
      console.log('[Zoom postMessage] origin=ZOOM / type:', type, '/ data:', msg);

      if (type === 'zp-ready') {
        console.log('[Zoom postMessage] 🟢 zp-ready 受信 — 発信可能');
        zoomPhone.setReady(true);
        setReady(true);
      }

      if (type === 'zp-end-call' || type === 'zp-call-ended') {
        console.log('[Zoom postMessage] 🔴 通話終了');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 100000,
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
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          Zoom Phone{ready ? ' ✓' : ''}
        </span>
        <span style={{ fontSize: 14 }}>{minimized ? '▲' : '▼'}</span>
      </div>
      <iframe
        ref={iframeRef}
        id={IFRAME_ID}
        src={ZOOM_EMBED_URL}
        onLoad={handleLoad}
        style={{ width: '100%', height: 'calc(100% - 40px)', border: 'none', display: minimized ? 'none' : 'block' }}
        allow="microphone; camera; autoplay"
        title="Zoom Phone"
      />
    </div>
  );
}
