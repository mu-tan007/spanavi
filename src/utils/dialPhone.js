// Zoom Phone 発信ヘルパー
// hidden iframe 経由でプロトコルハンドラを呼び出す（ページ遷移なし、連続発信可能）
export function dialPhone(phoneNumber) {
  if (!phoneNumber) return
  const num = phoneNumber.replace(/[-\s]/g, '')
  const uri = 'zoomphonecall://' + num

  let iframe = document.getElementById('__dial_iframe')
  if (!iframe) {
    iframe = document.createElement('iframe')
    iframe.id = '__dial_iframe'
    iframe.style.display = 'none'
    document.body.appendChild(iframe)
  }
  iframe.src = uri
  // 発信したことを知らせる（切電のキーの案内 HangupKeyCoach が「発信の後に手で切ったか」を数えるのに使う）
  try { window.dispatchEvent(new CustomEvent('spanavi:dial')) } catch { /* 古いブラウザでは数えない */ }
}

// 電話番号フォーマット
export function formatPhone(phone) {
  if (!phone) return '-'
  return phone
}
