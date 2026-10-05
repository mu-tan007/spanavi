// ============================================================
// acq-slack-notify
// ----------------------------------------------------------------
// 買収：配信の見張り（/haishin）が見つけた案件を、Slack の鍵付き
// チャンネル #買収案件 に Spanavi のボットで投稿する。
// むー様のアカウントで投稿すると自分宛てのメンションで通知が鳴らないため、
// ボットから必ずむー様にメンションを付けて送る（2026-10-06 むー様指示）。
//
// 呼べるのは service_role の鍵を持つ者だけ（/haishin のスクリプト）。
// 署名の検証は関数の入口（verify_jwt=true）に任せ、ここでは role が service_role かだけを見る。
// 入力: { text: string }  先頭に <@むー様> を自動で付ける
//      { whoami: true }   ボットのユーザーIDを返す（チャンネルに招待する用）
// 環境変数: SLACK_BOT_TOKEN（chat:write）
// ============================================================

const CHANNEL_ID = 'C0C6CESEJ8P'; // #買収案件（鍵付き）
const MU_USER_ID = 'U08T8DQ79V1'; // 篠宮（むー様）

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') || '';
  let role = '';
  try {
    const payload = auth.replace(/^Bearer\s+/i, '').split('.')[1] || '';
    role = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role || '';
  } catch { /* not a jwt */ }
  if (role !== 'service_role') {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 });
  }
  const token = Deno.env.get('SLACK_BOT_TOKEN');
  if (!token) return new Response(JSON.stringify({ ok: false, error: 'SLACK_BOT_TOKEN missing' }), { status: 500 });

  let body: { text?: string; whoami?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body.whoami) {
    const r = await fetch('https://slack.com/api/auth.test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    return new Response(JSON.stringify({ ok: j.ok, user_id: j.user_id, bot_id: j.bot_id, error: j.error }), { headers: { 'Content-Type': 'application/json' } });
  }

  const text = String(body.text || '').trim();
  if (!text) return new Response(JSON.stringify({ ok: false, error: 'text is empty' }), { status: 400 });
  const mention = `<@${MU_USER_ID}>`;
  const message = text.startsWith(mention) ? text : `${mention} ${text}`;

  const r = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: CHANNEL_ID, text: message, unfurl_links: false }),
  });
  const j = await r.json();
  return new Response(JSON.stringify({ ok: j.ok, ts: j.ts, error: j.error }), {
    status: j.ok ? 200 : 502, headers: { 'Content-Type': 'application/json' },
  });
});
