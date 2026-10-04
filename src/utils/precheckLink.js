// #事前確認 の通知に付けたリンク（?precheck=<アポID> / ?tab=precheck）。
// ログイン画面や /dashboard への移動で URL の後ろが消えるため、起動のいちばん最初に控えておき、
// 架電リストが読み込めた後に SpanaviApp が1回だけ取り出す。
const KEY = 'spanavi_precheck_link_v1';

export function stashPrecheckLink() {
  try {
    const url = new URL(window.location.href);
    const appoId = url.searchParams.get('precheck');
    const tab = url.searchParams.get('tab');
    if (!appoId && tab !== 'precheck') return;
    sessionStorage.setItem(KEY, JSON.stringify({ appoId: appoId || null, tab: tab === 'precheck' ? 'precheck' : null }));
    url.searchParams.delete('precheck');
    if (tab === 'precheck') url.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* 控えられなくても通常どおり起動する */ }
}

export function takePrecheckLink() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
