// M&Aニュースは Phalanx が取り込んだものを読む（2026-10-07 むー様決定。AIの読み取りの費用を二重にしない）。
// Phalanx 側の ma_news_public_feed / ma_news_public_summary は、東証の適時開示（公開情報）だけを返す読み取り専用の入口。
// 下の鍵は Phalanx の公開用の鍵（ブラウザに出してよいもの）。書き込みはできない。
const PHALANX_URL = 'https://rdpznbnesomrchehuarj.supabase.co';
const PHALANX_PUBLISHABLE_KEY = 'sb_publishable_iwIXvhldfW2fu1o-R0l8dA_zzjnerlD';

async function rpc(name, body, signal) {
  const res = await fetch(`${PHALANX_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: PHALANX_PUBLISHABLE_KEY, Authorization: `Bearer ${PHALANX_PUBLISHABLE_KEY}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`M&Aニュースを読めませんでした（${res.status}）`);
  return res.json();
}

export function fetchMaNewsFeed({ days = 60, kind = null, q = '', limit = 50, offset = 0, sort = 'new' } = {}, signal) {
  return rpc('ma_news_public_feed', { p_days: days, p_kind: kind, p_q: q || null, p_limit: limit, p_offset: offset, p_sort: sort }, signal);
}

export function fetchMaNewsSummary(days = 30, signal) {
  return rpc('ma_news_public_summary', { p_days: days }, signal);
}
