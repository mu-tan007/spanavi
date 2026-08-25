import { supabase } from './supabase';

// 架電録音の再生URLを解決する
// -----------------------------------------------------------------------------
// 置き場所を Supabase Storage から Cloudflare R2 へ移している（2026-08-23）。
// 組織のストレージが100GBを超えたため。録音だけで80GB / 150,800件ある。
//
// ⚠️ DBに入っているのは**公開URL**（.../object/public/recordings/xxx.m4a）。
//    14.8万行あるので書き換えない。URLの後ろがそのままファイルの位置なので、
//    再生するときに切り出して R2 に問い合わせる。
//
// ⚠️ 公開バケットのままだと、URLさえ知っていればログイン無しで通話を聴ける。
//    移送が済んだら非公開に切り替える。切り替えても、この解決を通していれば
//    署名付きURLに落ちるので再生は止まらない。
//
// 探す順番
//   1. R2（移送済みのもの。ほぼ全部ここで当たる）
//   2. Supabase の署名付きURL（まだ移していないもの・非公開化後も効く）
//   3. どちらにも無ければ null

const PUBLIC_MARK = '/storage/v1/object/public/recordings/';
// 2026-08-25 追加。旧形式は非公開化以降ブラウザで開くと400になり、
// アポ取得報告に貼って先方へ送っていたぶんが全部再生できなかった。
// これから保存するURLは、押せばその場で署名して転送する rec の形にする。
// どちらも「鍵の入れ物」であることは同じなので、ここは取り出し方を増やすだけ。
const SHARE_MARK = '/functions/v1/rec/';

// 出した署名を覚えておく（1時間有効なので作り直す必要がない）。
// ⚠️ 押すたびにEdge Functionを呼ぶと、そのたびに起動と権限確認の待ちが入る。
const signedCache = new Map();
const BUCKET = 'recordings';

/** URLからファイルの位置を取り出す。録音の鍵を包んだURLでなければ null。 */
export function recordingKeyOf(url) {
  if (!url || typeof url !== 'string') return null;
  for (const mark of [PUBLIC_MARK, SHARE_MARK]) {
    const i = url.indexOf(mark);
    if (i < 0) continue;
    const raw = url.slice(i + mark.length).split('?')[0];
    if (!raw) continue;
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return null;
}

/**
 * 再生に使えるURLを返す。
 *
 * 録音バケット以外のURL（Zoomの録音など）はそのまま返す。
 * 呼び出し側がこれまでどおり get-zoom-recording を通す。
 */
export async function resolveRecordingUrl(url) {
  const key = recordingKeyOf(url);
  if (!key) return { url, gone: false, external: true };

  // 一度出した署名は1時間有効。同じ録音を押し直すたびに作り直さない。
  const cached = signedCache.get(key);
  if (cached && cached.until > Date.now()) return { url: cached.url, gone: false, external: false };

  const t0 = performance.now();
  const { data: r2, error: r2err } = await supabase.functions.invoke('r2', {
    body: { action: 'sign-get', kind: 'recordings', key, expires: 3600 },
  });
  const ms = Math.round(performance.now() - t0);
  console.info(`[録音] 署名の取得 ${ms}ms`, r2err ? '（失敗）' : '');

  if (!r2err && r2?.ok && r2.url) {
    // 期限より少し手前で捨てる
    signedCache.set(key, { url: r2.url, until: Date.now() + 50 * 60 * 1000 });
    return { url: r2.url, gone: false, external: false };
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, 3600);
  if (!error && data?.signedUrl) {
    console.warn('[recordingUrl] R2にまだ無いのでSupabaseの署名を使います:', key);
    return { url: data.signedUrl, gone: false, external: false };
  }

  console.error('[recordingUrl] どちらにも見つかりません:', key, r2err ?? r2, error);
  return { url: null, gone: true, external: false };
}
