// Zoomのクラウド録画を R2 へ移す（2026-10-08 むー様決定）
// ---------------------------------------------------------------------------
// Zoomのクラウド容量はアカウント全体で40GB。満杯になると全員のクラウド録画が止まる
// （2026-10-08 に実際に止まった）。容量は買い足さず、録画を R2 へ移して
// スパナビの中で見られるようにし、移し終えたものだけ Zoom から外す。
//
// 口（POST の action）
//   scan  : Zoomの録画一覧を読み、ファイル1本ごとに zoom_cloud_recordings へ記録する
//   copy  : まだ移していないファイルを R2 へ流し、大きさが一致したら copied_at を付ける
//   trash : 全ファイルが移し終わった会議だけ、Zoomのゴミ箱へ送る（dryRun が既定）
//   stats : 件数と大きさ
//
// ⚠️ ログイン不要の口なので、合言葉（ZOOM_CLOUD_ARCHIVE_SECRET）が鍵になる。
//    trash は Zoom の録画を外す口なので、合言葉なしでは絶対に動かさない。
// ⚠️ Zoomアプリ「Spanavi」（Server-to-Server OAuth）に次の権限が要る。
//    cloud_recording:read:list_account_recordings:admin
//    cloud_recording:read:list_recording_files:admin
//    cloud_recording:delete:meeting_recording:admin（trash のときだけ）

// Zoomのアカウントは Spartia のもの。移したものは Spartia の組織に付ける。
const ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const PREFIX = 'zoom-cloud';

const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} が設定されていません`);
  return v;
}

async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}
async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

/* ===================== R2 ===================== */

// 署名付きURL。中身のハッシュが要らないので、大きな動画を抱え込まずに流せる。
// ⚠️ 署名にはメソッドが含まれる。HEADで確かめるならHEAD用に署名する。
// ⚠️ 置き場は講義録画（180日で自動削除）とは別。自動削除の規則を入れない専用の置き場
//    （2026-10-08 むー様決定：Zoomから移した録画は無期限で残す）。
const BUCKET = 'spanavi-zoom-archive';

async function r2Presign(method: 'PUT' | 'HEAD' | 'GET', key: string, expires = 3600): Promise<string> {
  const account = env('R2_ACCOUNT_ID');
  const ak = env('R2_ACCESS_KEY_ID');
  const sk = env('R2_SECRET_ACCESS_KEY');
  const bucket = BUCKET;
  const e = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = key ? `/${bucket}/${key.split('/').map(e).join('/')}` : `/${bucket}`;
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

// 置き場そのものを作る。⚠️ R2は置き場への操作に署名付きURLを受け付けないので、ヘッダで署名する。
async function r2CreateBucket(): Promise<Response> {
  const account = env('R2_ACCOUNT_ID');
  const ak = env('R2_ACCESS_KEY_ID');
  const sk = env('R2_SECRET_ACCESS_KEY');
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${BUCKET}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex('');
  const canonical = [
    'PUT', path, '',
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`,
    'host;x-amz-content-sha256;x-amz-date', payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  let k = await hmac(enc.encode('AWS4' + sk), dateStamp);
  k = await hmac(k, 'auto'); k = await hmac(k, 's3'); k = await hmac(k, 'aws4_request');
  return fetch(`https://${host}${path}`, {
    method: 'PUT',
    headers: {
      'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${hex(await hmac(k, toSign))}`,
    },
  });
}

async function r2Size(key: string): Promise<number | null> {
  const res = await fetch(await r2Presign('HEAD', key, 60), { method: 'HEAD' }).catch(() => null);
  if (!res?.ok) return null;
  return Number(res.headers.get('content-length') ?? NaN);
}

/* ===================== DB（PostgREST を素の fetch で） ===================== */

async function db(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB ${path.split('?')[0]}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

type Row = {
  id: string; zoom_file_id: string; zoom_meeting_uuid: string; file_size: number;
  r2_key: string; copied_at: string | null; zoom_trashed_at: string | null;
};

/* ===================== Zoom ===================== */

let cachedToken: { value: string; until: number } | null = null;
async function zoomToken(): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${env('ZOOM_ACCOUNT_ID')}`,
    {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${env('ZOOM_CLIENT_ID')}:${env('ZOOM_CLIENT_SECRET')}`) },
    },
  );
  const j = await res.json();
  if (!j.access_token) throw new Error(`Zoomのトークンを取れません: ${JSON.stringify(j).slice(0, 200)}`);
  cachedToken = { value: j.access_token, until: Date.now() + (Number(j.expires_in ?? 3600) - 120) * 1000 };
  return j.access_token;
}

async function zoom(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await zoomToken()}`, ...(init.headers ?? {}) },
  });
}

// ⚠️ 会議のUUIDが「/」で始まるか「//」を含むときは、二重にエンコードしないとZoomが404を返す。
function meetingPath(uuid: string): string {
  const once = encodeURIComponent(uuid);
  return uuid.startsWith('/') || uuid.includes('//') ? encodeURIComponent(once) : once;
}

type ZFile = {
  id?: string; file_type?: string; recording_type?: string; file_size?: number;
  file_extension?: string; status?: string; download_url?: string;
};
type ZMeeting = {
  uuid: string; id?: number | string; host_email?: string; topic?: string;
  start_time?: string; duration?: number; recording_files?: ZFile[];
};

const safe = (s: string) => s.replace(/[^A-Za-z0-9._@-]/g, '_');

function keyOf(m: ZMeeting, f: ZFile): string {
  const day = (m.start_time ?? '').slice(0, 10) || 'unknown';
  const ext = (f.file_extension ?? f.file_type ?? 'bin').toLowerCase();
  return `${PREFIX}/${safe(m.host_email ?? 'unknown')}/${day}_${safe(String(m.id ?? ''))}/${safe(f.id ?? '')}.${ext}`;
}

/* ===================== 口の中身 ===================== */

// 1か月ずつ遡って一覧を読む（Zoomは1回で最長1か月しか返さない）。
async function scan(months: number) {
  const now = new Date();
  let meetings = 0, files = 0, bytes = 0;
  const errors: string[] = [];
  for (let i = 0; i < months; i++) {
    const to = new Date(now.getTime() - i * 30 * 86400_000);
    const from = new Date(to.getTime() - 30 * 86400_000);
    let token = '';
    do {
      const q = new URLSearchParams({
        from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), page_size: '300',
      });
      if (token) q.set('next_page_token', token);
      const res = await zoom(`/accounts/me/recordings?${q}`);
      const j = await res.json();
      if (!res.ok) { errors.push(`${q.get('from')}〜: ${res.status} ${JSON.stringify(j).slice(0, 200)}`); break; }
      const rows = [];
      for (const m of (j.meetings ?? []) as ZMeeting[]) {
        meetings++;
        for (const f of m.recording_files ?? []) {
          if (!f.id || f.status !== 'completed' || !f.file_size) continue;
          files++; bytes += f.file_size;
          rows.push({
            org_id: ORG_ID, zoom_file_id: f.id, zoom_meeting_uuid: m.uuid,
            zoom_meeting_id: m.id != null ? String(m.id) : null, host_email: m.host_email ?? null,
            topic: m.topic ?? null, start_time: m.start_time ?? null, duration_min: m.duration ?? null,
            file_type: f.file_type ?? null, recording_type: f.recording_type ?? null,
            file_size: f.file_size, r2_key: keyOf(m, f),
          });
        }
      }
      // 既に記録してあるものは触らない（copied_at などを消さない）。
      if (rows.length) {
        await db('zoom_cloud_recordings?on_conflict=zoom_file_id', {
          method: 'POST', body: JSON.stringify(rows),
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        });
      }
      token = j.next_page_token ?? '';
    } while (token);
  }
  // 1か月ずつの窓は重なるので、件数は延べ。正確な数は stats で見る。
  return { ok: errors.length === 0, scannedMeetings: meetings, scannedFiles: files, scannedGB: +(bytes / 1e9).toFixed(2), errors };
}

// 1本を Zoom から R2 へ流す。中身は変数に受けずにそのまま渡す（1本数百MBある）。
async function copyOne(row: Row, f: ZFile): Promise<{ ok: boolean; why?: string }> {
  if (!f.download_url) return { ok: false, why: 'download_url が無い' };
  const src = await fetch(f.download_url, { headers: { Authorization: `Bearer ${await zoomToken()}` } });
  if (!src.ok || !src.body) return { ok: false, why: `Zoomから読めない ${src.status}` };
  const len = src.headers.get('content-length');
  if (!len) { await src.body.cancel(); return { ok: false, why: '大きさが分からない' }; }
  const put = await fetch(await r2Presign('PUT', row.r2_key), {
    method: 'PUT',
    headers: { 'content-length': len, 'content-type': src.headers.get('content-type') ?? 'application/octet-stream' },
    body: src.body,
    duplex: 'half',
  } as RequestInit);
  if (!put.ok) return { ok: false, why: `R2に置けない ${put.status} ${(await put.text()).slice(0, 120)}` };
  // 途中で切れても200が返ることがあるので、入った大きさをZoomの記録と照らす。
  const size = await r2Size(row.r2_key);
  if (size !== Number(row.file_size)) return { ok: false, why: `大きさ違い R2=${size} Zoom=${row.file_size}` };
  await db(`zoom_cloud_recordings?id=eq.${row.id}`, {
    method: 'PATCH', body: JSON.stringify({ copied_at: new Date().toISOString() }),
    headers: { Prefer: 'return=minimal' },
  });
  return { ok: true };
}

async function copy(limitMeetings: number, budgetMs: number) {
  const started = Date.now();
  const pending = await db(
    `zoom_cloud_recordings?select=zoom_meeting_uuid,start_time&copied_at=is.null&zoom_trashed_at=is.null&order=start_time.asc&limit=1000`,
  ) as { zoom_meeting_uuid: string }[];
  const uuids = [...new Set(pending.map((p) => p.zoom_meeting_uuid))].slice(0, limitMeetings);
  const done: string[] = [];
  const failed: { uuid: string; why: string }[] = [];
  for (const uuid of uuids) {
    if (Date.now() - started > budgetMs) break;
    const res = await zoom(`/meetings/${meetingPath(uuid)}/recordings`);
    const j = await res.json();
    if (!res.ok) { failed.push({ uuid, why: `一覧 ${res.status} ${JSON.stringify(j).slice(0, 120)}` }); continue; }
    const byId = new Map(((j.recording_files ?? []) as ZFile[]).map((f) => [f.id, f]));
    const rows = await db(
      `zoom_cloud_recordings?select=*&zoom_meeting_uuid=eq.${encodeURIComponent(uuid)}&copied_at=is.null`,
    ) as Row[];
    let allOk = true;
    for (const row of rows) {
      const f = byId.get(row.zoom_file_id);
      const r = f ? await copyOne(row, f) : { ok: false, why: 'Zoomに見当たらない' };
      if (!r.ok) { allOk = false; failed.push({ uuid, why: `${row.zoom_file_id}: ${r.why}` }); }
    }
    if (allOk) done.push(uuid);
  }
  const left = await db(`zoom_cloud_recordings?select=id&copied_at=is.null&zoom_trashed_at=is.null`) as unknown[];
  return { ok: failed.length === 0, copiedMeetings: done.length, failed, filesLeft: left.length };
}

// 会議ごとに、全ファイルが R2 にあり大きさが一致することを**その場で確かめてから**ゴミ箱へ送る。
async function trash(limitMeetings: number, dryRun: boolean, hostEmail: string | null) {
  const filter = hostEmail ? `&host_email=eq.${encodeURIComponent(hostEmail)}` : '';
  const rows = await db(
    `zoom_cloud_recordings?select=*&zoom_trashed_at=is.null${filter}&order=start_time.asc&limit=5000`,
  ) as Row[];
  const byMeeting = new Map<string, Row[]>();
  for (const r of rows) byMeeting.set(r.zoom_meeting_uuid, [...(byMeeting.get(r.zoom_meeting_uuid) ?? []), r]);

  const ready = [...byMeeting.entries()].filter(([, rs]) => rs.every((r) => r.copied_at)).slice(0, limitMeetings);
  const out: { uuid: string; ok: boolean; why?: string; bytes: number }[] = [];
  for (const [uuid, rs] of ready) {
    const bytes = rs.reduce((a, r) => a + Number(r.file_size), 0);
    const bad = [];
    for (const r of rs) {
      const size = await r2Size(r.r2_key);
      if (size !== Number(r.file_size)) bad.push(`${r.zoom_file_id}: R2=${size} Zoom=${r.file_size}`);
    }
    if (bad.length) { out.push({ uuid, ok: false, why: bad.join(' / '), bytes }); continue; }
    if (dryRun) { out.push({ uuid, ok: true, bytes }); continue; }
    // action=trash：完全には消さず、Zoomのゴミ箱へ送る（30日は戻せる）。
    const res = await zoom(`/meetings/${meetingPath(uuid)}/recordings?action=trash`, { method: 'DELETE' });
    if (res.status !== 204 && res.status !== 200) {
      out.push({ uuid, ok: false, why: `Zoom ${res.status} ${(await res.text()).slice(0, 120)}`, bytes });
      continue;
    }
    await db(`zoom_cloud_recordings?zoom_meeting_uuid=eq.${encodeURIComponent(uuid)}`, {
      method: 'PATCH', body: JSON.stringify({ zoom_trashed_at: new Date().toISOString() }),
      headers: { Prefer: 'return=minimal' },
    });
    out.push({ uuid, ok: true, bytes });
  }
  const okOnes = out.filter((o) => o.ok);
  return {
    dryRun, meetings: okOnes.length, gb: +(okOnes.reduce((a, o) => a + o.bytes, 0) / 1e9).toFixed(2),
    failed: out.filter((o) => !o.ok).slice(0, 20),
  };
}

async function stats() {
  const rows = await db(
    `zoom_cloud_recordings?select=host_email,file_size,copied_at,zoom_trashed_at&limit=20000`,
  ) as { host_email: string; file_size: number; copied_at: string | null; zoom_trashed_at: string | null }[];
  const by: Record<string, { files: number; gb: number; copied: number; trashed: number }> = {};
  for (const r of rows) {
    const b = by[r.host_email ?? '?'] ??= { files: 0, gb: 0, copied: 0, trashed: 0 };
    b.files++; b.gb += Number(r.file_size) / 1e9;
    if (r.copied_at) b.copied++;
    if (r.zoom_trashed_at) b.trashed++;
  }
  for (const b of Object.values(by)) b.gb = +b.gb.toFixed(2);
  return { files: rows.length, byHost: by };
}

/* ===================== 入口 ===================== */

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ ok: false, error: 'POST で呼んでください' }, 405);
  const secret = Deno.env.get('ZOOM_CLOUD_ARCHIVE_SECRET');
  if (!secret || req.headers.get('x-archive-secret') !== secret) {
    return reply({ ok: false, error: '合言葉が違います' }, 403);
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'stats';
    if (action === 'scan') return reply(await scan(Number(body.months ?? 13)));
    if (action === 'copy') return reply(await copy(Number(body.limit ?? 5), Number(body.budgetMs ?? 100_000)));
    if (action === 'trash') {
      // dryRun を既定にする。明示的に false を渡したときだけゴミ箱へ送る。
      return reply(await trash(Number(body.limit ?? 20), body.dryRun !== false, body.host ?? null));
    }
    if (action === 'stats') return reply(await stats());
    if (action === 'bucket') {
      // 置き場が無ければ作り、自動削除の規則が付いていないかを実体のGET応答ヘッダで確かめる。
      const created = await r2CreateBucket();
      const probeKey = `_check/${Date.now()}.txt`;
      const put = await fetch(await r2Presign('PUT', probeKey, 300), { method: 'PUT', body: 'check', headers: { 'content-length': '5' } });
      const get = await fetch(await r2Presign('GET', probeKey, 300));
      const expiration = get.headers.get('x-amz-expiration') ?? '（自動削除の規則なし）';
      await get.body?.cancel();
      return reply({ bucket: BUCKET, create: created.status, createBody: created.ok ? '' : (await created.text()).slice(0, 300), put: put.status, get: get.status, expiration });
    }
    return reply({ ok: false, error: `知らない action です: ${action}` }, 400);
  } catch (e) {
    return reply({ ok: false, error: String(e) }, 500);
  }
});
