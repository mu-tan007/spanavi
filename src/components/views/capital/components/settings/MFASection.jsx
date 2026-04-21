import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'

// MFA (TOTP) 設定セクション
export default function MFASection() {
  const [factors, setFactors] = useState([])
  const [enrolling, setEnrolling] = useState(null) // { factorId, qr, secret }
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  async function loadFactors() {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors(data?.totp || [])
  }
  useEffect(() => { loadFactors() }, [])

  async function startEnroll() {
    setBusy(true); setError(''); setMsg('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Caesar TOTP' })
    setBusy(false)
    if (error) { setError(error.message); return }
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function verifyEnroll() {
    if (!enrolling) return
    setBusy(true); setError('')
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId })
    if (chErr) { setBusy(false); setError(chErr.message); return }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId, challengeId: ch.id, code,
    })
    setBusy(false)
    if (vErr) { setError(vErr.message); return }
    setMsg('MFAを有効化しました')
    logAudit({ action: 'mfa_enrolled', resourceType: 'auth' })
    setEnrolling(null); setCode(''); loadFactors()
  }

  async function unenroll(factorId) {
    if (!confirm('このMFA要素を削除しますか？')) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    setBusy(false)
    if (error) { setError(error.message); return }
    logAudit({ action: 'mfa_removed', resourceType: 'auth', resourceId: factorId })
    loadFactors()
  }

  const verified = factors.filter(f => f.status === 'verified')

  return (
    <div>
      <div style={{ fontSize: 12, color: '#706E6B', marginBottom: 12, lineHeight: 1.7 }}>
        二段階認証（TOTP）を有効にすると、パスワードに加えて認証アプリ（Google Authenticator, 1Password等）のコードが必要になります。アカウント乗っ取りリスクを大幅に低減できます。
      </div>

      {verified.length > 0 ? (
        <div>
          {verified.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#E1F5EE', border: '0.5px solid #b8d4b8', borderRadius: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#2E844A' }}>
                ✓ {f.friendly_name || 'TOTP'} — 有効
                <span style={{ color: '#A0A0A0', marginLeft: 8, fontSize: 11 }}>{new Date(f.created_at).toLocaleDateString('ja-JP')} 登録</span>
              </div>
              <button onClick={() => unenroll(f.id)} disabled={busy}
                style={{ height: 26, padding: '0 10px', background: '#fff', border: '0.5px solid #e0c0c0', borderRadius: 5, fontSize: 11, color: '#EA001E', cursor: 'pointer' }}>
                削除
              </button>
            </div>
          ))}
        </div>
      ) : enrolling ? (
        <div style={{ padding: 16, background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#FFFFFF', marginBottom: 12, fontWeight: 500 }}>
            STEP 1: 認証アプリでQRコードをスキャン
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
            <div dangerouslySetInnerHTML={{ __html: enrolling.qr }} style={{ width: 180, height: 180, background: '#fff', padding: 8, borderRadius: 6 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>QRが読めない場合のシークレット:</div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', background: '#fff', padding: '6px 10px', borderRadius: 5, border: '0.5px solid #E5E5E5', wordBreak: 'break-all', color: '#FFFFFF' }}>
                {enrolling.secret}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#FFFFFF', marginBottom: 8, fontWeight: 500 }}>
            STEP 2: アプリに表示された6桁コードを入力
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456" maxLength={6}
              style={{ width: 140, height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 14, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 4, outline: 'none' }} />
            <button onClick={verifyEnroll} disabled={busy || code.length !== 6}
              style={{ height: 36, padding: '0 16px', background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer', opacity: code.length === 6 ? 1 : 0.5 }}>
              {busy ? '検証中...' : '有効化'}
            </button>
            <button onClick={() => { setEnrolling(null); setCode('') }} disabled={busy}
              style={{ height: 36, padding: '0 16px', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button onClick={startEnroll} disabled={busy}
          style={{ height: 36, padding: '0 18px', background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
          {busy ? '...' : '二段階認証を設定'}
        </button>
      )}

      {error && <div style={{ marginTop: 10, fontSize: 12, color: '#EA001E' }}>{error}</div>}
      {msg && <div style={{ marginTop: 10, fontSize: 12, color: '#2E844A' }}>{msg}</div>}
    </div>
  )
}
