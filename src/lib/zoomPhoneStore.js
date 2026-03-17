// Singleton store for Zoom Phone Smart Embed actions.
// ZoomPhoneEmbed registers its hangUp implementation here;
// CallingScreen / CallFlowView call zoomPhone.hangUp() on status select.
const _store = { hangUp: null };

export const zoomPhone = {
  register(fn) { _store.hangUp = fn; },
  hangUp() { _store.hangUp?.(); },
};
