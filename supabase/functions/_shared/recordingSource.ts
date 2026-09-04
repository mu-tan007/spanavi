// 録音の実体を読むためのURLを返す（サーバー側で使う）
// ---------------------------------------------------------------------------
// 録音の置き場を Supabase Storage から Cloudflare R2 へ移した（2026-08-23）。
// DBに入っているのは移設前の**公開URL**なので、そのまま fetch すると
// バケットを非公開にした時点で読めなくなる。
//
// ⚠️ 公開URLは「鍵の入れ物」として扱う。
//    /storage/v1/object/public/recordings/ より後ろがファイルの位置。
//    R2 → Supabaseの署名付き の順で探し直す。
//
// Zoom の録音URLなど、録音バケット以外はそのまま返す（呼ぶ側が今までどおり扱う）。

const PUBLIC_MARK = '/storage/v1/object/public/recordings/';
const SHARE_MARK = '/functions/v1/rec/';

const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}
async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

/**
 * URLからファイルの位置を取り出す。録音の鍵を包んだURLでなければ null。
 *
 * 2つの形がある。どちらも「鍵の入れ物」で、意味は同じ。
 *   旧 .../storage/v1/object/public/recordings/<鍵>   移設前の公開URL。14.8万行あるので残す
 *   新 .../functions/v1/rec/<鍵>?s=<署名>             押せば再生できる（下の recShareUrl）
 */
export function recordingKeyOf(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const mark of [PUBLIC_MARK, SHARE_MARK]) {
    const i = url.indexOf(mark);
    if (i < 0) continue;
    const raw = url.slice(i + mark.length).split('?')[0];
    if (!raw) continue;
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return null;
}

/* ===================== 外に配れる録音リンク ===================== */
//
// ⚠️ アポ取得報告に貼る録音URLは、**先方がそのまま押す**。
//    移設前は公開バケットだったのでたまたま開けていたが、非公開にした
//    2026-08-24以降は旧形式のURLが必ず400になり、社外では1本も聴けなくなっていた
//    （社内は鍵を取り出して署名し直すので気づけなかった）。
//    これからDBに入れるURLは、押せば再生できるこの形にする。
//
// ⚠️ この形のURLは、持っていれば誰でも聴ける。相手先に自分の商談の録音を
//    渡すための口なので、それでよい。ただし鍵は名前で指定されるので、
//    **署名が無ければ他人の録音の名前を打ち込むだけで聴けてしまう**。必ず照合する。

/**
 * 署名に使う鍵。
 * ⚠️ **R2の鍵で代用しない**（2026-09-04 にフォールバックを外した）。
 *    代用すると、R2の資格情報を入れ替えた瞬間に
 *    外へ配った録音リンクが一本残らず無効になる。鍵の入れ替えは普通の運用なので、
 *    いつか必ず踏む。REC_SHARE_SECRET は独立した値として持つ。
 */
function shareSecret(): string {
  return Deno.env.get('REC_SHARE_SECRET') ?? '';
}

/**
 * 鍵に対する署名。
 * ⚠️ この署名鍵を変えると、**すでに配ったリンクは全部無効になる**。
 *    裏を返せば、これが唯一の一括失効の手段。
 */
export async function recShareSig(key: string): Promise<string> {
  const secret = shareSecret();
  if (!secret || !key) return '';
  return hex(await hmac(enc.encode(secret), `rec-share:${key}`)).slice(0, 32);
}

/** 先方に渡せる録音URL。設定が足りなければ空を返す（呼ぶ側で旧来の値を使う）。 */
export async function recShareUrl(key: string): Promise<string> {
  const base = Deno.env.get('SUPABASE_URL');
  const sig = await recShareSig(key);
  if (!base || !sig) return '';
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `${base}${SHARE_MARK}${path}?s=${sig}`;
}

/**
 * R2 の署名付きURL。設定が無ければ null。
 *
 * ⚠️ 署名には**メソッドそのものが含まれる**。GET用に作ったURLへHEADを投げると
 *    署名が合わず必ず403が返る。存在確認をHEADでやるなら、HEAD用に署名し直すこと。
 *    （GET用の署名でHEADを叩いていたため「R2に無い」と誤判定していた。2026-08-24 修正）
 */
async function r2Presign(method: 'GET' | 'HEAD', key: string, expires: number): Promise<string | null> {
  const account = Deno.env.get('R2_ACCOUNT_ID');
  const ak = Deno.env.get('R2_ACCESS_KEY_ID');
  const sk = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('R2_BUCKET_RECORDINGS');
  if (!account || !ak || !sk || !bucket || !key) return null;

  const e = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${key.split('/').map(e).join('/')}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const q = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${ak}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ].map(([k, v]) => `${e(k)}=${e(v)}`).join('&');

  const canonical = [method, path, q, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  let k = await hmac(enc.encode('AWS4' + sk), dateStamp);
  k = await hmac(k, 'auto'); k = await hmac(k, 's3'); k = await hmac(k, 'aws4_request');
  return `https://${host}${path}?${q}&X-Amz-Signature=${hex(await hmac(k, toSign))}`;
}

/**
 * R2 の署名付きURL。設定が無ければ null。
 * 存在確認をしたいときだけ method に 'HEAD' を渡す（GET用の署名では403になるため）。
 */
export async function r2SignedGet(
  key: string, expires = 600, method: 'GET' | 'HEAD' = 'GET',
): Promise<string | null> {
  return await r2Presign(method, key, expires);
}

/**
 * 実際に読めるURLに直す。
 * 録音バケット以外のURL（Zoom等）はそのまま返す。
 */
export async function resolveRecordingSource(
  // ⚠️ 使っていない。Supabase Storage への回り道を外した名残（2026-09-04）。
  //    呼び出し元4か所の形を変えないために引数だけ残してある。
  // deno-lint-ignore no-explicit-any
  _supabase: any,
  recordingUrl: string,
): Promise<string> {
  const key = recordingKeyOf(recordingUrl);
  if (!key) return recordingUrl;

  const r2 = await r2SignedGet(key, 600);
  if (r2) {
    // 存在確認は**HEAD用に署名し直したURL**で行う（GET用の署名では403になる）。
    const probeUrl = await r2Presign('HEAD', key, 60);
    const probe = probeUrl ? await fetch(probeUrl, { method: 'HEAD' }).catch(() => null) : null;
    if (probe?.ok) return r2;
  }

  // ⚠️ かつてここに Supabase Storage の署名付きURLへ回る道があったが、外した
  //    （2026-09-04）。recordings バケットは移設後に消してあり、`NoSuchBucket`
  //    しか返らない。成功しうる道ではないので、残すと読む人を惑わせる。
  console.error('[recordingSource] R2に見つかりません:', key);
  return recordingUrl;
}

/** R2 に直接置く。移送用ではなく、録音の保存そのものに使う。 */
export async function r2PutFromBuffer(
  key: string, body: ArrayBuffer | Uint8Array, contentType = 'audio/mp4',
): Promise<{ ok: boolean; status: number; body: string }> {
  const account = Deno.env.get('R2_ACCOUNT_ID');
  const ak = Deno.env.get('R2_ACCESS_KEY_ID');
  const sk = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('R2_BUCKET_RECORDINGS');
  if (!account || !ak || !sk || !bucket) {
    return { ok: false, status: 0, body: 'R2の設定がありません' };
  }

  const e = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${key.split('/').map(e).join('/')}`;
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  const canonical = [
    'PUT', path, '',
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`,
    'host;x-amz-content-sha256;x-amz-date',
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  let k = await hmac(enc.encode('AWS4' + sk), dateStamp);
  k = await hmac(k, 'auto'); k = await hmac(k, 's3'); k = await hmac(k, 'aws4_request');
  const sig = hex(await hmac(k, toSign));

  const res = await fetch(`https://${host}${path}`, {
    method: 'PUT',
    headers: {
      host,
      'content-type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`,
    },
    body: bytes,
  });
  return { ok: res.ok, status: res.status, body: res.ok ? '' : (await res.text()).slice(0, 200) };
}
