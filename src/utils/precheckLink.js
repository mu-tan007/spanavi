// 通知に付けたリンクを、起動のいちばん最初に控えておく。
//   ?precheck=<アポID>              #事前確認 の通知 → その企業の架電ページ
//   ?tab=precheck                   旧「事前確認」画面の送信待ち → 案件 > 報告（全クライアント様）
//   ?open=reports&client=<顧客ID>   周回報告の通知 → 案件 > 報告（そのクライアント様）
// ログイン画面や /dashboard への移動で URL の後ろが消えるため sessionStorage に控え、
// データが読み込めた後に SpanaviApp が1回だけ取り出す。
const KEY = 'spanavi_precheck_link_v1';

export function stashPrecheckLink() {
  try {
    const url = new URL(window.location.href);
    const appoId = url.searchParams.get('precheck');
    const tab = url.searchParams.get('tab');
    const open = url.searchParams.get('open');
    const reports = tab === 'precheck' || open === 'reports';
    if (!appoId && !reports) return;
    const clientId = open === 'reports' ? url.searchParams.get('client') : null;
    sessionStorage.setItem(KEY, JSON.stringify({ appoId: appoId || null, reports, clientId }));
    url.searchParams.delete('precheck');
    if (tab === 'precheck') url.searchParams.delete('tab');
    if (open === 'reports') { url.searchParams.delete('open'); url.searchParams.delete('client'); }
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
