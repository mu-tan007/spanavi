// Singleton store for Zoom Phone Smart Embed state and actions.
//
// Flow:
//   ZoomPhoneEmbed  → setCallId(id) when call connects, setCallId(null) when ends
//   ZoomPhoneEmbed  → register(fn)  registers the postMessage hangup fallback
//   CallingScreen / CallFlowView → hangUp() on status select
//
// hangUp() does two things in parallel:
//   1. Zoom Phone API  DELETE /v2/phone/calls/{callId}  (reliable, server-side)
//   2. postMessage to iframe  (best-effort fallback)
import { supabase } from './supabase';

const _store = {
  callId: null,
  iframeHangUp: null,
};

export const zoomPhone = {
  setCallId(id) {
    _store.callId = id;
    console.log('[zoomPhone] callId:', id ?? '(cleared)');
  },

  register(fn) {
    _store.iframeHangUp = fn;
  },

  hangUp() {
    // 1. postMessage to iframe (best-effort)
    _store.iframeHangUp?.();

    // 2. Zoom Phone API DELETE (reliable) — only if we have a callId
    if (_store.callId) {
      supabase.functions
        .invoke('zoom-hangup', { body: { callId: _store.callId } })
        .then(({ data, error }) => {
          if (error) console.warn('[zoomPhone] hangup API error:', error);
          else console.log('[zoomPhone] hangup API result:', data);
        })
        .catch(e => console.warn('[zoomPhone] hangup invoke error:', e));
      _store.callId = null;
    }
  },
};
