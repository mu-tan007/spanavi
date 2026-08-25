// アポ取得報告に載っている録音URLを、押せば再生できる形に貼り直す
// ---------------------------------------------------------------------------
// 2026-08-25。recordings バケットを非公開にした 8/24 以降、報告書に貼っていた
// `/storage/v1/object/public/recordings/<鍵>` は先方が開くと必ず400になっていた。
// これを `/functions/v1/rec/<鍵>?s=<署名>` へ置き換える。鍵は変えない。
//
// あわせて、アポ側に取り残された **Zoomの生URL**（OAuthが要る＝誰も開けない）を、
// 同じ企業の架電記録にある録音へ差し替える。
//
// ⚠️ 署名鍵（REC_SHARE_SECRET）を入れ替えると、**配布済みのリンクも
//    DBに入っているURLも全部無効になる**。入れ替えたら必ずこれをもう一度流す。
// ⚠️ dryRun を既定にしてある。書き換えるときだけ明示的に false を渡す。
//
// 呼び方:
//   POST { secret, dryRun?: boolean, limit?: number }
//   secret は REC_SHARE_SECRET と一致すること（この口はログイン不要のため）。

import { recShareUrl, recordingKeyOf } from '../_shared/recordingSource.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// 合っているかを最後まで見てから返す（1文字ずつ詰められないように）。
function same(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ⚠️ matchAll 用は /g、有無を見るほうは /g を付けない。
//    /g 付きの正規表現の test() は前回の位置を覚えていて、交互に呼ぶと答えがぶれる。
const OLD_URL = /https?:\/\/[^\s"'<>]*?\/storage\/v1\/object\/public\/recordings\/[^\s"'<>]+/g;
const ZOOM_URL = /https?:\/\/[^\s"'<>]*zoom\.us\/[^\s"'<>]+/g;
const HAS_ZOOM = /https?:\/\/[^\s"'<>]*zoom\.us\//i;

type Appo = { id: string; item_id: string | null; recording_url: string | null; appo_report: string | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const secret = Deno.env.get('REC_SHARE_SECRET') ?? '';
    if (!secret || !same(String(body.secret ?? ''), secret)) {
      return reply({ ok: false, error: '合鍵が違います' }, 403);
    }
    const dryRun = body.dryRun !== false;
    const limit = Number(body.limit ?? 2000);

    const base = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('STORAGE_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const rest = (q: string, init: RequestInit = {}) =>
      fetch(`${base}/rest/v1/${q}`, {
        ...init,
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });

    // 対象: 旧・公開URL か Zoomの生URL を、どちらかの列に持っているアポ
    const cond = 'or=(recording_url.like.*public/recordings*,appo_report.like.*public/recordings*'
      + ',recording_url.like.*zoom.us*,appo_report.like.*zoom.us*)';
    const res = await rest(`appointments?select=id,item_id,recording_url,appo_report&${cond}&limit=${limit}`);
    if (!res.ok) return reply({ ok: false, error: `アポの取得に失敗: ${res.status} ${await res.text()}` }, 500);
    const appos: Appo[] = await res.json();

    // Zoomの生URLが残っているアポは、同じ企業の架電記録から録音を探して差し替える。
    const needFallback = appos.filter((a) =>
      a.item_id && (HAS_ZOOM.test(a.recording_url ?? '') || HAS_ZOOM.test(a.appo_report ?? '')));
    const byItem = new Map<string, string>();
    for (let i = 0; i < needFallback.length; i += 100) {
      const ids = needFallback.slice(i, i + 100).map((a) => a.item_id!).join(',');
      const r = await rest(`call_records?select=item_id,recording_url,called_at&item_id=in.(${ids})&order=called_at.asc`);
      if (!r.ok) continue;
      for (const cr of await r.json() as { item_id: string; recording_url: string | null }[]) {
        const k = recordingKeyOf(cr.recording_url);
        if (k) byItem.set(cr.item_id, k); // 昇順なので最後に勝つのが最新
      }
    }

    // 鍵→新しいURL。同じ鍵を何度も署名し直さない。
    const cache = new Map<string, string>();
    const share = async (k: string) => {
      if (!cache.has(k)) cache.set(k, await recShareUrl(k));
      return cache.get(k)!;
    };

    const swap = async (text: string | null, itemId: string | null): Promise<string | null> => {
      if (!text) return text;
      let out = text;
      for (const m of [...text.matchAll(OLD_URL)]) {
        const k = recordingKeyOf(m[0]);
        if (k) out = out.split(m[0]).join(await share(k));
      }
      const fallbackKey = itemId ? byItem.get(itemId) : undefined;
      if (fallbackKey) {
        for (const m of [...out.matchAll(ZOOM_URL)]) {
          out = out.split(m[0]).join(await share(fallbackKey));
        }
      }
      return out;
    };

    let changed = 0, zoomFixed = 0, zoomUnresolved = 0;
    const samples: unknown[] = [];
    for (const a of appos) {
      const hadZoom = HAS_ZOOM.test(a.recording_url ?? '') || HAS_ZOOM.test(a.appo_report ?? '');
      const url = await swap(a.recording_url, a.item_id);
      const rep = await swap(a.appo_report, a.item_id);
      if (url === a.recording_url && rep === a.appo_report) {
        if (hadZoom) zoomUnresolved++;
        continue;
      }
      if (hadZoom) zoomFixed++;
      changed++;
      if (samples.length < 5) samples.push({ id: a.id, before: a.recording_url, after: url });
      if (!dryRun) {
        const p = await rest(`appointments?id=eq.${a.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ recording_url: url, appo_report: rep }),
        });
        if (!p.ok) console.error('[backfill-rec-urls] 更新失敗', a.id, p.status, await p.text());
      }
    }

    return reply({
      ok: true, dryRun, 対象件数: appos.length, 書き換え: changed,
      Zoom生URLを差し替え: zoomFixed, Zoom生URLだが録音が見つからない: zoomUnresolved,
      鍵の種類: cache.size, 例: samples,
    });
  } catch (e) {
    console.error('[backfill-rec-urls]', e);
    return reply({ ok: false, error: String(e) }, 500);
  }
});
