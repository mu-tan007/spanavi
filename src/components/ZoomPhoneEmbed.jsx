import { useEffect, useRef, useState } from 'react';
import { zoomPhone } from '../lib/zoomPhoneStore';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

const ZOOM_EMBED_URL = 'https://applications.zoom.us/integration/phone/embeddablephone/home';
const ZOOM_ORIGIN   = 'https://applications.zoom.us';
const IFRAME_ID     = 'zoom-embeddable-phone-iframe';

export default function ZoomPhoneEmbed({ currentUser = '' }) {
  const iframeRef = useRef(null);
  const [minimized, setMinimized] = useState(false);
  const [ready, setReady] = useState(false);

  // iframeロード時: zp-init-config を送信してソフトフォンを初期化
  const handleLoad = () => {
    console.log('[ZoomPhoneEmbed] iframe loaded → zp-init-config 送信');
    iframeRef.current?.contentWindow?.postMessage({ type: 'zp-init-config' }, ZOOM_ORIGIN);
  };

  // active_callsテーブルにINSERT/UPDATE
  const upsertActiveCall = async (callData, status) => {
    const orgId = getOrgId();
    if (!orgId) return;

    const callId = callData.callId || callData.call_id;
    if (!callId) return;

    const calleeNumber = callData.callee?.phone_number || callData.callee?.phoneNumber || '';
    const calleeName = callData.callee?.display_name || callData.callee?.name || '';
    const callerName = currentUser || callData.caller?.display_name || callData.caller?.name || '';

    if (status === 'ringing' || status === 'connected') {
      // 既存レコードを探す
      const { data: existing } = await supabase
        .from('active_calls')
        .select('id')
        .eq('zoom_call_id', callId)
        .limit(1);

      if (existing?.length > 0) {
        // UPDATE
        const update = { call_status: status };
        if (status === 'connected') update.connected_at = new Date().toISOString();
        await supabase.from('active_calls').update(update).eq('zoom_call_id', callId);
      } else {
        // INSERT
        await supabase.from('active_calls').insert({
          org_id: orgId,
          zoom_call_id: callId,
          caller_name: callerName,
          callee_number: calleeNumber,
          callee_name: calleeName,
          call_status: status,
          direction: callData.direction || 'outbound',
          started_at: new Date().toISOString(),
          connected_at: status === 'connected' ? new Date().toISOString() : null,
        });
      }
    } else if (status === 'ended') {
      await supabase
        .from('active_calls')
        .update({ call_status: 'ended', ended_at: new Date().toISOString() })
        .eq('zoom_call_id', callId);
    }
  };

  // iframeからのメッセージを監視
  useEffect(() => {
    const handler = (e) => {
      if (e.origin !== ZOOM_ORIGIN) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;

      const type = msg.type ?? '';

      if (type === 'zp-ready') {
        console.log('[ZoomPhoneEmbed] 🟢 zp-ready 受信 — 発信可能');
        zoomPhone.setReady(true);
        setReady(true);
      }

      if (type === 'zp-call-ringing-event') {
        console.log('[ZoomPhoneEmbed] 📞 ringing event:', msg.data);
        zoomPhone.onCallRinging(msg.data || msg);
        upsertActiveCall(msg.data || msg, 'ringing');
      }

      if (type === 'zp-call-connected-event') {
        console.log('[ZoomPhoneEmbed] 🟢 connected event:', msg.data);
        zoomPhone.onCallConnected(msg.data || msg);
        upsertActiveCall(msg.data || msg, 'connected');
      }

      if (type === 'zp-call-ended-event' || type === 'zp-end-call' || type === 'zp-call-ended') {
        console.log('[ZoomPhoneEmbed] 🔴 ended event:', msg.data);
        const callData = msg.data || msg;
        zoomPhone.onCallEnded(callData);
        // call_idがある場合のみDB更新（zp-end-callはcallIdなしの場合がある）
        if (callData.callId || callData.call_id) {
          upsertActiveCall(callData, 'ended');
        }
      }

      if (type === 'zp-call-log-completed-event') {
        console.log('[ZoomPhoneEmbed] 📋 call log completed:', msg.data);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

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
