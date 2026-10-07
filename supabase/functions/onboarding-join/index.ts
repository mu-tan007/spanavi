// 入社手続き（2026-10-07 むー様決定）。招待リンクから開く公開ページと、入社した本人の契約同意を受ける。
//  peek     {token}                 … リンクの状態（未ログインで呼ぶ）
//  submit   {token, ...4情報}        … メンバーを作り、パスワード設定のメールを送る（未ログインで呼ぶ・1回だけ）
//  status   {}                      … ログイン中の本人の手続きの状態と案内リンク
//  contract {}                      … 本人の情報を差し込んだ契約書を作り、読むためのリンクと SHA-256 を返す
//  agree    {sha256}                … 同意を記録（時刻・接続元・文書の SHA-256）。表示した版をそのまま正本として保存する
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Docxtemplater from 'npm:docxtemplater@3.68.7'
import PizZip from 'npm:pizzip@3.2.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SB_URL = Deno.env.get('SUPABASE_URL')!
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

// 打ち間違いの多い形（「.@」「..」）も弾く
function emailOk(e: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e) && !/\.@|\.\.|^\./.test(e)
}
const s = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)

function jpDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return `${y}年${m}月${day}日`
}
function endDate(start: string) {
  const d = new Date(start + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
async function sha256(bytes: Uint8Array) {
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

async function currentUser(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  if (!auth) return null
  const c = createClient(SB_URL, anonKey, { global: { headers: { Authorization: auth } } })
  const { data } = await c.auth.getUser()
  return data?.user || null
}

async function inviteForUser(userId: string) {
  const { data: m } = await admin.from('members').select('id, org_id, name, email').eq('user_id', userId).limit(1).maybeSingle()
  if (!m) return { member: null, invite: null }
  const { data: inv } = await admin.from('onboarding_invites').select('*')
    .eq('member_id', m.id).neq('status', 'revoked').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return { member: m, invite: inv }
}

async function pickTemplate(orgId: string, invite: Record<string, unknown>) {
  if (invite.template_id) {
    const { data } = await admin.from('contract_templates').select('id, name, file_path').eq('id', invite.template_id).maybeSingle()
    if (data) return data
  }
  const { data: st } = await admin.from('onboarding_settings').select('default_template_id').eq('org_id', orgId).maybeSingle()
  if (st?.default_template_id) {
    const { data } = await admin.from('contract_templates').select('id, name, file_path').eq('id', st.default_template_id).maybeSingle()
    if (data) return data
  }
  const { data } = await admin.from('contract_templates').select('id, name, file_path')
    .eq('org_id', orgId).eq('is_active', true).ilike('name', '%インターン%').order('uploaded_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

const draftPath = (orgId: string, memberId: string) => `${orgId}/${memberId}/draft.docx`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === 'peek') {
      const { data: inv } = await admin.from('onboarding_invites').select('status, name_hint, expires_at, email').eq('token', s(body.token, 100)).maybeSingle()
      if (!inv) return json(404, { error: 'not_found' })
      return json(200, { status: inv.status, name_hint: inv.name_hint, expired: new Date(inv.expires_at) < new Date(), email: inv.status === 'sent' ? null : inv.email })
    }

    if (action === 'submit') {
      const token = s(body.token, 100)
      const last = s(body.last_name, 30), first = s(body.first_name, 30)
      const email = s(body.email, 120).toLowerCase()
      const address = s(body.address, 200)
      const bank = {
        bank_name: s(body.bank_name, 60), branch_name: s(body.branch_name, 60),
        account_type: ['ordinary', 'checking', 'savings'].includes(body.account_type) ? body.account_type : 'ordinary',
        account_number: s(body.account_number, 10), account_holder: s(body.account_holder, 60),
      }
      const missing = [!last && '姓', !first && '名', !email && 'メールアドレス', !address && '住所', !bank.bank_name && '銀行名', !bank.branch_name && '支店名', !bank.account_number && '口座番号', !bank.account_holder && '口座名義'].filter(Boolean)
      if (missing.length) return json(400, { error: `${missing.join('・')}を入れてください` })
      if (!emailOk(email)) return json(400, { error: 'メールアドレスの形が正しくありません。もう一度確かめてください' })
      if (!/^\d{7}$/.test(bank.account_number)) return json(400, { error: '口座番号は7桁の数字で入れてください' })
      if (!/^[ァ-ヶー　 ・．.()（）]+$/.test(bank.account_holder)) return json(400, { error: '口座名義はカタカナで入れてください' })

      const { data: inv } = await admin.from('onboarding_invites').select('*').eq('token', token).maybeSingle()
      if (!inv) return json(404, { error: 'このリンクは使えません' })
      if (inv.status !== 'sent') return json(409, { error: 'このリンクはすでに使われています' })
      if (new Date(inv.expires_at) < new Date()) return json(410, { error: 'リンクの期限が切れています。担当者に新しいリンクを頼んでください' })

      const { data: existing } = await admin.rpc('find_auth_user_id_by_email', { p_email: email })
      if (existing) return json(409, { error: 'このメールアドレスはすでに登録されています。担当者に連絡してください' })

      // 1回だけ使えるように、先に状態を進める（同時に2回押されても片方だけ通る）
      const { data: locked } = await admin.from('onboarding_invites').update({ status: 'submitting' })
        .eq('id', inv.id).eq('status', 'sent').select('id').maybeSingle()
      if (!locked) return json(409, { error: 'このリンクはすでに使われています' })

      const name = `${last} ${first}`
      const start = inv.start_date || todayJst()
      const { data: mem, error: memErr } = await admin.from('members').insert({
        org_id: inv.org_id, name, email, address, rank: 'トレーニー', position: 'メンバー',
        incentive_rate: 0.22, cumulative_sales: 0, is_active: true,
        start_date: start, operation_start_date: start,
      }).select('id').single()
      if (memErr) {
        await admin.from('onboarding_invites').update({ status: 'sent' }).eq('id', inv.id)
        return json(400, { error: `登録できませんでした：${memErr.message}` })
      }
      await admin.from('member_invoice_profiles').upsert({
        member_id: mem.id, org_id: inv.org_id, address,
        bank_name: bank.bank_name, branch_name: bank.branch_name, account_type: bank.account_type,
        account_number: bank.account_number, account_holder_kana: bank.account_holder,
      }, { onConflict: 'member_id' })

      const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { data: { name } })
      if (invErr) {
        await admin.from('member_invoice_profiles').delete().eq('member_id', mem.id)
        await admin.from('members').delete().eq('id', mem.id)
        await admin.from('onboarding_invites').update({ status: 'sent' }).eq('id', inv.id)
        return json(400, { error: `メールを送れませんでした。アドレスを確かめてください（${invErr.message}）` })
      }
      await admin.from('onboarding_invites').update({
        status: 'submitted', member_id: mem.id, email, submitted_at: new Date().toISOString(),
        submitted: { last_name: last, first_name: first, email, address, bank_name: bank.bank_name, branch_name: bank.branch_name, account_type: bank.account_type, account_holder: bank.account_holder },
      }).eq('id', inv.id)
      return json(200, { ok: true, email })
    }

    // ここから下はログイン中の本人だけ
    const user = await currentUser(req)
    if (!user) return json(401, { error: 'ログインしてください' })
    const { member, invite } = await inviteForUser(user.id)

    if (action === 'status') {
      if (!invite || !member) return json(200, { invite: null })
      const { data: st } = await admin.from('onboarding_settings').select('slack_invite_url, line_group_url').eq('org_id', invite.org_id).maybeSingle()
      return json(200, {
        invite: { status: invite.status, steps: invite.steps, start_date: invite.start_date, signed_at: invite.signed_at },
        member: { name: member.name, email: member.email },
        links: { slack: st?.slack_invite_url || null, line: st?.line_group_url || null },
      })
    }

    if (!invite || !member) return json(404, { error: '手続き中の招待が見つかりません' })

    if (action === 'contract') {
      if (invite.status === 'signed' || invite.status === 'done') return json(409, { error: 'すでに同意済みです' })
      const tpl = await pickTemplate(invite.org_id, invite)
      if (!tpl) return json(500, { error: '契約書のひな形が見つかりません。担当者に連絡してください' })
      const { data: file, error: dlErr } = await admin.storage.from('contract-templates').download(tpl.file_path)
      if (dlErr || !file) return json(500, { error: `ひな形を読めませんでした：${dlErr?.message}` })
      const { data: ip } = await admin.from('member_invoice_profiles').select('*').eq('member_id', member.id).maybeSingle()
      const start = invite.start_date || todayJst()
      const typeJp: Record<string, string> = { ordinary: '普通', checking: '当座', savings: '貯蓄' }
      const doc = new Docxtemplater(new PizZip(new Uint8Array(await file.arrayBuffer())), { paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' } })
      doc.render({
        name: String(member.name).replace(/ /g, '　'),
        address: ip?.address || '',
        start_date: jpDate(start), end_date: jpDate(endDate(start)),
        bank_name: ip?.bank_name || '', bank_branch: ip?.branch_name || '',
        account_type: typeJp[ip?.account_type] || ip?.account_type || '',
        account_number: ip?.account_number || '', account_holder: ip?.account_holder_kana || member.name,
      })
      const bytes = doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' }) as Uint8Array
      const path = draftPath(invite.org_id, member.id)
      const { error: upErr } = await admin.storage.from('contract-agreements').upload(path, bytes, {
        upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      if (upErr) return json(500, { error: `契約書を保存できませんでした：${upErr.message}` })
      const { data: signed } = await admin.storage.from('contract-agreements').createSignedUrl(path, 600)
      await admin.from('onboarding_invites').update({ template_id: tpl.id }).eq('id', invite.id)
      return json(200, { url: signed?.signedUrl, sha256: await sha256(bytes), start_date: start, end_date: endDate(start), template_name: tpl.name })
    }

    if (action === 'agree') {
      if (invite.status === 'signed' || invite.status === 'done') return json(409, { error: 'すでに同意済みです' })
      const path = draftPath(invite.org_id, member.id)
      const { data: file } = await admin.storage.from('contract-agreements').download(path)
      if (!file) return json(404, { error: '契約書が見つかりません。開き直してください' })
      const bytes = new Uint8Array(await file.arrayBuffer())
      const hash = await sha256(bytes)
      if (hash !== s(body.sha256, 80)) return json(409, { error: '表示している契約書が古くなっています。開き直してください' })
      const agreementId = crypto.randomUUID()
      const finalPath = `${invite.org_id}/${member.id}/${agreementId}.docx`
      const { error: mvErr } = await admin.storage.from('contract-agreements').move(path, finalPath)
      if (mvErr) return json(500, { error: `記録できませんでした：${mvErr.message}` })
      const start = invite.start_date || todayJst()
      const { data: c } = await admin.from('contracts').insert({
        org_id: invite.org_id, member_id: member.id, template_id: invite.template_id,
        start_date: start, end_date: endDate(start),
        payload: { signed_in_spanavi: true, agreement_id: agreementId, document_path: finalPath },
      }).select('id').single()
      const ipAddr = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
      const { error: agErr } = await admin.from('contract_agreements').insert({
        id: agreementId, org_id: invite.org_id, member_id: member.id, invite_id: invite.id, contract_id: c?.id || null,
        template_id: invite.template_id, signer_name: member.name, signer_email: user.email || member.email,
        document_path: finalPath, document_sha256: hash, ip: ipAddr, user_agent: s(req.headers.get('user-agent'), 400),
      })
      if (agErr) return json(500, { error: `記録できませんでした：${agErr.message}` })
      const now = new Date().toISOString()
      await admin.from('onboarding_invites').update({ status: 'signed', signed_at: now, steps: { ...(invite.steps || {}), contract: 'signed' } }).eq('id', invite.id)
      return json(200, { ok: true, agreed_at: now, sha256: hash })
    }

    return json(400, { error: 'unknown action' })
  } catch (e) {
    return json(500, { error: (e as Error).message })
  }
})
