import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 処理対象のWebhookイベント
// caller_* = 発信側（自社→外部）のイベント。
// callee_* = 着信側（外部→自社）のイベント。
const OUTBOUND_EVENTS = new Set([
  'phone.caller_ringing',
  'phone.caller_connected',
  'phone.caller_ended',
])
const INBOUND_RINGING = 'phone.callee_ringing'
const INBOUND_ANSWERED = new Set(['phone.callee_connected', 'phone.callee_answered'])
const INBOUND_ENDED = 'phone.callee_ended'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // Zoom Webhook URL検証リクエストへの応答
    if (body.event === 'endpoint.url_validation') {
      const plainToken = body.payload?.plainToken ?? ''
      const encoder = new TextEncoder()
      const keyData = encoder.encode(Deno.env.get('ZOOM_WEBHOOK_SECRET_TOKEN') ?? '')
      const messageData = encoder.encode(plainToken)
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
      const hashForValidate = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
      return new Response(
        JSON.stringify({ plainToken, encryptedToken: hashForValidate }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const eventType = body.event ?? ''

    // ============================================================
    // 発信系イベント → active_calls テーブル管理
    // ============================================================
    if (OUTBOUND_EVENTS.has(eventType)) {
      const payload = body.payload ?? {}
      const object = payload.object ?? {}
      const callId = object.call_id ?? ''

      if (!callId) {
        console.warn('[receive-zoom-webhook] call_id なし:', eventType)
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // caller/callee情報
      const callerUserId = object.caller?.user_id ?? object.user_id ?? ''
      const calleeNumber = (object.callee?.phone_number ?? '').replace(/[^\d]/g, '')
      const callerName = object.caller?.name ?? object.caller?.display_name ?? ''
      const calleeName = object.callee?.name ?? object.callee?.display_name ?? ''

      // org_idをmembersテーブルから解決
      let orgId: string | null = null
      if (callerUserId) {
        const { data: member } = await supabase
          .from('members')
          .select('org_id, name')
          .eq('zoom_user_id', callerUserId)
          .limit(1)
          .single()
        if (member) {
          orgId = member.org_id
        }
      }
      // フォールバック: 最初のorgを使用
      if (!orgId) {
        const { data: firstOrg } = await supabase
          .from('members')
          .select('org_id')
          .limit(1)
          .single()
        orgId = firstOrg?.org_id ?? null
      }

      if (!orgId) {
        console.error('[receive-zoom-webhook] org_id 解決不可:', eventType, callerUserId)
        return new Response(JSON.stringify({ ok: false, error: 'org_id not found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // callee_number → 企業名解決
      // phone（会社番号）/ sub_phone_number（別事業所）/ keyman_mobile（キーマン携帯）の
      // いずれにヒットしても紐づける。番号は 0始まり / +81始まり の表記揺れも吸収。
      let resolvedCalleeName = calleeName
      let resolvedCallerName = callerName
      if (calleeNumber && !resolvedCalleeName) {
        const variants = Array.from(new Set([
          calleeNumber,
          `0${calleeNumber}`,
          `+81${calleeNumber.replace(/^0/, '')}`,
        ].filter(Boolean)))
        const orClause = variants.flatMap(v => [
          `phone.eq.${v}`,
          `sub_phone_number.eq.${v}`,
          `keyman_mobile.eq.${v}`,
        ]).join(',')
        const { data: items } = await supabase
          .from('call_list_items')
          .select('company')
          .or(orClause)
          .limit(1)
        if (items?.length) resolvedCalleeName = items[0].company ?? ''
      }
      // caller名をmembersから解決
      if (callerUserId && !resolvedCallerName) {
        const { data: member } = await supabase
          .from('members')
          .select('name')
          .eq('zoom_user_id', callerUserId)
          .limit(1)
          .single()
        if (member) resolvedCallerName = member.name
      }

      // イベントタイプに応じた処理
      if (eventType === 'phone.caller_ringing') {
        // 発信開始 → INSERT
        const { error } = await supabase.from('active_calls').upsert({
          zoom_call_id: callId,
          org_id: orgId,
          caller_zoom_user_id: callerUserId || null,
          caller_name: resolvedCallerName || null,
          callee_number: object.callee?.phone_number || null,
          callee_name: resolvedCalleeName || null,
          call_status: 'ringing',
          direction: 'outbound',
          started_at: new Date().toISOString(),
        }, { onConflict: 'zoom_call_id' })
        if (error) console.error('[receive-zoom-webhook] active_calls upsert error:', error.message, error.details, error.hint)
        console.log('[receive-zoom-webhook] 📞 ringing:', resolvedCallerName, '→', resolvedCalleeName || calleeNumber, '| orgId:', orgId, '| error:', error?.message ?? 'none')
      }

      if (eventType === 'phone.caller_connected') {
        // 通話接続 → UPDATE
        const { error } = await supabase
          .from('active_calls')
          .update({ call_status: 'connected', connected_at: new Date().toISOString() })
          .eq('zoom_call_id', callId)
        if (error) console.error('[receive-zoom-webhook] active_calls update error:', error.message)
        console.log('[receive-zoom-webhook] 🟢 connected:', callId)
      }

      if (eventType === 'phone.caller_ended') {
        // 通話終了 → UPDATE
        const { error } = await supabase
          .from('active_calls')
          .update({ call_status: 'ended', ended_at: new Date().toISOString() })
          .eq('zoom_call_id', callId)
        if (error) console.error('[receive-zoom-webhook] active_calls update error:', error.message)
        console.log('[receive-zoom-webhook] 🔴 ended:', callId)
      }

      return new Response(
        JSON.stringify({ ok: true, event: eventType, callId, orgId, callerName: resolvedCallerName, calleeName: resolvedCalleeName }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============================================================
    // 着信系イベント → incoming_calls テーブル
    // callee_ringing: 行作成 / callee_connected|answered: 応答時刻記録 / callee_ended: 終了時刻+duration記録
    // ============================================================
    if (eventType === INBOUND_RINGING || INBOUND_ANSWERED.has(eventType) || eventType === INBOUND_ENDED) {
      const payload = body.payload ?? {}
      const object = payload.object ?? {}
      const callId: string = object.call_id ?? ''

      const rawNumber: string = object.caller?.phone_number ?? object.caller_number ?? ''
      const callerNumber = rawNumber.replace(/[^\d]/g, '')
      const callerNameIncoming: string = object.caller?.name ?? object.caller_name ?? ''
      const calleeUserId: string = object.callee?.user_id ?? ''

      // org_id解決: callee(着信先)のuser_idからmembersを引く
      let orgId: string | null = null
      if (calleeUserId) {
        const { data: member } = await supabase
          .from('members')
          .select('org_id')
          .eq('zoom_user_id', calleeUserId)
          .limit(1)
          .single()
        if (member) orgId = member.org_id
      }
      if (!orgId) {
        const { data: firstOrg } = await supabase.from('members').select('org_id').limit(1).single()
        orgId = firstOrg?.org_id ?? null
      }

      // ── ringing: INSERT（zoom_call_id付き）────────────────────────
      if (eventType === INBOUND_RINGING) {
        let itemId: string | null = null
        let companyName: string | null = null

        if (callerNumber) {
          // 着信側も phone / sub_phone_number / keyman_mobile の 3 列で照合
          const variants = Array.from(new Set([
            callerNumber,
            `0${callerNumber}`,
            `+81${callerNumber.replace(/^0/, '')}`,
          ].filter(Boolean)))
          const orClause = variants.flatMap(v => [
            `phone.eq.${v}`,
            `sub_phone_number.eq.${v}`,
            `keyman_mobile.eq.${v}`,
          ]).join(',')
          const { data: items } = await supabase
            .from('call_list_items')
            .select('id, company, phone, sub_phone_number, keyman_mobile')
            .or(orClause)
            .limit(1)

          if (items && items.length > 0) {
            itemId = items[0].id
            companyName = items[0].company ?? null
          } else {
            // Phase B fallback: active_calls の発信履歴（最近 60 日）から
            // 同じ番号にかけた callee_name を引いて、call_list_items で会社名一致を探す。
            // 見つかったら keyman_mobile に逆書き戻し（learn-once）。
            const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
            const acVariants = variants.flatMap(v => [v, `+81${v.replace(/^0/, '')}`])
            const acOr = acVariants.map(v => `callee_number.eq.${v}`).join(',')
            const { data: pastCalls } = await supabase
              .from('active_calls')
              .select('callee_name, callee_number, started_at')
              .eq('org_id', orgId)
              .eq('direction', 'outbound')
              .gte('started_at', sixtyDaysAgo)
              .not('callee_name', 'is', null)
              .or(acOr)
              .order('started_at', { ascending: false })
              .limit(5)

            const guessName = (pastCalls || []).find(p => p.callee_name)?.callee_name
            if (guessName) {
              const { data: matched } = await supabase
                .from('call_list_items')
                .select('id, company')
                .eq('org_id', orgId)
                .eq('company', guessName)
                .order('created_at', { ascending: false })
                .limit(1)
              if (matched && matched.length > 0) {
                itemId = matched[0].id
                companyName = matched[0].company
                // 学習: 既存 keyman_mobile が null または空文字なら normalize 形式で保存
                // （表記揺れによる phoneItemMap マッチ漏れ防止）
                const { data: currentItem } = await supabase
                  .from('call_list_items')
                  .select('keyman_mobile')
                  .eq('id', itemId)
                  .single()
                const existing = (currentItem?.keyman_mobile || '').trim()
                if (!existing) {
                  // 国番号 81 → 先頭 0 表記に正規化（09043069338 形式）
                  const toSave = callerNumber.startsWith('81')
                    ? '0' + callerNumber.slice(2)
                    : (callerNumber || rawNumber || '')
                  await supabase
                    .from('call_list_items')
                    .update({ keyman_mobile: toSave })
                    .eq('id', itemId)
                }
                console.log('[receive-zoom-webhook] inbound fallback link+learn:', companyName, '<-', rawNumber)
              }
            }
          }
        }

        const { error: insertError } = await supabase
          .from('incoming_calls')
          .insert({
            org_id: orgId,
            zoom_call_id: callId || null,
            caller_number: rawNumber || null,
            caller_name: callerNameIncoming || null,
            answered_by_zoom_user_id: calleeUserId || null,
            item_id: itemId,
            company_name: companyName,
            received_at: new Date().toISOString(),
            status: '未対応',
          })

        if (insertError) {
          console.error('[receive-zoom-webhook] incoming insert error:', insertError.message)
          return new Response(
            JSON.stringify({ ok: false, error: insertError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log('[receive-zoom-webhook] 着信登録完了 | caller:', rawNumber, '| company:', companyName, '| callId:', callId)
        return new Response(
          JSON.stringify({ ok: true, callerNumber: rawNumber, companyName, itemId, callId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ── connected / answered: 応答時刻を記録（任意：incoming_calls に answered_at がないので duration 計算用に使う）
      // ── ended: 終了時刻と duration を更新
      if (eventType === INBOUND_ENDED) {
        if (!callId) {
          return new Response(JSON.stringify({ ok: true, skipped: 'no call_id' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        // 該当 incoming_calls 行を取得して duration を計算
        const { data: row } = await supabase
          .from('incoming_calls')
          .select('id, received_at')
          .eq('zoom_call_id', callId)
          .limit(1)
          .single()
        if (row) {
          const endedAt = new Date()
          const startedAt = row.received_at ? new Date(row.received_at) : null
          const duration = startedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : null
          await supabase
            .from('incoming_calls')
            .update({ ended_at: endedAt.toISOString(), duration_sec: duration })
            .eq('id', row.id)
          console.log('[receive-zoom-webhook] 着信終了:', callId, 'duration=', duration)
        }
        return new Response(JSON.stringify({ ok: true, event: eventType, callId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // connected/answered は今のところ side effect なし（duration は ended で計算）
      return new Response(JSON.stringify({ ok: true, event: eventType, callId, skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ============================================================
    // その他のイベント → スキップ
    // ============================================================
    console.log('[receive-zoom-webhook] skipped event:', eventType)
    return new Response(
      JSON.stringify({ ok: true, skipped: true, event: eventType }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[receive-zoom-webhook] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
