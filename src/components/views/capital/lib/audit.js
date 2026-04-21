// 監査ログ記録ヘルパー
import { supabase } from './supabase'

// User-Agent から簡易的にデバイス/ブラウザ/OSを判定
export function parseUA(ua = navigator.userAgent) {
  const out = { deviceType: 'desktop', browser: 'Unknown', os: 'Unknown' }
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) out.deviceType = /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile'
  if (/Edg\//.test(ua)) out.browser = 'Edge'
  else if (/Chrome\//.test(ua)) out.browser = 'Chrome'
  else if (/Firefox\//.test(ua)) out.browser = 'Firefox'
  else if (/Safari\//.test(ua)) out.browser = 'Safari'
  if (/Windows NT 11/.test(ua)) out.os = 'Windows 11'
  else if (/Windows NT 10/.test(ua)) out.os = 'Windows 10'
  else if (/Windows/.test(ua)) out.os = 'Windows'
  else if (/Mac OS X/.test(ua)) out.os = 'macOS'
  else if (/Android/.test(ua)) out.os = 'Android'
  else if (/iPhone|iPad/.test(ua)) out.os = 'iOS'
  else if (/Linux/.test(ua)) out.os = 'Linux'
  return out
}

// 監査ログを記録（fire-and-forget）
export async function logAudit({
  action, resourceType, resourceId = null, resourceName = null, metadata = {},
}) {
  try {
    await supabase.rpc('log_audit', {
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId ? String(resourceId) : null,
      p_resource_name: resourceName,
      p_metadata: { ...metadata, user_agent: navigator.userAgent },
    })
  } catch (e) {
    console.warn('[audit] log failed:', e)
  }
}

// ログイン履歴を記録
export async function logLogin({ userId, tenantId, success = true, failureReason = null }) {
  try {
    const { deviceType, browser, os } = parseUA()
    await supabase.from('login_history').insert({
      user_id: userId,
      tenant_id: tenantId,
      user_agent: navigator.userAgent,
      device_type: deviceType,
      browser, os,
      success,
      failure_reason: failureReason,
    })
  } catch (e) {
    console.warn('[login_history] insert failed:', e)
  }
}
