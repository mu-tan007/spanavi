// Cloudflare Stream connector
//   tus_create / status / delete / update_meta
//   list_stats: 現在の動画一覧と状態ごとの集計
//   force_cleanup_pending: pendingupload 状態の動画を全て削除 (時間制限なし)
//   playback: 週次ミーティングの再生。視聴制限のある回は権限を確かめて署名付きトークンを返す
//   set_signed: 動画の署名必須（requireSignedURLs）を切り替える（管理者のみ）
// Secrets required:
//   CF_STREAM_ACCOUNT_ID
//   CF_STREAM_API_TOKEN
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ACCOUNT_ID = Deno.env.get('CF_STREAM_ACCOUNT_ID')?.trim() || '';
const API_TOKEN = Deno.env.get('CF_STREAM_API_TOKEN')?.trim() || '';

// 署名付きトークンの有効期限。1回の視聴（最長2時間＋止めながら見る）に足りる長さ
const PLAYBACK_TOKEN_TTL_SEC = 6 * 60 * 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function encodeB64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

function userClientFor(req: Request) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
}

async function setRequireSigned(uid: string, required: boolean) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${uid}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, requireSignedURLs: required }),
  });
  const d = await r.json().catch(() => ({}));
  return r.ok && d?.success ? null : (d?.errors || `status ${r.status}`);
}

async function cleanupPendingUploads() {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    const d = await r.json();
    const list = d?.result || [];
    const now = Date.now();
    const deletions = list
      .filter((v: any) => v?.status?.state === 'pendingupload')
      .filter((v: any) => {
        const created = v?.created ? new Date(v.created).getTime() : 0;
        return created > 0 && now - created >= 10 * 60 * 1000;
      })
      .slice(0, 20)
      .map((v: any) =>
        fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${v.uid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${API_TOKEN}` },
        }).catch(() => {})
      );
    await Promise.all(deletions);
  } catch (_) { /* best-effort */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!ACCOUNT_ID || !API_TOKEN) return json({ error: 'Missing CF_STREAM_ACCOUNT_ID or CF_STREAM_API_TOKEN' }, 200);

  try {
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode || '';

    if (mode === 'tus_create') {
      cleanupPendingUploads().catch(() => {});

      const fileSize = Number(body.fileSize);
      if (!fileSize || fileSize <= 0) return json({ error: 'fileSize required' }, 200);

      const filename = String(body.filename || 'video.mp4').slice(0, 200);
      const filetype = String(body.filetype || 'video/mp4');
      const title = body.title ? String(body.title).slice(0, 200) : filename;
      const maxDur = Math.min(Math.max(Number(body.maxDurationSeconds) || 7200, 60), 21600);

      const metaPairs = [
        `name ${encodeB64(title)}`,
        `filename ${encodeB64(filename)}`,
        `filetype ${encodeB64(filetype)}`,
        `maxDurationSeconds ${encodeB64(String(maxDur))}`,
      ];
      // 新しく上げる回は最初から署名必須にする（動画IDだけでは再生できない）
      if (body.requireSignedURLs) metaPairs.push('requiresignedurls');
      const uploadMetadata = metaPairs.join(',');

      let cfRes: Response;
      try {
        cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream?direct_user=true`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${API_TOKEN}`,
              'Tus-Resumable': '1.0.0',
              'Upload-Length': String(fileSize),
              'Upload-Metadata': uploadMetadata,
              'Upload-Creator': 'spanavi',
            },
          }
        );
      } catch (fetchErr) {
        console.error('[cf-stream] fetch network error:', fetchErr);
        return json({ error: 'cf network error', detail: String(fetchErr) }, 200);
      }

      if (!cfRes.ok) {
        const txt = await cfRes.text().catch(() => '');
        console.error('[cf-stream] tus_create CF error', cfRes.status, txt);
        return json({ error: 'cf tus create failed', status: cfRes.status, detail: txt }, 200);
      }
      const uploadUrl = cfRes.headers.get('Location');
      const uid = cfRes.headers.get('stream-media-id');
      if (!uploadUrl || !uid) {
        const txt = await cfRes.text().catch(() => '');
        console.error('[cf-stream] tus_create missing headers', txt);
        return json({ error: 'cf tus create: missing Location or stream-media-id', detail: txt }, 200);
      }
      return json({ uploadUrl, uid });
    }

    if (mode === 'playback') {
      const videoId = String(body.videoId || '');
      if (!videoId) return json({ error: 'videoId required' }, 200);
      const userClient = userClientFor(req);
      const { data: canView, error: rpcErr } = await userClient.rpc('can_view_weekly_meeting', { p_video_id: videoId });
      if (rpcErr) {
        console.error('[cf-stream] playback rpc error', rpcErr);
        return json({ error: 'permission check failed' }, 200);
      }
      if (!canView) return json({ error: 'forbidden', forbidden: true }, 200);

      const { data: row } = await userClient
        .from('weekly_meeting_videos').select('stream_uid, access_restricted').eq('id', videoId).single();
      if (!row?.stream_uid) return json({ error: 'no stream' }, 200);
      if (!row.access_restricted) return json({ id: row.stream_uid, signed: false });

      // 署名必須になっていない動画（制限を付ける前に上げた回など）はここで必ず付ける。
      // 付かないまま鍵を出すと、動画IDだけで誰でも再生できる状態が残る
      const signErr = await setRequireSigned(row.stream_uid, true);
      if (signErr) {
        console.error('[cf-stream] require signed failed', signErr);
        return json({ error: 'cf update failed' }, 200);
      }

      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${row.stream_uid}/token`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + PLAYBACK_TOKEN_TTL_SEC }),
        },
      );
      const cfJson = await cfRes.json().catch(() => ({}));
      if (!cfRes.ok || !cfJson?.success || !cfJson?.result?.token) {
        console.error('[cf-stream] playback token error', cfRes.status, cfJson);
        return json({ error: 'cf token failed' }, 200);
      }
      return json({ id: cfJson.result.token, signed: true });
    }

    if (mode === 'set_signed') {
      const uid = String(body.uid || '');
      if (!uid) return json({ error: 'uid required' }, 200);
      const { data: isAdmin } = await userClientFor(req).rpc('is_org_admin');
      if (!isAdmin) return json({ error: 'forbidden', forbidden: true }, 200);
      const err = await setRequireSigned(uid, !!body.required);
      if (err) return json({ error: 'cf update failed', detail: err }, 200);
      return json({ ok: true });
    }

    if (mode === 'list_stats') {
      // 全動画を取得し、状態ごとの集計を返す (最大 1000 件)
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      });
      const d = await r.json();
      const list: any[] = d?.result || [];
      const stats: Record<string, { count: number; totalDuration: number }> = {};
      for (const v of list) {
        const state = v?.status?.state || 'unknown';
        if (!stats[state]) stats[state] = { count: 0, totalDuration: 0 };
        stats[state].count++;
        stats[state].totalDuration += Number(v?.duration) || 0;
      }
      return json({
        total: list.length,
        stats,
        sample: list.slice(0, 5).map((v: any) => ({
          uid: v.uid,
          state: v?.status?.state,
          duration: v.duration,
          created: v.created,
          size: v.size,
          name: v?.meta?.name,
        })),
      });
    }

    if (mode === 'force_cleanup_pending') {
      // pendingupload 状態の動画を全て削除 (時間制限なし)
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      });
      const d = await r.json();
      const list: any[] = d?.result || [];
      const targets = list.filter((v: any) => v?.status?.state === 'pendingupload');

      // 並列度 5 で削除していく (レート制限回避)
      let deleted = 0;
      let failed = 0;
      const errors: string[] = [];
      const CONCURRENCY = 5;
      for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const chunk = targets.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map((v: any) =>
            fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${v.uid}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${API_TOKEN}` },
            })
              .then((res) => ({ ok: res.ok, status: res.status, uid: v.uid }))
              .catch((e) => ({ ok: false, status: 0, uid: v.uid, err: String(e) }))
          )
        );
        for (const r of results) {
          if (r.ok) deleted++;
          else { failed++; errors.push(`${r.uid}: ${r.status} ${(r as any).err || ''}`); }
        }
      }
      return json({ found: targets.length, deleted, failed, errors: errors.slice(0, 10) });
    }

    if (mode === 'status') {
      const uid = String(body.uid || '');
      if (!uid) return json({ error: 'uid required' }, 200);
      const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${uid}`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      });
      const cfJson = await cfRes.json();
      if (!cfRes.ok || !cfJson?.success) return json({ error: 'cf status failed', detail: cfJson }, 200);
      const v = cfJson.result || {};
      return json({
        uid: v.uid,
        readyToStream: !!v.readyToStream,
        status: v.status?.state || null,
        duration: v.duration || null,
        thumbnail: v.thumbnail || null,
        preview: v.preview || null,
        playback: v.playback || null,
        size: v.size || null,
        meta: v.meta || null,
        requireSignedURLs: !!v.requireSignedURLs,
      });
    }

    if (mode === 'delete') {
      const uid = String(body.uid || '');
      if (!uid) return json({ error: 'uid required' }, 200);
      const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${uid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      });
      if (!cfRes.ok) {
        const txt = await cfRes.text();
        return json({ error: 'cf delete failed', detail: txt }, 200);
      }
      return json({ ok: true });
    }

    if (mode === 'update_meta') {
      const uid = String(body.uid || '');
      if (!uid) return json({ error: 'uid required' }, 200);
      const patch: Record<string, unknown> = {};
      if (body.meta) patch.meta = body.meta;
      const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${uid}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const cfJson = await cfRes.json();
      if (!cfRes.ok || !cfJson?.success) return json({ error: 'cf update failed', detail: cfJson }, 200);
      return json({ ok: true, result: cfJson.result });
    }

    return json({ error: 'unknown mode', mode }, 200);
  } catch (err) {
    console.error('[cf-stream] uncaught', err);
    return json({ error: String(err) }, 200);
  }
});
