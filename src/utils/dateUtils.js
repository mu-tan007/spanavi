// JSTの今日の開始（00:00:00 JST = 前日15:00:00 UTC）
export const getTodayJST = () => {
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstNow = new Date(now.getTime() + jstOffset)
  const todayJST = jstNow.toISOString().split('T')[0]
  // JSTの今日00:00をUTCに変換してSupabaseのフィルタに使う
  return `${todayJST}T00:00:00+09:00`
}

// JSTの今日の終了（23:59:59 JST）
export const getTodayEndJST = () => {
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstNow = new Date(now.getTime() + jstOffset)
  const todayJST = jstNow.toISOString().split('T')[0]
  return `${todayJST}T23:59:59+09:00`
}

// JST基準で YYYY-MM-DD 文字列を返す
export const getJSTDateStr = (date = new Date()) => {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
}
