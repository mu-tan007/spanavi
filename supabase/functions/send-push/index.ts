import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================
// VAPID helpers using Web Crypto API (Deno-native)
// ============================================================

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - str.length % 4) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importVapidPrivateKey(base64UrlPrivateKey: string): Promise<CryptoKey> {
  const rawBytes = base64UrlDecode(base64UrlPrivateKey)
  // ECDSA P-256 private key in raw format (32 bytes) → JWK
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: base64UrlPrivateKey,
    // We need x and y from the public key, but for signing we can import from pkcs8
    // Instead, use JWK with d only — need x,y from public key
    x: '', // filled below
    y: '',
  }

  // Derive the public point from the env var
  const pubBytes = base64UrlDecode(Deno.env.get('VAPID_PUBLIC_KEY')!)
  // Uncompressed public key: 0x04 || x (32 bytes) || y (32 bytes)
  const x = base64UrlEncode(pubBytes.slice(1, 33))
  const y = base64UrlEncode(pubBytes.slice(33, 65))
  jwk.x = x
  jwk.y = y

  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

async function createVapidAuthHeader(
  audience: string,
  subject: string,
  privateKeyBase64Url: string,
  publicKeyBase64Url: string,
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  }

  const enc = new TextEncoder()
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

  const key = await importVapidPrivateKey(privateKeyBase64Url)
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(unsignedToken),
  )

  // Convert DER signature to raw r||s format if needed
  const sigBytes = new Uint8Array(signature)
  let rawSig: Uint8Array
  if (sigBytes.length === 64) {
    rawSig = sigBytes
  } else {
    // Web Crypto on some platforms returns raw r||s directly
    rawSig = sigBytes
  }

  const jwt = `${unsignedToken}.${base64UrlEncode(rawSig)}`

  // Decode the public key for the p256ecdsa param
  return `vapid t=${jwt}, k=${publicKeyBase64Url}`
}

// ============================================================
// Encrypt payload using Web Push encryption (aes128gcm)
// ============================================================

async function encryptPayload(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<{ encrypted: Uint8Array; salt: Uint8Array; localPublicKey: Uint8Array }> {
  const enc = new TextEncoder()

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )

  // Import subscriber's public key
  const subscriberPubBytes = base64UrlDecode(subscription.p256dh)
  const subscriberPubKey = await crypto.subtle.importKey(
    'raw',
    subscriberPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberPubKey },
    localKeyPair.privateKey,
    256,
  )

  // Export local public key
  const localPubKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', localKeyPair.publicKey),
  )

  // Auth secret
  const authSecret = base64UrlDecode(subscription.auth)

  // Salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF helper
  async function hkdf(
    ikm: ArrayBuffer,
    saltBuf: Uint8Array,
    info: Uint8Array,
    length: number,
  ): Promise<ArrayBuffer> {
    const key = await crypto.subtle.importKey('raw', saltBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const prk = await crypto.subtle.sign('HMAC', key, ikm)
    const infoKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const infoWithCounter = new Uint8Array([...info, 1])
    const okm = await crypto.subtle.sign('HMAC', infoKey, infoWithCounter)
    return okm.slice(0, length)
  }

  // IKM for main HKDF
  const ikmInfo = enc.encode('WebPush: info\0')
  const ikmInfoFull = new Uint8Array([
    ...ikmInfo,
    ...subscriberPubBytes,
    ...localPubKeyRaw,
  ])
  const ikm = await hkdf(sharedSecret, authSecret, ikmInfoFull, 32)

  // Content encryption key
  const cekInfo = enc.encode('Content-Encoding: aes128gcm\0')
  const cek = await hkdf(ikm, salt, cekInfo, 16)

  // Nonce
  const nonceInfo = enc.encode('Content-Encoding: nonce\0')
  const nonce = await hkdf(ikm, salt, nonceInfo, 12)

  // Pad and encrypt
  const payloadBytes = enc.encode(payload)
  const paddedPayload = new Uint8Array([...payloadBytes, 2]) // delimiter byte

  const cryptoKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    cryptoKey,
    paddedPayload,
  )

  // Build aes128gcm content
  // Header: salt (16) || rs (4 bytes, big-endian) || idlen (1) || keyid (65 bytes) || ciphertext
  const rs = 4096
  const rsBytes = new Uint8Array(4)
  new DataView(rsBytes.buffer).setUint32(0, rs, false)

  const result = new Uint8Array([
    ...salt,
    ...rsBytes,
    localPubKeyRaw.length,
    ...localPubKeyRaw,
    ...new Uint8Array(ciphertext),
  ])

  return { encrypted: result, salt, localPublicKey: localPubKeyRaw }
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { type, title, body, user_ids, org_id, engagement_id } = await req.json()

    if (!user_ids?.length || !org_id) {
      return new Response(
        JSON.stringify({ error: 'user_ids and org_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 事業ID指定があれば、その事業を OFF にしているユーザーを除外する
    let filteredUserIds = user_ids
    if (engagement_id) {
      const { data: prefs } = await supabase
        .from('push_notification_preferences')
        .select('user_id, enabled')
        .eq('engagement_id', engagement_id)
        .in('user_id', user_ids)
      const disabledUsers = new Set(
        (prefs || []).filter((p: { enabled: boolean }) => !p.enabled).map((p: { user_id: string }) => p.user_id),
      )
      filteredUserIds = user_ids.filter((u: string) => !disabledUsers.has(u))
    }

    if (filteredUserIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: 'All users opted out for this engagement' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Fetch push subscriptions for the given user_ids within the org
    const { data: subscriptions, error: fetchError } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, user_id')
      .eq('org_id', org_id)
      .in('user_id', filteredUserIds)

    if (fetchError) {
      throw new Error(`DB fetch error: ${fetchError.message}`)
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: 'No subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@spanavi.com'

    const payload = JSON.stringify({ type, title, body, url: '/' })
    let sent = 0
    const expiredIds: string[] = []
    const failures: Array<{ endpoint_origin: string; status: number; body: string }> = []

    for (const sub of subscriptions) {
      try {
        const url = new URL(sub.endpoint)
        const audience = `${url.protocol}//${url.host}`

        const authHeader = await createVapidAuthHeader(
          audience,
          vapidSubject,
          vapidPrivateKey,
          vapidPublicKey,
        )

        const { encrypted } = await encryptPayload(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
        )

        const pushRes = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
          },
          body: encrypted,
        })

        if (pushRes.status === 201 || pushRes.status === 200) {
          sent++
        } else if (pushRes.status === 410 || pushRes.status === 404) {
          expiredIds.push(sub.id)
          failures.push({ endpoint_origin: url.host, status: pushRes.status, body: 'expired' })
        } else {
          const errBody = await pushRes.text().catch(() => '')
          console.error(`[send-push] Push failed for ${sub.endpoint}: ${pushRes.status} ${errBody}`)
          failures.push({ endpoint_origin: url.host, status: pushRes.status, body: errBody.slice(0, 200) })
        }
      } catch (pushErr) {
        console.error(`[send-push] Error sending to ${sub.endpoint}:`, pushErr)
        failures.push({ endpoint_origin: 'unknown', status: 0, body: String(pushErr).slice(0, 200) })
      }
    }

    if (expiredIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', expiredIds)
      if (deleteError) {
        console.error('[send-push] Failed to delete expired subscriptions:', deleteError)
      }
    }

    console.log(`[send-push] Sent: ${sent}, Expired: ${expiredIds.length}, Total: ${subscriptions.length}`)
    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        expired: expiredIds.length,
        total: subscriptions.length,
        failures: type === 'test' ? failures : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[send-push] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
