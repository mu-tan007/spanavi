import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// .env.local を読み込む
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '.env.local')
const envContent = readFileSync(envPath, 'utf-8')

const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const idx = trimmed.indexOf('=')
  if (idx === -1) continue
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
}

const ZOOM_ACCOUNT_ID    = env['VITE_ZOOM_ACCOUNT_ID']
const ZOOM_CLIENT_ID     = env['VITE_ZOOM_CLIENT_ID']
const ZOOM_CLIENT_SECRET = env['ZOOM_CLIENT_SECRET']

console.log('=== Zoom Call History API テスト ===')
console.log('Account ID:', ZOOM_ACCOUNT_ID)
console.log('Client ID :', ZOOM_CLIENT_ID)
console.log('')

// ── 1. アクセストークン取得 ──────────────────────────────────────────
console.log('--- Step 1: アクセストークン取得 ---')
const tokenRes = await fetch(
  `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
  {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  }
)
const tokenData = await tokenRes.json()
console.log('HTTP:', tokenRes.status)
console.log('token_type:', tokenData.token_type)
console.log('scope:', tokenData.scope)

if (!tokenData.access_token) {
  console.error('トークン取得失敗:', JSON.stringify(tokenData))
  process.exit(1)
}
const token = tokenData.access_token
console.log('→ トークン取得成功')
console.log('')

// ── 2. GET /v2/phone/call_history ────────────────────────────────────
console.log('--- Step 2: GET /v2/phone/call_history ---')
const today    = new Date().toISOString().slice(0, 10)
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const url = `https://api.zoom.us/v2/phone/call_history?from=${twoDaysAgo}&to=${today}&page_size=10`
console.log('URL:', url)

const histRes = await fetch(url, {
  headers: { 'Authorization': `Bearer ${token}` },
})
const histData = await histRes.json()
console.log('HTTP:', histRes.status)

if (histRes.status !== 200) {
  console.error('エラーレスポンス:', JSON.stringify(histData, null, 2))
} else {
  console.log('total_records:', histData.total_records)
  console.log('取得件数 (call_logs配列):', (histData.call_logs || []).length)
  console.log('')

  // 全フィールドキー確認（最初の1件）
  const firstLog = (histData.call_logs || [])[0]
  if (firstLog) {
    console.log('--- 最初の1件のフィールド一覧 ---')
    console.log(JSON.stringify(firstLog, null, 2))
    console.log('')
    console.log('recording_id 含まれる？:', 'recording_id' in firstLog ? `YES → "${firstLog.recording_id}"` : 'NO')
  }

  // recording_id を持つレコードをリストアップ
  const withRec = (histData.call_logs || []).filter(r => r.recording_id)
  console.log('')
  console.log(`--- recording_id を持つ通話: ${withRec.length}件 ---`)
  withRec.forEach((r, i) => {
    console.log(`  [${i + 1}] recording_id=${r.recording_id}`)
    console.log(`       call_id=${r.call_id ?? '—'}`)
    console.log(`       callee_number=${r.callee_did_number ?? r.callee_number ?? '—'}`)
    console.log(`       start_time=${r.start_time ?? '—'}`)
    console.log(`       direction=${r.direction ?? '—'}`)
  })
}

console.log('')
console.log('=== 完了 ===')
