import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'

// テナント全体のセキュリティポリシー編集 (admin/owner 専用)
export default function TenantSecuritySettings() {
  const qc = useQueryClient()
  const { tenantId } = useAuth()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data } = useQuery({
    queryKey: ['tenant-security-settings', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('tenant_security_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
      return data
    },
  })

  useEffect(() => { if (data) setForm(data) }, [data])

  if (!form) return <div style={{ fontSize: 12, color: '#A0A0A0', padding: 12 }}>読み込み中...</div>

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    const update = {
      mfa_required: form.mfa_required,
      password_min_length: Number(form.password_min_length) || 12,
      password_require_upper: form.password_require_upper,
      password_require_lower: form.password_require_lower,
      password_require_digit: form.password_require_digit,
      password_require_symbol: form.password_require_symbol,
      password_max_age_days: Number(form.password_max_age_days) || 90,
      session_timeout_minutes: Number(form.session_timeout_minutes) || 480,
      ip_allowlist: form.ip_allowlist || [],
      audit_retention_days: Number(form.audit_retention_days) || 365,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('tenant_security_settings').update(update).eq('tenant_id', tenantId)
    setSaving(false)
    if (error) { alert('保存エラー: ' + error.message); return }
    logAudit({ action: 'update', resourceType: 'security_settings', metadata: update })
    qc.invalidateQueries({ queryKey: ['tenant-security-settings', tenantId] })
    qc.invalidateQueries({ queryKey: ['security-settings', tenantId] })
    qc.invalidateQueries({ queryKey: ['session-timeout-setting', tenantId] })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const inp = (v, on, type = 'text') => (
    <input type={type} value={v ?? ''} onChange={e => on(type === 'number' ? e.target.value : e.target.value)}
      style={{ width: 120, height: 30, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }} />
  )

  const toggle = (checked, on) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={e => on(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
      <span style={{ fontSize: 11, color: '#706E6B' }}>{checked ? '有効' : '無効'}</span>
    </label>
  )

  const Row = ({ label, hint, children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, padding: '10px 0', borderBottom: '0.5px solid #f0f2f5', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )

  return (
    <div>
      <Row label="MFA 必須" hint="全ユーザーに二段階認証を必須化（TOTP未登録ユーザーはログイン時に強制登録）">
        {toggle(form.mfa_required, v => set('mfa_required', v))}
      </Row>
      <Row label="最小パスワード長" hint="6〜64文字">
        {inp(form.password_min_length, v => set('password_min_length', v), 'number')}
      </Row>
      <Row label="大文字を要求">{toggle(form.password_require_upper, v => set('password_require_upper', v))}</Row>
      <Row label="小文字を要求">{toggle(form.password_require_lower, v => set('password_require_lower', v))}</Row>
      <Row label="数字を要求">{toggle(form.password_require_digit, v => set('password_require_digit', v))}</Row>
      <Row label="記号を要求">{toggle(form.password_require_symbol, v => set('password_require_symbol', v))}</Row>
      <Row label="パスワード有効期限 (日)" hint="0 で無期限">
        {inp(form.password_max_age_days, v => set('password_max_age_days', v), 'number')}
      </Row>
      <Row label="セッションタイムアウト (分)" hint="最終操作から指定時間で自動ログアウト">
        {inp(form.session_timeout_minutes, v => set('session_timeout_minutes', v), 'number')}
      </Row>
      <Row label="監査ログ保管期間 (日)" hint="保管期間を過ぎたログは削除 (バッチ実装予定)">
        {inp(form.audit_retention_days, v => set('audit_retention_days', v), 'number')}
      </Row>
      <Row label="IP Allowlist" hint="1行1つ、CIDR形式対応（空で制限なし）※ Edge Function での強制は Phase 2">
        <textarea
          value={Array.isArray(form.ip_allowlist) ? form.ip_allowlist.join('\n') : ''}
          onChange={e => set('ip_allowlist', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
          rows={3}
          style={{ width: '100%', maxWidth: 320, padding: '6px 10px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, fontFamily: 'monospace', outline: 'none', resize: 'vertical' }}
          placeholder="192.168.1.0/24&#10;203.0.113.5" />
      </Row>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        <button onClick={save} disabled={saving}
          style={{ height: 36, padding: '0 20px', background: saving ? '#A0A0A0' : '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
          {saving ? '保存中...' : '保存'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#2E844A' }}>✓ 保存しました</span>}
      </div>
    </div>
  )
}
