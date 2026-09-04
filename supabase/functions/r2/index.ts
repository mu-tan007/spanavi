// Cloudflare R2 との受け渡し
// ---------------------------------------------------------------------------
// 講義録画と架電録音の置き場を Supabase Storage から R2 へ移すために置く。
// R2 は S3 互換なので、AWS 署名 v4 を自前で作って叩く。
//
// ⚠️ 署名付きURLは、持っていれば誰でも中身を取れる。
//    なので**発行するときに、その人がそのファイルを見てよいかを必ず確かめる**。
//    verify_jwt=true だけでは足りない（ログインさえしていれば
//    他社の動画の鍵を名前で指定して取れてしまう）。
//
// ⚠️ 移送は Cloudflare の Data migration（Super Slurper）を使おうとして断念した。
//    あちらは署名のリージョンを指定できず、Supabase が求める ap-northeast-2 と
//    合わせられないため Preconnectivity で必ず落ちる（2026-08-23 確認）。
//    代わりに migrate で1件ずつ流す。こちらは新しい鍵もリージョンも要らない。

// ⚠️ supabase-js は**入口では読み込まない**。
//    再生のたびに呼ばれる sign-get で、起動のたびにこの大きな依存を
//    読み込むと待ち時間になる。移送など重い口でだけ動的に読む。
type SB = { storage: { from: (b: string) => { createSignedUrl: (p: string, e: number) => Promise<{ data?: { signedUrl?: string }; error?: { message?: string } }>; remove: (p: string[]) => Promise<{ error?: { message?: string } }> } }; rpc: (n: string, a: unknown) => Promise<{ data?: unknown; error?: { message?: string } }> };

const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buf = typeof data === 'string' ? enc.encode(data) : data;
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)));
}

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} が設定されていません`);
  return v;
}

// 用途ごとにバケットを分けてある。保存期間が違うため。
function bucketOf(kind: string): string {
  if (kind === 'spacareer') return env('R2_BUCKET_SPACAREER');
  if (kind === 'recordings') return env('R2_BUCKET_RECORDINGS');
  throw new Error(`知らない置き場です: ${kind}`);
}

async function signingKey(sk: string, dateStamp: string): Promise<Uint8Array> {
  let k = await hmac(enc.encode('AWS4' + sk), dateStamp);
  k = await hmac(k, 'auto');
  k = await hmac(k, 's3');
  return await hmac(k, 'aws4_request');
}

const uriEncode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encodePath = (key: string) => key.split('/').map(uriEncode).join('/');

async function signedFetch(
  method: string, bucket: string, key: string, body?: Uint8Array, query = '',
): Promise<Response> {
  const account = env('R2_ACCOUNT_ID');
  const ak = env('R2_ACCESS_KEY_ID');
  const sk = env('R2_SECRET_ACCESS_KEY');
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}${key ? '/' + encodePath(key) : ''}`;

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body ?? new Uint8Array());

  const canonical = [
    method, path, query,
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`,
    'host;x-amz-content-sha256;x-amz-date',
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  const sig = hex(await hmac(await signingKey(sk, dateStamp), toSign));

  return fetch(`https://${host}${path}${query ? '?' + query : ''}`, {
    method,
    headers: {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`,
    },
    body,
  });
}

// 署名付きURL。中身のハッシュを先に求めなくて済むので、
// 大きなファイルを**抱え込まずに流す**ことができる。
async function presign(
  method: 'GET' | 'PUT', bucket: string, key: string, expires = 3600,
  // ⚠️ 保存されている型を**渡すときだけ**上書きする。実体は書き換えない。
  //    response-content-* は署名の対象なので、必ず署名前に混ぜる。
  as?: { type: string; filename: string },
): Promise<string> {
  const account = env('R2_ACCOUNT_ID');
  const ak = env('R2_ACCESS_KEY_ID');
  const sk = env('R2_SECRET_ACCESS_KEY');
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${encodePath(key)}`;

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;

  // ⚠️ 署名v4は問い合わせを鍵の順に並べる必要がある。
  //    大文字が先なので X-Amz-* → response-* で正しい。
  const params: string[][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${ak}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (as) {
    params.push(['response-content-disposition', `inline; filename="${as.filename}"`]);
    params.push(['response-content-type', as.type]);
  }
  const q = params.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&');

  const canonical = [method, path, q, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  const sig = hex(await hmac(await signingKey(sk, dateStamp), toSign));

  return `https://${host}${path}?${q}&X-Amz-Signature=${sig}`;
}

async function admin(): Promise<SB> {
  const { createClient } = await import('jsr:@supabase/supabase-js@2');
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')) as unknown as SB;
}

// PostgREST を素の fetch で叩く。sign-get はこれだけで済むので supabase-js を読まない。
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

async function head(kind: string, key: string) {
  const bucket = bucketOf(kind);
  const res = await signedFetch('HEAD', bucket, key);
  return { ok: res.ok, status: res.status, size: res.headers.get('content-length') };
}

/* ===================== 保存期間（ライフサイクル） ===================== */

// 置き場ごとの保存期間をR2側に持たせる。日数はバケット全体にかかる。
//
// ⚠️ 期限の起点は**R2に置いた日**であって、収録した日ではない。
//    移設でまとめて置いたものは、まとめて切れる。
// ⚠️ 消えるのは実体（動画・音声）だけ。議事録や文字起こしはDBにあるので残る。
async function putLifecycle(kind: string, days: number) {
  const bucket = bucketOf(kind);
  const xml = '<LifecycleConfiguration>'
    + '<Rule>'
    + `<ID>expire-after-${days}-days</ID>`
    + '<Status>Enabled</Status>'
    + '<Filter><Prefix></Prefix></Filter>'
    + `<Expiration><Days>${days}</Days></Expiration>`
    + '</Rule>'
    + '</LifecycleConfiguration>';
  const res = await signedFetch('PUT', bucket, '', enc.encode(xml), 'lifecycle=');
  return { ok: res.ok, status: res.status, bucket, days, body: res.ok ? '' : (await res.text()).slice(0, 400) };
}

/**
 * 保存期間の規則を**消す**。
 * ⚠️ バケット全体にかかる。消すと、以後この置き場のものは自動削除されない。
 * ⚠️ 規則が入っているかは lifecycle-get では分からない（権限が無いと403）。
 *    **実体をGETしたときの `x-amz-expiration` ヘッダ**で確かめること。
 *    2026-09-04、403を「規則なし」と読んで判断を誤った。
 */
async function deleteLifecycle(kind: string) {
  const bucket = bucketOf(kind);
  const res = await signedFetch('DELETE', bucket, '', undefined, 'lifecycle=');
  return { ok: res.ok, status: res.status, bucket, xml: res.ok ? '' : (await res.text()).slice(0, 300) };
}

async function getLifecycle(kind: string) {
  const bucket = bucketOf(kind);
  const res = await signedFetch('GET', bucket, '', undefined, 'lifecycle=');
  return { ok: res.ok, status: res.status, bucket, xml: (await res.text()).slice(0, 800) };
}

/* ===================== 見てよいかの判定 ===================== */

// 呼んだ人のIDを取り出す。
// ⚠️ verify_jwt=true なので、ここに来ている時点で**署名は検証済み**。
//    auth.getUser() を呼ぶとネットワークの往復が1回増えるだけなので、
//    中身を読むだけにする。
function callerId(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  const part = tok.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = JSON.parse(json)?.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

// その鍵を、その人が見てよいか。DBへの往復は1回だけ。
// ⚠️ 鍵は名前で指定されるので、これが無いと他組織のものを取られる。
async function mayRead(uid: string, kind: string, key: string): Promise<boolean> {
  const r = await rpc('may_read_r2_key', { p_uid: uid, p_kind: kind, p_key: key });
  return r === true;
}

/* ===================== 口 ===================== */

async function check(kind: string) {
  const bucket = bucketOf(kind);
  const key = `_check/${Date.now()}.txt`;
  const out: Record<string, unknown> = { bucket };
  const put = await signedFetch('PUT', bucket, key, enc.encode('spanavi r2 check'));
  out.put = put.status;
  if (!put.ok) out.putBody = (await put.text()).slice(0, 300);
  const get = await signedFetch('GET', bucket, key);
  out.get = get.status;
  // ⚠️ **保存期間が入っているかは、ここで分かる。**
  //    lifecycle-get は権限が無いと403になり「規則なし」と誤読する（2026-09-04に踏んだ）。
  //    置いたばかりのファイルに x-amz-expiration が付けば、規則は生きている。
  out.expiration = get.headers.get('x-amz-expiration') ?? '（自動削除の規則なし）';
  out.body = (await get.text()).slice(0, 60);
  const list = await signedFetch('GET', bucket, '', undefined, 'list-type=2&max-keys=3');
  out.list = list.status;
  const del = await signedFetch('DELETE', bucket, key);
  out.delete = del.status;
  out.ok = put.ok && get.ok && list.ok && del.ok;
  return out;
}

// Supabase Storage の1ファイルを R2 へ流す。
// ⚠️ 中身を変数に受けてはいけない。1本1.4GBのものがあり、
//    Edge Function のメモリ上限で落ちる。body をそのまま渡して流す。
async function migrateOne(kind: string, srcBucket: string, path: string) {
  const bucket = bucketOf(kind);
  const sb = await admin();
  const { data, error } = await sb.storage.from(srcBucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    return { ok: false, path, error: `読み出しのURLを作れませんでした: ${error?.message ?? '?'}` };
  }
  const src = await fetch(data.signedUrl);
  if (!src.ok || !src.body) return { ok: false, path, error: `元ファイルを読めません: ${src.status}` };

  const size = src.headers.get('content-length');
  const type = src.headers.get('content-type') ?? 'application/octet-stream';
  const url = await presign('PUT', bucket, path, 3600);
  const headers: Record<string, string> = { 'content-type': type };
  if (size) headers['content-length'] = size;

  const put = await fetch(url, { method: 'PUT', headers, body: src.body, duplex: 'half' } as RequestInit);
  if (!put.ok) return { ok: false, path, status: put.status, error: (await put.text()).slice(0, 200) };

  // 入った大きさを元と照らし合わせる。途中で切れても200が返ることがあるため。
  const h = await head(kind, path);
  return { ok: size != null && h.size === size, path, srcSize: size, dstSize: h.size };
}

// 同時に何本まで流すか。
// ⚠️ 架電録音は150,800件・平均557kB。1件ずつ順に流すと16時間かかる。
//    小さいファイルでは1件あたりの往復（署名→読み→書き→照合）が支配的なので、
//    まとめて走らせないと終わらない。上げすぎるとメモリと帯域で詰まる。
const LANES = 24;

// 決めた数だけ同時に走らせながら、順番に片付けていく。
async function pooled<T, R>(items: T[], lanes: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, worker));
  return out;
}

/**
 * 名前の続きから決めた件数だけ移す。
 * 戻り値の after を次の呼び出しに渡せば続きから進む。
 * すでに同じ大きさでR2にあるものは飛ばすので、何度流しても二重にならない。
 */
async function migrateBatch(kind: string, srcBucket: string, limit: number, after: string | null) {
  const sb = await admin();
  const { data: rows, error } = await (sb as SB).rpc('storage_object_names', {
    p_bucket: srcBucket, p_after: after, p_limit: limit,
  });
  if (error) return { ok: false, error: error.message };

  const all = (rows ?? []) as { name: string; size: number }[];
  if (!all.length) return { done: true, after, scanned: 0, skipped: 0, moved: 0, failed: 0, errors: [] };

  const results = await pooled(all, LANES, async (row) => {
    const h = await head(kind, row.name);
    if (h.ok && h.size === String(row.size)) return { skipped: true, ok: true };
    const r = await migrateOne(kind, srcBucket, row.name);
    return { skipped: false, ok: r.ok, path: r.path, error: (r as { error?: string }).error };
  });

  const skipped = results.filter((r) => r.skipped).length;
  const moved = results.filter((r) => !r.skipped && r.ok).length;
  const bad = results.filter((r) => !r.ok);
  return {
    done: false,
    after: all[all.length - 1].name,
    scanned: all.length, skipped, moved, failed: bad.length,
    errors: bad.slice(0, 5).map((b) => `${b.path}: ${b.error ?? '?'}`),
  };
}

/** 元とR2を突き合わせる。消す前に必ずこれを見る。名前の続きから少しずつ。 */
async function verify(kind: string, srcBucket: string, limit: number, after: string | null) {
  const sb = await admin();
  const { data: rows, error } = await (sb as SB).rpc('storage_object_names', {
    p_bucket: srcBucket, p_after: after, p_limit: limit,
  });
  if (error) return { ok: false, error: error.message };

  const all = (rows ?? []) as { name: string; size: number }[];
  if (!all.length) return { done: true, after, count: 0, srcBytes: 0, dstBytes: 0, missing: [], missingCount: 0, wrongSize: [], wrongSizeCount: 0 };

  const checked = await pooled(all, LANES, async (row) => {
    const h = await head(kind, row.name);
    return { name: row.name, src: Number(row.size ?? 0), dst: h.ok ? Number(h.size ?? 0) : null, sizeStr: h.size };
  });

  const missing = checked.filter((c) => c.dst === null).map((c) => c.name);
  const wrongSize = checked.filter((c) => c.dst !== null && c.sizeStr !== String(c.src)).map((c) => c.name);
  return {
    done: false,
    after: all[all.length - 1].name,
    ok: missing.length === 0 && wrongSize.length === 0,
    count: all.length,
    srcBytes: checked.reduce((a, c) => a + c.src, 0),
    dstBytes: checked.reduce((a, c) => a + (c.dst ?? 0), 0),
    missing: missing.slice(0, 20), missingCount: missing.length,
    wrongSize: wrongSize.slice(0, 20), wrongSizeCount: wrongSize.length,
  };
}

// 移し終えた元ファイルを Supabase Storage から消す。
//
// ⚠️ ここだけ取り返しがつかない。
//    **R2に同じ大きさで在ることを1件ずつ確かめたものしか消さない。**
//    1件でも合わなければ、その1件を残して次へ行く（全体を止めない）。
// ⚠️ dryRun を既定にしてある。消すときは明示的に false を渡す。
async function purgeSource(kind: string, srcBucket: string, dryRun: boolean, limit: number, after: string | null) {
  const sb = await admin();
  const { data: rows, error } = await (sb as SB).rpc('storage_object_names', {
    p_bucket: srcBucket, p_after: after, p_limit: limit,
  });
  if (error) return { ok: false, error: error.message };
  const all = (rows ?? []) as { name: string; size: number }[];
  if (!all.length) return { done: true, after, deletable: 0, deleted: 0, bytes: 0, kept: [] };

  const checked = await pooled(all, LANES, async (row) => {
    const h = await head(kind, row.name);
    if (!h.ok) return { name: row.name, safe: false, why: `R2に無い(${h.status})`, size: 0 };
    if (h.size !== String(row.size)) {
      return { name: row.name, safe: false, why: `大きさ違い ${h.size} ≠ ${row.size}`, size: 0 };
    }
    return { name: row.name, safe: true, why: '', size: Number(row.size ?? 0) };
  });

  const safe = checked.filter((c) => c.safe).map((c) => c.name);
  const kept = checked.filter((c) => !c.safe).map((c) => ({ name: c.name, why: c.why }));
  const bytes = checked.filter((c) => c.safe).reduce((a, c) => a + c.size, 0);
  const cursor = all[all.length - 1].name;

  if (dryRun) {
    return { dryRun: true, done: false, after: cursor, scanned: all.length, deletable: safe.length, bytes, kept: kept.slice(0, 10) };
  }

  let deleted = 0;
  const errors: string[] = [];
  for (let i = 0; i < safe.length; i += 100) {
    const chunk = safe.slice(i, i + 100);
    const { error: rmErr } = await sb.storage.from(srcBucket).remove(chunk);
    if (rmErr) errors.push(rmErr.message); else deleted += chunk.length;
  }
  return { dryRun: false, done: false, after: cursor, scanned: all.length, deleted, bytes, kept: kept.slice(0, 10), errors };
}

// ブラウザから呼ぶ前に、ブラウザは「この呼び出しをしてよいか」を
// 別のリクエストで確かめに来る（プリフライト）。
// ⚠️ ここに返事を用意しないと毎回そこで往復が1回増える。
//    max-age を付けて、しばらくは聞き直さないようにする。
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? 'check';
    const kind = body.kind ?? 'spacareer';

    // 見る側の口だけは、呼んだ人と鍵の組み合わせを確かめる。
    if (action === 'sign-get') {
      const key = String(body.key ?? '');
      if (!key) return reply({ ok: false, error: '鍵がありません' }, 400);
      const uid = callerId(req);
      if (!uid) return reply({ ok: false, error: 'ログインが必要です' }, 401);
      if (!(await mayRead(uid, kind, key))) {
        return reply({ ok: false, error: 'このファイルは見られません' }, 403);
      }
      // ⚠️ 実体があるかを必ず確かめてから署名を出す。
      //    一度これを外して速くしたが、**移送のあとに録音された分がR2に無く**、
      //    「ある」前提の鍵を返してしまって再生できなくなった（2026-08-24）。
      //    無いと分かれば呼び出し側がSupabaseに回れる。往復1回ぶん(60〜80ms)は
      //    その安全のために払う。速さの主因は別（プリフライトの往復）だった。
      const h = await head(kind, key);
      if (!h.ok) return reply({ ok: false, error: 'R2にありません', status: h.status }, 404);

      // ⚠️ **架電録音は中身がMP3なのに `audio/mp4` を名乗って保存されている**
      //    （鍵の名前も .mp4 / .m4a）。パソコンのブラウザは中身を見て鳴らすが、
      //    型を信じる相手（iOS・一部の <audio>）は解けずに黙って止まる。
      //    2026-09-04 判明。実体は触らず、渡すときだけ正しく名乗らせる。
      //    ⚠️ 講義録画(spacareer)は本物のMP4なので触らない。
      let as: { type: string; filename: string } | undefined;
      if (kind === 'recordings') {
        const probe = await presign('GET', bucketOf(kind), key, 60);
        const res = await fetch(probe, { headers: { Range: 'bytes=0-11' } }).catch(() => null);
        const b = res && (res.status === 200 || res.status === 206)
          ? new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0)))
          : new Uint8Array(0);
        const isMp3 = (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33)
          || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
        if (isMp3) {
          as = { type: 'audio/mpeg', filename: `${key.replace(/\.[^.]+$/, '')}.mp3` };
        }
      }

      const url = await presign('GET', bucketOf(kind), key, Number(body.expires ?? 3600), as);
      return reply({ ok: true, url, size: h.size });
    }

    if (action === 'check') return reply(await check(kind));
    if (action === 'head') {
      // ⚠️ 存在と大きさが分かるだけでも手がかりになる。sign-get と同じ判定をかける。
      const uid = callerId(req);
      if (!uid) return reply({ ok: false, error: 'ログインが必要です' }, 401);
      if (!(await mayRead(uid, kind, String(body.key ?? '')))) {
        return reply({ ok: false, error: '見られません' }, 403);
      }
      return reply(await head(kind, body.key));
    }
    if (action === 'lifecycle-get') return reply(await getLifecycle(kind));
    if (action === 'lifecycle-delete') return reply(await deleteLifecycle(kind));
    if (action === 'lifecycle-set') {
      // ⚠️ バケット全体にかかる。日数は明示的に渡させる（既定値を置かない）。
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1) return reply({ ok: false, error: 'days は1以上の整数で' }, 400);
      return reply(await putLifecycle(kind, days));
    }
    if (action === 'migrate') return reply(await migrateOne(kind, body.bucket, body.path));
    if (action === 'stats') {
      const { data } = await admin().rpc('storage_object_stats', { p_bucket: body.bucket });
      return reply({ ok: true, ...(data?.[0] ?? {}) });
    }
    if (action === 'migrate-batch') {
      return reply(await migrateBatch(kind, body.bucket, Number(body.limit ?? 200), body.after ?? null));
    }
    if (action === 'verify') {
      return reply(await verify(kind, body.bucket, Number(body.limit ?? 1000), body.after ?? null));
    }
    if (action === 'purge-source') {
      // dryRun を既定にする。明示的に false を渡したときだけ消す。
      const dryRun = body.dryRun !== false;
      return reply(await purgeSource(kind, body.bucket, dryRun, Number(body.limit ?? 500), body.after ?? null));
    }
    return reply({ ok: false, error: `知らない action です: ${action}` }, 400);
  } catch (e) {
    return reply({ ok: false, error: String(e) }, 500);
  }
});
