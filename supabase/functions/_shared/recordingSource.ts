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

const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}
async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

/** 公開URLからファイルの位置を取り出す。録音バケットのURLでなければ null。 */
export function recordingKeyOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_MARK);
  if (i < 0) return null;
  const raw = url.slice(i + PUBLIC_MARK.length).split('?')[0];
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/** R2 の署名付きGET URL。設定が無ければ null。 */
export async function r2SignedGet(key: string, expires = 600): Promise<string | null> {
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

  const canonical = ['GET', path, q, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  let k = await hmac(enc.encode('AWS4' + sk), dateStamp);
  k = await hmac(k, 'auto'); k = await hmac(k, 's3'); k = await hmac(k, 'aws4_request');
  return `https://${host}${path}?${q}&X-Amz-Signature=${hex(await hmac(k, toSign))}`;
}

/**
 * 実際に読めるURLに直す。
 * 録音バケット以外のURL（Zoom等）はそのまま返す。
 */
export async function resolveRecordingSource(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  recordingUrl: string,
): Promise<string> {
  const key = recordingKeyOf(recordingUrl);
  if (!key) return recordingUrl;

  const r2 = await r2SignedGet(key, 600);
  if (r2) {
    const probe = await fetch(r2, { method: 'HEAD' }).catch(() => null);
    if (probe?.ok) return r2;
  }

  const { data } = await supabase.storage.from('recordings').createSignedUrl(key, 600);
  if (data?.signedUrl) {
    console.warn('[recordingSource] R2にまだ無いのでSupabaseの署名を使います:', key);
    return data.signedUrl;
  }

  console.error('[recordingSource] どちらにも見つかりません:', key);
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
