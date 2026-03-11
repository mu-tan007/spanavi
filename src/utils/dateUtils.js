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

// UTC ISO文字列をJSTの「M月D日 HH:mm」形式で表示
export const formatJST = (isoString) => {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// UTC ISO文字列をJSTの「M月D日」形式で表示（時刻なし）
export const formatJSTShort = (isoString) => {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  })
}
