// Zoom Phone 発信ヘルパー
import { zoomPhone } from '../lib/zoomPhoneStore'

// 埋め込み電話(Smart Embed)で発信するテストモードか判定。
// 端末ごとに ?embeddial=1 で有効化（localStorage保持）。既定はOFF＝デスクトップアプリ発信。
export function isEmbedDialEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('spanavi_embed_dial') === '1'
  } catch {
    return false
  }
}

export function dialPhone(phoneNumber) {
  if (!phoneNumber) return

  // テストモード: Spanavi内の埋め込み電話で発信（デスクトップアプリを起動しない）
  if (isEmbedDialEnabled()) {
    zoomPhone.makeCall(phoneNumber)
    return
  }

  // 既定: hidden iframe 経由でプロトコルハンドラを呼び出し、Zoomデスクトップアプリで発信
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
}

// 電話番号フォーマット
export function formatPhone(phone) {
  if (!phone) return '-'
  return phone
}
