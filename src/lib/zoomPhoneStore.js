// Singleton store for Zoom Phone Smart Embed actions.
//
// Flow:
//   ZoomPhoneEmbed.onLoad  → postMessage zp-init-config
//   Zoom iframe            → postMessage zp-ready  → zoomPhone.setReady(true)
//   CallingScreen / CallFlowView / dialPhone → zoomPhone.makeCall(number)
//   CallingScreen / CallFlowView (status btn) → zoomPhone.hangUp()

const ZOOM_ORIGIN = 'https://applications.zoom.us';
const IFRAME_ID   = 'zoom-embeddable-phone-iframe';

let _ready = false;

function postToZoom(msg) {
  const iframe = document.getElementById(IFRAME_ID);
  if (!iframe) {
    console.warn('[zoomPhone] iframe#' + IFRAME_ID + ' が見つかりません');
    return;
  }
  iframe.contentWindow?.postMessage(msg, ZOOM_ORIGIN);
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
    console.log('[zoomPhone] hangUp → zp-end-call');
    postToZoom({ type: 'zp-end-call' });
  },
};
