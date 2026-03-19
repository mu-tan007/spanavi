// 既存セッションをSlackに一括投稿するワンタイムスクリプト
const SUPABASE_URL = 'https://baiiznjzvzhxwwqzsozn.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI4OTY3NCwiZXhwIjoyMDg2ODY1Njc0fQ.dFtoK7_HOpeGnsq8bxdbihWxJumbtJTOpRqs9cLUSUg'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

// 1. 本日のAI分析済みセッションを取得
const sessRes = await fetch(
  `${SUPABASE_URL}/rest/v1/roleplay_sessions?created_at=gte.2026-03-19&ai_status=eq.done&select=id,user_id,partner_name,session_date,ai_feedback,video_url`,
  { headers }
)
const sessions = await sessRes.json()
console.log('Sessions found:', sessions.length)
console.log(JSON.stringify(sessions, null, 2))

// 2. メンバー情報を取得（id, name, team）
// roleplay_sessions.user_id は members.id を参照
const membRes = await fetch(
  `${SUPABASE_URL}/rest/v1/members?select=id,name,team`,
  { headers }
)
const members = await membRes.json()

// 3. 各セッションをSlackに投稿
for (const s of sessions) {
  const member = members.find(m => m.id === s.user_id)
  if (!member) {
    console.log(`Skip session ${s.id}: member not found for user_id ${s.user_id}`)
    continue
  }
  if (!member.team) {
    console.log(`Skip session ${s.id}: ${member.name} has no team`)
    continue
  }

  const payload = {
    memberName: member.name,
    memberTeam: member.team,
    partnerName: s.partner_name,
    sessionDate: s.session_date,
    aiFeedback: s.ai_feedback,
    videoUrl: s.video_url || null,
  }

  console.log(`Posting for ${member.name} (${member.team}) × ${s.partner_name}...`)

  const slackRes = await fetch(
    `${SUPABASE_URL}/functions/v1/post-roleplay-to-slack`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )
  const result = await slackRes.json()
  console.log(`  → status ${slackRes.status}:`, result)
}
