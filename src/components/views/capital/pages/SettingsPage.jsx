import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAudit } from '../lib/audit'
import MFASection from '../components/settings/MFASection'
import LoginHistorySection from '../components/settings/LoginHistorySection'
import AuditLogSection from '../components/settings/AuditLogSection'
import TenantSecuritySettings from '../components/settings/TenantSecuritySettings'
import SessionDiagnostic from '../components/settings/SessionDiagnostic'
import { useMaMandate, useSaveMaMandate } from '../hooks/useMaMandate'

// パスワードポリシー検証
function validatePassword(pw, policy = {}) {
  const min = policy.password_min_length || 12
  if (pw.length < min) return `パスワードは${min}文字以上にしてください`
  if (policy.password_require_upper !== false && !/[A-Z]/.test(pw)) return '大文字を含めてください'
  if (policy.password_require_lower !== false && !/[a-z]/.test(pw)) return '小文字を含めてください'
  if (policy.password_require_digit !== false && !/\d/.test(pw)) return '数字を含めてください'
  if (policy.password_require_symbol !== false && !/[^\w\s]/.test(pw)) return '記号を含めてください'
  return null
}

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }

function Section({ title, children }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF', marginBottom: 16, paddingBottom: 12, borderBottom: '0.5px solid #E5E5E5' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'flex-start', padding: '10px 0', borderBottom: '0.5px solid #f0f2f5' }}>
      <div>
        <div style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { tenantId, role } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState('company')
  const isAdmin = role === 'owner' || role === 'admin'

  const { data: secSettings } = useQuery({
    queryKey: ['security-settings', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('tenant_security_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
      return data
    },
  })

  const { data: profile } = useQuery({
    queryKey: ['company-profile'],
    queryFn: async () => {
      const { data } = await supabase.from('company_profiles').select('*').limit(1).maybeSingle()
      return data
    },
  })

  const { data: authUser } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
  })

  const [companyForm, setCompanyForm] = useState({
    name: profile?.name || '',
    industry: profile?.industry || '',
    description: profile?.description || '',
  })

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')

  async function saveCompany(e) {
    e.preventDefault()
    setSaving(true)
    if (profile?.id) {
      await supabase.from('company_profiles').update({ ...companyForm, updated_at: new Date().toISOString() }).eq('id', profile.id)
    } else {
      await supabase.from('company_profiles').insert(companyForm)
    }
    qc.invalidateQueries({ queryKey: ['company-profile'] })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwError('')
    if (pwForm.next !== pwForm.confirm) { setPwError('新しいパスワードが一致しません'); return }
    const policyErr = validatePassword(pwForm.next, secSettings || {})
    if (policyErr) { setPwError(policyErr); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    setSaving(false)
    if (error) { setPwError(error.message); return }
    logAudit({ action: 'password_changed', resourceType: 'auth' })
    setPwForm({ current: '', next: '', confirm: '' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inp = (val, onChange, type = 'text', placeholder = '') => (
    <input type={type} value={val} onChange={onChange} placeholder={placeholder}
      style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }} />
  )

  const TABS = [
    { key: 'company', label: '自社情報' },
    ...(isAdmin ? [{ key: 'mandate', label: 'M&A投資方針' }] : []),
    { key: 'account', label: 'アカウント' },
    { key: 'security', label: 'セキュリティ' },
    ...(isAdmin ? [{ key: 'audit', label: '監査ログ' }] : []),
    { key: 'notifications', label: '通知設定' },
  ]

  const policyHint = secSettings
    ? `${secSettings.password_min_length}文字以上 / 大文字${secSettings.password_require_upper?'要':'不要'} / 小文字${secSettings.password_require_lower?'要':'不要'} / 数字${secSettings.password_require_digit?'要':'不要'} / 記号${secSettings.password_require_symbol?'要':'不要'}`
    : '12文字以上 / 大小英数字 + 記号'

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: '#FFFFFF' }}>設定</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '0.5px solid #E5E5E5' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '7px 16px', border: 'none', background: 'transparent', fontSize: 13, fontWeight: tab===t.key?500:400, color: tab===t.key?'#032D60':'#A0A0A0', borderBottom: tab===t.key?'2px solid #032D60':'2px solid transparent', cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {saved && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#E1F5EE', borderRadius: 8, fontSize: 13, color: '#2E844A' }}>
          保存しました
        </div>
      )}

      {tab === 'company' && (
        <form onSubmit={saveCompany} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Section title="自社情報">
            <Field label="会社名" hint="案件資料・メールの署名に使用されます">
              {inp(companyForm.name, e => setCompanyForm(f => ({ ...f, name: e.target.value })), 'text', '例：M&Aソーシングパートナーズ株式会社')}
            </Field>
            <Field label="業種">
              {inp(companyForm.industry, e => setCompanyForm(f => ({ ...f, industry: e.target.value })), 'text', '例：M&A仲介・営業代行')}
            </Field>
            <Field label="会社概要" hint="買収スコアのシナジー計算に使用されます">
              <textarea value={companyForm.description}
                onChange={e => setCompanyForm(f => ({ ...f, description: e.target.value }))}
                rows={4} placeholder="事業内容・強み・買収戦略の方向性など..."
                style={{ width: '100%', padding: '8px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical', lineHeight: 1.7 }} />
            </Field>
          </Section>
          <button type="submit" disabled={saving}
            style={{ height: 36, padding: '0 24px', background: saving ? '#A0A0A0' : '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </form>
      )}

      {tab === 'mandate' && isAdmin && (
        <MandateSection
          onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 2000) }}
        />
      )}

      {tab === 'account' && (
        <Section title="アカウント情報">
          <Field label="メールアドレス">
            <div style={{ fontSize: 13, color: '#FFFFFF', padding: '8px 0' }}>{authUser?.email || '—'}</div>
          </Field>
          <Field label="アカウントID">
            <div style={{ fontSize: 12, color: '#A0A0A0', padding: '8px 0', fontFamily: 'monospace' }}>{authUser?.id?.slice(0, 16)}...</div>
          </Field>
          <Field label="最終ログイン">
            <div style={{ fontSize: 12, color: '#A0A0A0', padding: '8px 0' }}>
              {authUser?.last_sign_in_at ? new Date(authUser.last_sign_in_at).toLocaleString('ja-JP') : '—'}
            </div>
          </Field>
        </Section>
      )}

      {tab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isAdmin && (
            <Section title="テナント全体のセキュリティポリシー (管理者)">
              <TenantSecuritySettings />
            </Section>
          )}

          <Section title="セッション状態 (診断・トラブル対応)">
            <SessionDiagnostic />
          </Section>

          <Section title="二段階認証 (MFA)">
            <MFASection />
          </Section>

          <Section title="ログイン履歴 (直近20件)">
            <LoginHistorySection />
          </Section>

          <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="パスワード変更">
              <Field label="新しいパスワード" hint={policyHint}>
                {inp(pwForm.next, e => setPwForm(f => ({ ...f, next: e.target.value })), 'password')}
              </Field>
              <Field label="新しいパスワード（確認）">
                {inp(pwForm.confirm, e => setPwForm(f => ({ ...f, confirm: e.target.value })), 'password')}
              </Field>
            </Section>
            {pwError && <div style={{ fontSize: 12, color: '#EA001E' }}>{pwError}</div>}
            <button type="submit" disabled={saving}
              style={{ height: 36, padding: '0 24px', background: saving ? '#A0A0A0' : '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>
              {saving ? '変更中...' : 'パスワードを変更'}
            </button>
          </form>
        </div>
      )}

      {tab === 'audit' && isAdmin && (
        <Section title="監査ログ">
          <AuditLogSection />
        </Section>
      )}

      {tab === 'notifications' && (
        <Section title="通知設定">
          {[
            ['新規案件提案メール受信時', 'new_deal'],
            ['案件ステータス変更時', 'status_change'],
            ['ファイルアップロード時', 'file_upload'],
            ['TODO期限の前日', 'todo_due'],
            ['打合せ前日リマインド', 'meeting_reminder'],
          ].map(([label, key]) => (
            <Field key={key} label={label}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked
                  style={{ width: 14, height: 14, cursor: 'pointer' }} />
                <span style={{ fontSize: 12, color: '#706E6B' }}>有効</span>
              </label>
            </Field>
          ))}
          <div style={{ marginTop: 10 }}>
            <button
              style={{ height: 36, padding: '0 24px', background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
              保存
            </button>
          </div>
        </Section>
      )}
    </div>
  )
}

const MONTHS = [
  { v: 1,  l: '1月' }, { v: 2,  l: '2月' }, { v: 3,  l: '3月' },
  { v: 4,  l: '4月' }, { v: 5,  l: '5月' }, { v: 6,  l: '6月' },
  { v: 7,  l: '7月' }, { v: 8,  l: '8月' }, { v: 9,  l: '9月' },
  { v: 10, l: '10月'}, { v: 11, l: '11月'}, { v: 12, l: '12月'},
]

function MandateSection({ onSaved }) {
  const { data: profile } = useMaMandate()
  const save = useSaveMaMandate()
  const mandate = profile?.ma_mandate || {}

  const [budgetOku, setBudgetOku] = useState('')
  const [fyStart, setFyStart] = useState(4)
  const [targetCount, setTargetCount] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [err, setErr] = useState('')

  if (!initialized && profile !== undefined) {
    setInitialized(true)
    if (mandate.annual_budget_jpy) setBudgetOku(String(mandate.annual_budget_jpy / 1e8))
    if (mandate.fiscal_year_start_month) setFyStart(mandate.fiscal_year_start_month)
    if (mandate.annual_target_deal_count) setTargetCount(String(mandate.annual_target_deal_count))
  }

  async function handleSave(e) {
    e.preventDefault()
    setErr('')
    const oku = Number(budgetOku)
    if (!oku || oku <= 0) { setErr('年間予算は正の数値で入力してください（億円単位）'); return }
    try {
      await save.mutateAsync({
        annual_budget_jpy: Math.round(oku * 1e8),
        fiscal_year_start_month: Number(fyStart),
        annual_target_deal_count: targetCount ? Number(targetCount) : null,
      })
      onSaved?.()
    } catch (e2) {
      setErr(e2?.message || '保存に失敗しました')
    }
  }

  const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }
  const inputStyle = { width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF', marginBottom: 8, paddingBottom: 12, borderBottom: '0.5px solid #E5E5E5' }}>
          M&A投資方針
        </div>
        <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 12, lineHeight: 1.6 }}>
          ここで設定した情報は Pipeline ページの「当期M&A投資枠」で予算消化ペースの算出に使用されます。
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'flex-start', padding: '10px 0', borderBottom: '0.5px solid #f0f2f5' }}>
          <div>
            <div style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 500 }}>年間M&A予算</div>
            <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2, lineHeight: 1.5 }}>億円単位で入力（例: 100）</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min="0" step="0.1"
              value={budgetOku}
              onChange={e => setBudgetOku(e.target.value)}
              placeholder="100"
              style={{ ...inputStyle, width: 180 }}
            />
            <span style={{ fontSize: 12, color: '#706E6B' }}>億円</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'flex-start', padding: '10px 0', borderBottom: '0.5px solid #f0f2f5' }}>
          <div>
            <div style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 500 }}>会計年度開始月</div>
            <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2, lineHeight: 1.5 }}>デフォルト: 4月</div>
          </div>
          <select
            value={fyStart}
            onChange={e => setFyStart(Number(e.target.value))}
            style={{ ...inputStyle, width: 120 }}
          >
            {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'flex-start', padding: '10px 0' }}>
          <div>
            <div style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 500 }}>年間目標案件数</div>
            <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2, lineHeight: 1.5 }}>任意。参考値として表示されます</div>
          </div>
          <input
            type="number" min="0" step="1"
            value={targetCount}
            onChange={e => setTargetCount(e.target.value)}
            placeholder="5"
            style={{ ...inputStyle, width: 120 }}
          />
        </div>
      </div>

      {err && <div style={{ fontSize: 12, color: '#EA001E' }}>{err}</div>}

      <button type="submit" disabled={save.isPending}
        style={{ height: 36, padding: '0 24px', background: save.isPending ? '#A0A0A0' : '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>
        {save.isPending ? '保存中...' : '保存'}
      </button>
    </form>
  )
}
