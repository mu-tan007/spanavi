// Singleton store for Zoom Phone Smart Embed actions & active call state.
//
// Flow:
//   ZoomPhoneEmbed.onLoad  → postMessage zp-init-config
//   Zoom iframe            → postMessage zp-ready  → zoomPhone.setReady(true)
//   CallingScreen / CallFlowView / dialPhone → zoomPhone.makeCall(number)
//   CallingScreen / CallFlowView (status btn) → zoomPhone.hangUp()
//
// Active Call Events (Smart Embed → zoomPhoneStore):
//   zp-call-ringing-event   → _activeCall updated (status: 'ringing')
//   zp-call-connected-event → _activeCall updated (status: 'connected')
//   zp-call-ended-event     → _activeCall cleared

const ZOOM_ORIGIN = 'https://applications.zoom.us';
const IFRAME_ID   = 'zoom-embeddable-phone-iframe';

let _ready = false;
let _activeCall = null;     // { callId, direction, caller, callee, status, startedAt, connectedAt }
let _listeners = [];        // onChange callbacks

function postToZoom(msg) {
  const iframe = document.getElementById(IFRAME_ID);
  if (!iframe) {
    console.warn('[zoomPhone] iframe#' + IFRAME_ID + ' が見つかりません');
    return;
  }
  iframe.contentWindow?.postMessage(msg, ZOOM_ORIGIN);
}

function _notify() {
  _listeners.forEach(fn => { try { fn(_activeCall); } catch (e) { console.error('[zoomPhone] listener error:', e); } });
}

export const zoomPhone = {
  setReady(val) {
    _ready = val;
    console.log('[zoomPhone] ready:', val);
  },

  makeCall(number) {
    if (!_ready) console.warn('[zoomPhone] makeCall — zp-ready 未受信（発信を試みます）');
    console.log('[zoomPhone] makeCall:', number);
    postToZoom({ type: 'zp-make-call', data: { number, autoDial: true } });
  },

  hangUp() {
    console.log('[zoomPhone] hangUp called');
    postToZoom({ type: 'zp-end-call' });
  },

  // ── Active Call State ──────────────────────────────────────────
  getActiveCall() {
    return _activeCall;
  },

  onCallRinging(data) {
    _activeCall = {
      callId: data.callId || data.call_id || null,
      direction: data.direction || 'outbound',
      caller: data.caller || null,
      callee: data.callee || null,
      status: 'ringing',
      startedAt: new Date().toISOString(),
      connectedAt: null,
    };
    console.log('[zoomPhone] 📞 ringing:', _activeCall);
    _notify();
  },

  onCallConnected(data) {
    if (_activeCall) {
      _activeCall = { ..._activeCall, status: 'connected', connectedAt: new Date().toISOString() };
      if (data.callId || data.call_id) _activeCall.callId = data.callId || data.call_id;
    } else {
      _activeCall = {
        callId: data.callId || data.call_id || null,
        direction: data.direction || 'outbound',
        caller: data.caller || null,
        callee: data.callee || null,
        status: 'connected',
        startedAt: new Date().toISOString(),
        connectedAt: new Date().toISOString(),
      };
    }
    console.log('[zoomPhone] 🟢 connected:', _activeCall);
    _notify();
  },

  onCallEnded(data) {
    console.log('[zoomPhone] 🔴 ended:', _activeCall, data);
    _activeCall = null;
    _notify();
  },

  // Subscribe to active call changes
  subscribe(fn) {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  },
};
