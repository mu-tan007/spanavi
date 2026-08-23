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

import { createClient } from 'jsr:@supabase/supabase-js@2';

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
): Promise<string> {
  const account = env('R2_ACCOUNT_ID');
  const ak = env('R2_ACCESS_KEY_ID');
  const sk = env('R2_SECRET_ACCESS_KEY');
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${encodePath(key)}`;

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;

  const q = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${ak}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ].map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&');

  const canonical = [method, path, q, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  const sig = hex(await hmac(await signingKey(sk, dateStamp), toSign));

  return `https://${host}${path}?${q}&X-Amz-Signature=${sig}`;
}

function admin() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
}

async function head(kind: string, key: string) {
  const bucket = bucketOf(kind);
  const res = await signedFetch('HEAD', bucket, key);
  return { ok: res.ok, status: res.status, size: res.headers.get('content-length') };
}

/* ===================== 見てよいかの判定 ===================== */

async function callerOrg(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return null;
  const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await anon.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) return null;
  const { data: u } = await admin().from('users').select('org_id').eq('id', uid).maybeSingle();
  return u?.org_id ?? null;
}

// その鍵が、そのorgの講義録画として登録されているか。
// ⚠️ 鍵を名前で指定されるので、ここを省くと他社の動画を取られる。
async function mayReadSpacareer(org: string, key: string): Promise<boolean> {
  const { data } = await admin()
    .from('spacareer_session_videos')
    .select('id')
    .eq('org_id', org)
    .or(`storage_path.eq.${key},audio_storage_path.eq.${key}`)
    .limit(1);
  return (data?.length ?? 0) > 0;
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
  const sb = admin();
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

async function migrateBatch(kind: string, srcBucket: string, limit: number) {
  const sb = admin();
  const { data: rows, error } = await sb.rpc('storage_object_names', { p_bucket: srcBucket });
  if (error) return { ok: false, error: error.message };
  const all = (rows ?? []) as { name: string; size: number }[];
  const done: unknown[] = [];
  let skipped = 0;
  let failed = 0;
  for (const row of all) {
    if (done.length >= limit) break;
    const h = await head(kind, row.name);
    if (h.ok && h.size === String(row.size)) { skipped++; continue; }
    const r = await migrateOne(kind, srcBucket, row.name);
    if (!r.ok) failed++;
    done.push(r);
  }
  const moved = done.filter((d) => (d as { ok: boolean }).ok).length;
  return { total: all.length, skipped, moved, failed, remaining: all.length - skipped - moved, done };
}

// 元とR2を突き合わせる。消す前に必ずこれを見る。
async function verify(kind: string, srcBucket: string) {
  const sb = admin();
  const { data: rows, error } = await sb.rpc('storage_object_names', { p_bucket: srcBucket });
  if (error) return { ok: false, error: error.message };
  const all = (rows ?? []) as { name: string; size: number }[];
  const missing: string[] = [];
  const wrongSize: string[] = [];
  let srcBytes = 0;
  let dstBytes = 0;
  for (const row of all) {
    srcBytes += Number(row.size ?? 0);
    const h = await head(kind, row.name);
    if (!h.ok) { missing.push(row.name); continue; }
    dstBytes += Number(h.size ?? 0);
    if (h.size !== String(row.size)) wrongSize.push(row.name);
  }
  return {
    ok: missing.length === 0 && wrongSize.length === 0,
    count: all.length, srcBytes, dstBytes,
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
async function purgeSource(kind: string, srcBucket: string, dryRun: boolean, limit: number) {
  const sb = admin();
  const { data: rows, error } = await sb.rpc('storage_object_names', { p_bucket: srcBucket });
  if (error) return { ok: false, error: error.message };
  const all = (rows ?? []) as { name: string; size: number }[];

  const safe: string[] = [];
  const kept: { name: string; why: string }[] = [];
  let bytes = 0;

  for (const row of all) {
    if (safe.length >= limit) break;
    const h = await head(kind, row.name);
    if (!h.ok) { kept.push({ name: row.name, why: `R2に無い(${h.status})` }); continue; }
    if (h.size !== String(row.size)) {
      kept.push({ name: row.name, why: `大きさ違い ${h.size} ≠ ${row.size}` });
      continue;
    }
    safe.push(row.name);
    bytes += Number(row.size ?? 0);
  }

  if (dryRun) {
    return { dryRun: true, total: all.length, deletable: safe.length, bytes, kept };
  }

  let deleted = 0;
  const errors: string[] = [];
  for (let i = 0; i < safe.length; i += 100) {
    const chunk = safe.slice(i, i + 100);
    const { error: rmErr } = await sb.storage.from(srcBucket).remove(chunk);
    if (rmErr) errors.push(rmErr.message); else deleted += chunk.length;
  }
  return { dryRun: false, total: all.length, deleted, bytes, kept, errors };
}

Deno.serve(async (req) => {
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? 'check';
    const kind = body.kind ?? 'spacareer';

    // 見る側の口だけは、呼んだ人と鍵の組み合わせを確かめる。
    if (action === 'sign-get') {
      const key = String(body.key ?? '');
      if (!key) return Response.json({ ok: false, error: '鍵がありません' }, { status: 400 });
      const org = await callerOrg(req);
      if (!org) return Response.json({ ok: false, error: 'ログインが必要です' }, { status: 401 });
      if (kind !== 'spacareer') {
        return Response.json({ ok: false, error: 'この置き場はまだ開いていません' }, { status: 403 });
      }
      if (!(await mayReadSpacareer(org, key))) {
        return Response.json({ ok: false, error: 'このファイルは見られません' }, { status: 403 });
      }
      const h = await head(kind, key);
      if (!h.ok) return Response.json({ ok: false, error: 'R2にありません', status: h.status }, { status: 404 });
      const url = await presign('GET', bucketOf(kind), key, Number(body.expires ?? 3600));
      return Response.json({ ok: true, url, size: h.size });
    }

    if (action === 'check') return Response.json(await check(kind));
    if (action === 'head') return Response.json(await head(kind, body.key));
    if (action === 'migrate') return Response.json(await migrateOne(kind, body.bucket, body.path));
    if (action === 'migrate-batch') {
      return Response.json(await migrateBatch(kind, body.bucket, Number(body.limit ?? 10)));
    }
    if (action === 'verify') return Response.json(await verify(kind, body.bucket));
    if (action === 'purge-source') {
      // dryRun を既定にする。明示的に false を渡したときだけ消す。
      const dryRun = body.dryRun !== false;
      return Response.json(await purgeSource(kind, body.bucket, dryRun, Number(body.limit ?? 100000)));
    }
    return Response.json({ ok: false, error: `知らない action です: ${action}` }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
