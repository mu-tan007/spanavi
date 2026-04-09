import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 呼び出し元の認証を検証（管理者のみ許可）
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '認証が必要です' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 呼び出し元ユーザーの認証確認
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 呼び出し元が管理者か確認
    const { data: callerMember } = await userClient
      .from('members')
      .select('role')
      .or(`email.eq.${user.email},id.eq.${user.email?.match(/^user_(.+)@masp-internal\.com$/)?.[1] || ''}`)
      .single()

    if (!callerMember || callerMember.role !== 'admin') {
      return new Response(JSON.stringify({ error: '管理者権限が必要です' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, name, orgId, role, rank, position, resend } = await req.json()

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'email, name は必須です' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // service_role クライアント（管理者API用）
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    let memberId: string | null = null

    if (resend) {
      // 再送モード: membersテーブルへのINSERTをスキップ
    } else {
      // 新規追加モード: members テーブルに追加
      if (!orgId) {
        return new Response(JSON.stringify({ error: 'orgId は必須です' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: member, error: memberError } = await adminClient
        .from('members')
        .insert({
          org_id: orgId,
          name,
          email,
          role: role || 'caller',
          rank: rank || 'トレーニー',
          position: position || 'メンバー',
          is_active: true,
          start_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single()

      if (memberError) {
        return new Response(JSON.stringify({ error: `メンバー作成失敗: ${memberError.message}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      memberId = member.id
    }

    // Supabase Auth で招待メール送信
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name },
    })

    if (inviteError) {
      if (!resend && memberId) {
        // 新規追加で招待失敗時は作成したメンバーを削除
        await adminClient.from('members').delete().eq('id', memberId)
      }
      return new Response(JSON.stringify({ error: `招待メール送信失敗: ${inviteError.message}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      memberId,
      message: `${email} に招待メールを送信しました`,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
