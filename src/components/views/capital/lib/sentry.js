// Sentry は Spanavi 統合時は無効化。stub を提供する。
export function initSentry() { /* noop */ }
export function setSentryUser() { /* noop */ }
export const Sentry = {
  captureException: (e) => console.error('[capital Sentry stub]', e),
  captureMessage: (m) => console.log('[capital Sentry stub]', m),
  setUser: () => {},
  setTag: () => {},
};
