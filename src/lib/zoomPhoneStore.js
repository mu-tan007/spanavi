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
let _callerId = null;       // 発信元番号(自分のZoom電話番号)。2026-03-16以降 zp-make-call で必須

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

  // 発信元番号(callerId)を設定。Smart Embed発信で必須(2026-03-16〜)。
  // ZoomはE.164形式(+81…)を期待するため、国内表記(03-xxxx-xxxx)を正規化する。
  setCallerId(id) {
    let v = id ? String(id).replace(/[-\s()]/g, '') : null;
    if (v && v.startsWith('0')) v = '+81' + v.slice(1);
    _callerId = v;
    console.log('[zoomPhone] callerId set:', _callerId ?? '(なし)');
  },

  makeCall(number) {
    if (!_ready) console.warn('[zoomPhone] makeCall — zp-ready 未受信（発信を試みます）');
    const data = { number, autoDial: true };
    if (_callerId) data.callerId = _callerId; // 未指定だと "No available callerId" で発信失敗
    else console.warn('[zoomPhone] makeCall — callerId 未設定。Zoom仕様で発信失敗の可能性');
    console.log('[zoomPhone] makeCall:', number, '/ callerId:', _callerId ?? '(なし)');
    postToZoom({ type: 'zp-make-call', data });
  },

  // 注: Zoomデスクトップアプリ(zoomphonecall://)で発信した進行中通話を
  // プログラムから切る確実な手段は現状ない（REST APIに live-call hangup は存在せず、
  // Smart Embed発信も無効化済み）。ここは埋め込み利用時向けの postMessage のみ残す。
  // 自動切電は別途 Call Control API 等の検討課題。引数は後方互換のため受けるが未使用。
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
