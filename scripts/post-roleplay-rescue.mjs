// 2026-05-06 ロープレ Slack通知漏れの救出投稿
// analyze-roleplay の background task が Slack 通知に到達せず終了したため手動で再送
const SUPABASE_URL = 'https://baiiznjzvzhxwwqzsozn.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI4OTY3NCwiZXhwIjoyMDg2ODY1Njc0fQ.dFtoK7_HOpeGnsq8bxdbihWxJumbtJTOpRqs9cLUSUg'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'

const TARGET_SESSION_IDS = [
  '9b4d33da-4c2a-408a-881e-a59fb79f5457', // 日高 孝太朗 × 篠宮拓武 (2026-05-06)
  'd1292675-6ee0-4cfd-9cfc-7179fcc73cde', // 小関 琉太     × 篠宮拓武 (2026-05-06)
]

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

const idsCsv = TARGET_SESSION_IDS.map(id => `"${id}"`).join(',')
const sessRes = await fetch(
  `${SUPABASE_URL}/rest/v1/roleplay_sessions?id=in.(${idsCsv})&select=id,user_id,partner_name,session_date,ai_feedback,video_url,ai_status`,
  { headers }
)
const sessions = await sessRes.json()
console.log(`Sessions found: ${sessions.length}`)

const userIds = [...new Set(sessions.map(s => s.user_id))]
const userIdCsv = userIds.map(id => `"${id}"`).join(',')
const membRes = await fetch(
  `${SUPABASE_URL}/rest/v1/members?user_id=in.(${userIdCsv})&select=user_id,name,team`,
  { headers }
)
const members = await membRes.json()

for (const s of sessions) {
  const member = members.find(m => m.user_id === s.user_id)
  if (!member) {
    console.log(`Skip ${s.id}: member not found`)
    continue
  }
  if (s.ai_status !== 'done') {
    console.log(`Skip ${s.id}: ai_status=${s.ai_status}`)
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
  console.log(`Posting: ${member.name} (${member.team}) × ${s.partner_name} [${s.session_date}]`)
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
  console.log(`  -> ${slackRes.status}:`, JSON.stringify(result))
}
