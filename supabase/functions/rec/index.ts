// 録音の受け渡し口（社外向け）
// ---------------------------------------------------------------------------
// アポ取得報告に貼る録音URLの行き先。**ログイン不要**（verify_jwt=false）。
//
// なぜ要るか:
//   録音の実体を R2 へ移して recordings バケットを非公開にした（2026-08-24）。
//   DBに入っている `/storage/v1/object/public/recordings/<鍵>` は、
//   それ以降ただの「鍵の入れ物」で、押しても400が返る。
//   ところがこの文字列をそのままアポ取得報告に貼って先方へ送っていたため、
//   社外では録音が1本も再生できなくなっていた（2026-08-25 フラーレン様より指摘）。
//
// この口は押されるたびに R2 の署名付きURLを作り直して転送する。
// URLは期限切れにならず、報告書に貼りっぱなしにできる。
//
// ⚠️ ログイン不要なので、**署名の照合がそのまま鍵**になる。
//    鍵はファイル名で指定されるため、照合を外すと名前を打ち込むだけで
//    他社の商談録音まで聴けてしまう。
// ⚠️ 相手先に自社の商談録音を渡すための口である。ここを社内向けに流用しない
//    （社内は r2 の sign-get を通す。あちらは may_read_r2_key で人を確かめている）。

import { recShareSig, r2SignedGet } from '../_shared/recordingSource.ts';

const HTML = 'text/html; charset=utf-8';

function page(status: number, title: string, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${title}</title>`
    + `<div style="font-family:system-ui,'Hiragino Kaku Gothic ProN',sans-serif;`
    + `max-width:34em;margin:16vh auto;padding:0 1.5em;line-height:1.9;color:#1f2937">`
    + `<h1 style="font-size:1.15rem;color:#0D2247;margin:0 0 .8em">${title}</h1>`
    + `<p style="margin:0;font-size:.95rem">${body}</p></div>`,
    { status, headers: { 'Content-Type': HTML } },
  );
}

// 署名の照合。長さと中身を最後まで見てから返す（当てずっぽうを繰り返して
// 1文字ずつ詰められないように、途中で打ち切らない）。
function sameSig(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return page(405, '開けません', 'このリンクはブラウザで開いてください。');
  }

  try {
    const url = new URL(req.url);

    // パスは環境によって /rec/<鍵> にも /functions/v1/rec/<鍵> にもなる。
    // 目印より後ろを丸ごと鍵として扱う。
    const i = url.pathname.indexOf('/rec/');
    const raw = i < 0 ? '' : url.pathname.slice(i + '/rec/'.length);
    let key = '';
    try { key = decodeURIComponent(raw); } catch { key = raw; }

    // 鍵に上の階層へ登る指定が混ざっていたら受け付けない。
    if (!key || key.includes('..')) {
      return page(404, '録音が見つかりません', 'リンクが正しくない可能性があります。担当者までお知らせください。');
    }

    if (!sameSig(url.searchParams.get('s') ?? '', await recShareSig(key))) {
      return page(403, 'このリンクは無効です', 'リンクの有効期限が切れているか、URLが途中で切れている可能性があります。担当者までお知らせください。');
    }

    // 実体があるか確かめてから転送する。
    // ⚠️ 署名にはメソッドが含まれる。GET用の署名でHEADを投げると必ず403になるので、
    //    存在確認は HEAD 用に署名し直したURLで行う（2026-08-24 に踏んだ）。
    const probeUrl = await r2SignedGet(key, 60, 'HEAD');
    const probe = probeUrl ? await fetch(probeUrl, { method: 'HEAD' }).catch(() => null) : null;

    if (probe?.ok) {
      const signed = await r2SignedGet(key, 3600);
      if (signed) return Response.redirect(signed, 302);
    }

    // ⚠️ かつてここに Supabase Storage への回り道があったが、外した（2026-09-04）。
    //    移設のあと recordings バケットごと消してあり、問い合わせても
    //    `NoSuchBucket` しか返らない。**成功しうる道ではない。**
    //    残しておくと「まだ2か所を探している」と読めてしまう。
    //
    // ⚠️ ここへ来る理由は「期限切れ」ではない。保存期間は設けていない（2026-09-04 確定）。
    //    実際にここへ落ちるのは、鍵が壊れている・そもそも録れていない、のいずれか。
    //    期限のせいにすると、先方に嘘の説明をすることになる。
    console.error('[rec] R2に見つかりません:', key);
    return page(
      404,
      '録音が見つかりません',
      'お手数ですが、担当者までお問い合わせください。'
      + '録音そのものが残っている場合は、あらためてリンクをお送りいたします。',
    );
  } catch (e) {
    console.error('[rec] エラー:', e);
    return page(500, '一時的に開けません', '時間をおいて開き直してください。解消しない場合は担当者までお知らせください。');
  }
});
