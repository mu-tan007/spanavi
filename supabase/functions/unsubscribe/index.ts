// unsubscribe: 受信者からの配信停止リクエストを処理する
//
// メール本文末尾の配信停止リンク (例: https://app.spanavi.jp/unsubscribe?rid=<uuid>&token=<hmac>) から
// 直接アクセスされる公開エンドポイント。
//
// 動作:
//   1. GET /?rid=...&token=... を受信
//   2. recipient を取得
//   3. HMAC-SHA256(secret, recipient_id) を再計算し token と比較
//   4. email_unsubscribes に INSERT (scope='global', source='link')
//   5. email_events に 'unsubscribed' イベント追加
//   6. シンプルな HTML 完了画面を返す
//
// 認証: なし (verify_jwt=false で config.toml 設定)
// 検証: HMAC トークンの一致のみ

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

async function generateUnsubscribeToken(recipientId: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(recipientId))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('')
}

function renderPage(title: string, message: string, isError = false): Response {
  const color = isError ? '#c0392b' : '#0D2247'
  const icon = isError ? '!' : '✓'
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: 'Helvetica Neue', 'Hiragino Sans', sans-serif; background: #f5f5f7; margin: 0; padding: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: white; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); padding: 48px 40px; max-width: 480px; text-align: center; }
    .icon { width: 56px; height: 56px; border-radius: 50%; background: ${color}; color: white; font-size: 32px; line-height: 56px; margin: 0 auto 20px; font-weight: bold; }
    h1 { color: ${color}; font-size: 20px; margin: 0 0 16px; font-weight: 600; }
    p { color: #555; font-size: 14px; line-height: 1.7; margin: 0; }
    .footer { margin-top: 32px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="footer">M&Aソーシングパートナーズ株式会社</p>
  </div>
</body>
</html>`
  return new Response(html, {
    status: isError ? 400 : 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const rid = url.searchParams.get('rid')
  const token = url.searchParams.get('token')

  if (!rid || !token) {
    return renderPage('リクエストエラー', 'リンクが無効です。', true)
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const hmacSecret = (Deno.env.get('UNSUBSCRIBE_HMAC_SECRET') ?? '').trim()

  if (!hmacSecret) {
    console.error('UNSUBSCRIBE_HMAC_SECRET not configured')
    return renderPage('システムエラー', 'サーバー設定に問題があります。お手数ですが配信元までご連絡ください。', true)
  }

  // HMAC 再計算で token 検証
  const expectedToken = await generateUnsubscribeToken(rid, hmacSecret)
  if (token !== expectedToken) {
    return renderPage('リンク無効', 'このリンクは無効か期限切れです。', true)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: recipient, error: recError } = await supabase
    .from('email_campaign_recipients')
    .select('id, org_id, email')
    .eq('id', rid)
    .single()

  if (recError || !recipient) {
    return renderPage('リンク無効', '対象が見つかりませんでした。', true)
  }

  // email_unsubscribes に追加 (scope='global', conflict は無視)
  await supabase
    .from('email_unsubscribes')
    .insert({
      org_id: recipient.org_id,
      email: recipient.email,
      scope: 'global',
      source: 'link',
      source_recipient_id: recipient.id,
    })
    .select()

  // email_events に unsubscribed イベント追加
  await supabase
    .from('email_events')
    .insert({
      recipient_id: recipient.id,
      org_id: recipient.org_id,
      event_type: 'unsubscribed',
      occurred_at: new Date().toISOString(),
      raw_payload: { source: 'unsubscribe_link' },
    })

  // recipient status を unsubscribed に更新
  await supabase
    .from('email_campaign_recipients')
    .update({ status: 'unsubscribed' })
    .eq('id', recipient.id)

  return renderPage(
    '配信停止を承りました',
    `${recipient.email} 宛のメルマガ配信を停止しました。再度配信を希望される場合は配信元までお問い合わせください。`
  )
})
