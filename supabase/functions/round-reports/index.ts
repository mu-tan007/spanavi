// ============================================================
// 架電の周回報告（2026-10-05 篠宮）
// ------------------------------------------------------------
// action:
//   detect        毎朝（pg_cron）。アクティブなリストで周回が終わったものに、報告の下書きを1本作る
//   create_manual 管理者。周回の途中でリストを終えるときなど、今の時点の報告を作る
//   send_slack    管理者。下書きをクライアント様の Slack チャンネルへ、むー様の名前で投稿する
//
// 決めごと（むー様 10/5）
// - 全リスト必須・2周目以降も毎周。周回は架電記録だけで数える（アーカイブの切り替えでは数え直さない）
// - 報告は「リスト×何周目」で1回だけ。公開時点で終わっていた周は、直近14日以内の最新の周だけ作る
// - スクリプトの改善案はAIに書かせない。むー様と相談して決める。AIは相談用の材料（断られ方のまとめ）だけ作る
// - 業界平均との比較は載せない
// ============================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/** 改善案の欄の目印。これが残っている間は送信させない */
const SCRIPT_PLACEHOLDER = '（篠宮と相談のうえ記入）'
/** 公開時点で終わっていた周は、この日数以内のものだけ作る */
const RECENT_DAYS = 14
const DOW = ['', '月', '火', '水', '木', '金', '土', '日']

// deno-lint-ignore no-explicit-any
type Stats = any

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({}))
    const action = body.action || 'detect'

    if (action === 'detect') {
      // 社名などは返さない（公開鍵でも呼べるため）
      const result = await detect(sb, body.dry_run === true)
      return json(result)
    }

    // ここから先は管理者だけ
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'ログインが切れています。開き直してください' }, 401)
    const { data: me } = await sb.from('users').select('id, role, org_id').eq('id', userData.user.id).maybeSingle()
    if (me?.role !== 'admin') return json({ error: '管理者だけが使えます' }, 403)

    if (action === 'create_manual') {
      const { data: list } = await sb.from('call_lists').select('id, org_id, name, client_id').eq('id', body.list_id).maybeSingle()
      if (!list || list.org_id !== me.org_id) return json({ error: 'リストが見つかりません' }, 404)
      const { data: prog } = await sb.rpc('round_progress', { p_list_id: list.id })
      // deno-lint-ignore no-explicit-any
      const current = Math.max(0, ...((prog || []) as any[]).map(p => p.round))
      if (!current) return json({ error: 'このリストにはまだ架電の記録がありません' }, 400)
      const id = await createReport(sb, list, current, 'manual', new Date().toISOString())
      return json({ ok: true, id })
    }

    if (action === 'send_slack') {
      const text = String(body.text || '').trim()
      if (!body.report_id || !text) return json({ error: '送る文面がありません' }, 400)
      if (text.includes(SCRIPT_PLACEHOLDER)) return json({ error: 'トークスクリプトの改善案がまだ空です。篠宮と相談のうえ書き込んでください' }, 400)
      const { data: rep } = await sb.from('round_reports').select('id, org_id, status, slack_channel_id').eq('id', body.report_id).maybeSingle()
      if (!rep || rep.org_id !== me.org_id) return json({ error: '報告が見つかりません' }, 404)
      if (rep.status === 'sent') return json({ error: 'すでに送信済みです' }, 409)
      const channel = body.channel_id || rep.slack_channel_id
      if (!channel) return json({ error: '送り先のチャンネルを選んでください' }, 400)
      const token = Deno.env.get('SLACK_USER_TOKEN')?.trim()
      if (!token) return json({ error: 'Slackの許可（篠宮の名前で送信）がまだです' }, 400)
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel, text, unfurl_links: false }),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok) return json({ error: `Slackへの送信に失敗しました（${data.error || res.status}）` }, 502)
      await sb.from('round_reports').update({
        status: 'sent', sent_at: new Date().toISOString(), sent_by: me.id, sent_text: text,
        slack_channel_id: channel, updated_at: new Date().toISOString(),
      }).eq('id', rep.id)
      return json({ ok: true, ts: data.ts })
    }

    return json({ error: `不明な操作です（${action}）` }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

// ------------------------------------------------------------
// 周回の終わったリストを探して下書きを作る
// ------------------------------------------------------------
async function detect(sb: SupabaseClient, dryRun: boolean) {
  const { data: lists, error } = await sb.from('call_lists')
    .select('id, org_id, name, client_id, clients(name)')
    .eq('is_archived', false)
  if (error) throw new Error(error.message)

  let checked = 0, created = 0, skipped = 0
  const failures: string[] = []
  for (const list of lists || []) {
    // 自社の練習・営業用のリストは報告先がないので除く
    // deno-lint-ignore no-explicit-any
    const clientName = (list as any).clients?.name || ''
    if (/ソーシングパートナーズ|Spartia/.test(clientName)) continue
    checked++
    try {
      const { data: prog, error: pErr } = await sb.rpc('round_progress', { p_list_id: list.id })
      if (pErr) throw new Error(pErr.message)
      const rows = (prog || []) as { round: number; targets: number; done: number; completed_at: string | null }[]
      if (!rows.length) continue
      // 対象が少なすぎる周（かけ直しの数社だけ残った周）は報告しない
      const minTargets = Math.max(30, Math.ceil((rows[0]?.targets || 0) * 0.05))
      const finished = rows.filter(r => r.completed_at && r.targets >= minTargets)
      const latest = finished[finished.length - 1]
      if (!latest) continue
      if (Date.now() - new Date(latest.completed_at!).getTime() > RECENT_DAYS * 86400_000) { skipped++; continue }
      // この周、またはもっと後の周の報告がもうあれば作らない
      const { data: existing } = await sb.from('round_reports').select('id')
        .eq('list_id', list.id).eq('kind', 'round').gte('round', latest.round).limit(1)
      if (existing?.length) continue
      if (dryRun) { created++; continue }
      const id = await createReport(sb, list, latest.round, 'round', latest.completed_at!)
      if (id) {
        created++
        await notifyAdmins(sb, list.org_id, `${clientName}「${listLabel(list.name)}」が${latest.round}周目を終えました。報告の下書きがあります。スクリプトの改善案は篠宮と相談してから送ってください`)
      }
    } catch (e) {
      failures.push((e as Error).message)
    }
  }
  return { ok: true, dry_run: dryRun, checked, created, skipped_old: skipped, failures: failures.length }
}

/** 下書きを1本作る。kind='round' は一意なので、同時に走っても二重にはならない */
async function createReport(
  sb: SupabaseClient,
  list: { id: string; org_id: string; name: string; client_id: string | null },
  round: number, kind: 'round' | 'manual', completedAt: string,
): Promise<string | null> {
  const { data: stats, error } = await sb.rpc('round_report_stats', { p_list_id: list.id, p_round: round })
  if (error) throw new Error(error.message)

  const { data: client } = list.client_id
    ? await sb.from('clients').select('name, contact_method, slack_channel_ids').eq('id', list.client_id).maybeSingle()
    : { data: null }
  const { options, defaultChannel, mentions } = await slackDestination(client?.slack_channel_ids || [], list.name)
  const materials = await buildMaterials(sb, list.id, kind === 'manual' ? null : round).catch(e => `（材料を作れませんでした：${(e as Error).message}）`)

  const { data, error: insErr } = await sb.from('round_reports').insert({
    org_id: list.org_id, list_id: list.id, client_id: list.client_id, round, kind,
    completed_at: completedAt, stats,
    draft_text: buildDraft(list.name, stats, kind, mentions),
    materials,
    slack_channel_id: defaultChannel, slack_channel_options: options,
  }).select('id').maybeSingle()
  if (insErr) {
    if (insErr.code === '23505') return null // もう作られていた
    throw new Error(insErr.message)
  }
  return data?.id || null
}

/** 「レバレジーズM&Aアドバイザリー株式会社 - 物流」→「物流」 */
function listLabel(name: string): string {
  const i = name.indexOf(' - ')
  return i >= 0 ? name.slice(i + 3).trim() : name
}

const pct = (n: number, d: number) => d ? `${(Math.round(n / d * 1000) / 10).toFixed(1)}%` : '—'
const md = (d: string | null | undefined) => {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

/** 先方への文面。改善案の欄は空けておく（むー様が相談のうえ書く） */
function buildDraft(listName: string, s: Stats, kind: 'round' | 'manual', mentions: string): string {
  const r = s.round
  const t = s.this || { calls: 0, companies: 0, talks: 0, appo: 0 }
  const lines: string[] = []
  if (mentions) lines.push(mentions)
  lines.push('お世話になっております。')
  if (kind === 'manual') {
    // 途中報告：いちばん後ろの周は数社だけのことが多いので、周ごとの結果と累計でまとめる
    const total = s.total || {}
    const rounds = (s.rounds || []) as { round: number; companies: number; calls: number; talks: number; appo: number }[]
    const minCompanies = Math.max(30, Math.ceil((rounds[0]?.companies || 0) * 0.05))
    lines.push(`「${listLabel(listName)}」リストにつきまして、これまでの架電状況をご報告申し上げます。`)
    lines.push('')
    lines.push(`■これまでの結果（${md(total.first_day)}〜${md(total.last_day)}）`)
    lines.push(`・架電：${Number(total.companies || 0).toLocaleString()}社（${Number(total.calls || 0).toLocaleString()}コール）`)
    lines.push(`・社長様との接続：${Number(total.talks || 0).toLocaleString()}件（接続率${pct(total.talks, total.calls)}）`)
    lines.push(`・アポイント：${total.appo || 0}件`)
    const shown = rounds.filter(x => x.companies >= minCompanies)
    if (shown.length > 1) {
      lines.push('')
      lines.push('■周ごとの結果')
      for (const x of shown) lines.push(`・${x.round}周目：${x.companies.toLocaleString()}社、接続率${pct(x.talks, x.calls)}、アポイント${x.appo}件`)
    }
    appendTail(lines, s)
    return lines.join('\n')
  }
  lines.push(`「${listLabel(listName)}」リストの${r}周目の架電が一通り完了いたしましたので、ご報告申し上げます。`)
  lines.push('')
  lines.push(`■${r}周目の結果（${md(t.first_day)}〜${md(t.last_day)}）`)
  lines.push(`・架電：${t.companies.toLocaleString()}社（${t.calls.toLocaleString()}コール）`)
  lines.push(`・社長様との接続：${t.talks.toLocaleString()}件（接続率${pct(t.talks, t.calls)}）`)
  lines.push(`・アポイント：${t.appo}件`)
  if (s.prev) lines.push(`・前回（${r - 1}周目）：接続率${pct(s.prev.talks, s.prev.calls)}、アポイント${s.prev.appo}件`)
  if (r > 1 && s.total) {
    lines.push('')
    lines.push(`■累計（${Number(s.total.companies).toLocaleString()}社・${Number(s.total.calls).toLocaleString()}コール）`)
    lines.push(`・社長様との接続：${Number(s.total.talks).toLocaleString()}件（接続率${pct(s.total.talks, s.total.calls)}）`)
    lines.push(`・アポイント：${s.total.appo}件`)
  }
  appendTail(lines, s)
  return lines.join('\n')
}

/** つながりやすい時間帯・改善案の欄（空けておく）・締め */
function appendTail(lines: string[], s: Stats) {
  if (s.best_slots?.length) {
    lines.push('')
    lines.push('■社長様につながりやすい曜日・時間帯（累計）')
    for (const b of s.best_slots) lines.push(`・${DOW[b.dow]}曜 ${b.hour}時台：接続率${pct(b.talks, b.calls)}（${b.calls}コール）`)
  }
  lines.push('')
  lines.push('■トークスクリプトの改善案')
  lines.push(SCRIPT_PLACEHOLDER)
  lines.push('')
  lines.push('引き続き何卒よろしくお願い申し上げます。')
}

/**
 * 相談用の材料：その周で断られた記録（架電後にAIが付けた所見）を、断られ方の型に分けて短くまとめる。
 * 改善案は書かせない。先方には出さない。
 */
async function buildMaterials(sb: SupabaseClient, listId: string, round: number | null): Promise<string> {
  // 途中報告（round=null）はリスト全体の直近の記録から作る
  let q = sb.from('call_records').select('status, rejection_reason').eq('list_id', listId)
  if (round !== null) q = q.eq('round', round)
  const { data } = await q
    .in('status', ['キーマン断り', '受付ブロック'])
    .not('rejection_reason', 'is', null)
    .order('called_at', { ascending: false })
    .limit(120)
  const rows = (data || []).filter(r => (r.rejection_reason || '').trim())
  if (!rows.length) return '断られた記録の所見はありません。'
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY がありません')
  const input = rows.map((r, i) => `${i + 1}.［${r.status}］${String(r.rejection_reason).replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 1500,
      system: `M&A仲介の売り手ソーシングのテレアポで、社長または受付に断られた記録の一覧を渡す。
トークスクリプトの見直しを社長と相談するための材料として、断られ方を3〜5個の型に分けて日本語で書く。
- 各型に「件数の目安」と「実際の言い回しや状況の例」を1〜2個付ける
- 受付で止められた型と、社長本人に断られた型は分ける
- 改善案・提案・評価は書かない（それは人が決める）
- 見出しは「・」で始め、全体で15行以内。前置きと締めの文は書かない`,
      messages: [{ role: 'user', content: input }],
    }),
  })
  const out = await res.json()
  if (!res.ok) throw new Error(out?.error?.message || String(res.status))
  const text = (out.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('').trim()
  return `${rows.length}件の断られた記録から作成（先方には出さない）\n${text}`
}

/**
 * 送り先の候補：クライアント様に登録した Slack チャンネル。名前はむー様の Slack の許可で引く。
 * 既定は、チャンネル名にリスト名の業種が入っているもの（例：物流 → #レバレジーズ-物流チーム）。1つしかなければそれ。
 * メンションは、そのチャンネルでむー様が最後に出した、メンションで始まる投稿の宛先をそのまま使う。
 */
async function slackDestination(channelIds: string[], listName: string): Promise<{ options: { id: string; name: string }[]; defaultChannel: string | null; mentions: string }> {
  const token = Deno.env.get('SLACK_USER_TOKEN')?.trim()
  const options: { id: string; name: string }[] = []
  if (!channelIds.length) return { options, defaultChannel: null, mentions: '' }
  for (const id of channelIds) {
    let name = id
    if (token) {
      const info = await fetch(`https://slack.com/api/conversations.info?${new URLSearchParams({ channel: id })}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).catch(() => ({}))
      if (info?.ok && info.channel?.name) name = info.channel.name
      else {
        // むー様の許可にチャンネル一覧の権限が無いときは、検索結果に付くチャンネル名で引く
        const hit = await fetch(`https://slack.com/api/search.messages?${new URLSearchParams({ query: `in:<#${id}>`, count: '1' })}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).catch(() => ({}))
        const nm = hit?.messages?.matches?.[0]?.channel?.name
        if (nm) name = nm
      }
    }
    options.push({ id, name })
  }
  const label = listLabel(listName).replace(/[①-⑳0-9０-９（）()]/g, '').trim()
  const byName = label ? options.find(o => o.name.includes(label)) : undefined
  const defaultChannel = byName?.id || (options.length === 1 ? options[0].id : null)

  let mentions = ''
  if (token && defaultChannel) {
    const me = await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({}))
    if (me?.user_id) {
      const res = await fetch(`https://slack.com/api/search.messages?${new URLSearchParams({ query: `from:<@${me.user_id}> in:<#${defaultChannel}>`, sort: 'timestamp', sort_dir: 'desc', count: '20' })}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).catch(() => ({}))
      // deno-lint-ignore no-explicit-any
      const hit = (res?.messages?.matches || []).find((m: any) => /^\s*<@[A-Z0-9]+/.test(m.text || '') && !/thread_ts=/.test(m.permalink || ''))
      if (hit) mentions = ((hit.text || '').match(/^(\s*<@[A-Z0-9]+(?:\|[^>]*)?>\s*|\s*Cc\.\s*)+/)?.[0] || '').trim()
    }
  }
  return { options, defaultChannel, mentions }
}

/** 管理者のスマホとSpanaviの通知へ。押すと事前確認タブ（周回報告の欄）が開く */
async function notifyAdmins(sb: SupabaseClient, orgId: string, body: string) {
  const { data: admins } = await sb.from('users').select('id').eq('org_id', orgId).eq('role', 'admin')
  const ids = (admins || []).map(a => a.id)
  if (!ids.length) return
  const { error } = await sb.functions.invoke('send-push', {
    body: { type: 'round_report', title: '周回報告の下書き', body, user_ids: ids, org_id: orgId, link: '/?tab=precheck' },
  })
  if (error) console.warn('[round-reports] send-push failed:', error.message)
}
