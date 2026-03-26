import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const NAVY = '#0D2247'

const statusLabels = {
  active: { text: 'アクティブ', color: '#059669', bg: '#ECFDF5' },
  past_due: { text: '支払い遅延', color: '#D97706', bg: '#FFFBEB' },
  canceled: { text: 'キャンセル済', color: '#DC2626', bg: '#FEF2F2' },
  trialing: { text: 'トライアル', color: '#2563EB', bg: '#EFF6FF' },
}

export default function BillingSettings({ orgId }) {
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orgId) return
    const fetchOrg = async () => {
      setLoading(true)
      const { data, error: fetchErr } = await supabase
        .from('organizations')
        .select('plan_status, seat_count, current_period_end, stripe_customer_id')
        .eq('id', orgId)
        .single()
      if (fetchErr) {
        setError('請求情報の取得に失敗しました')
      } else {
        setOrg(data)
      }
      setLoading(false)
    }
    fetchOrg()
  }, [orgId])

  const handlePortal = async () => {
    setPortalLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-customer-portal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ org_id: orgId }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ポータルの取得に失敗しました')
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setPortalLoading(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: '#6B7280', fontSize: 14 }}>読み込み中...</div>
  }

  if (!org) {
    return <div style={{ padding: 24, color: '#DC2626', fontSize: 14 }}>{error || '組織情報が見つかりません'}</div>
  }

  // カスタムプラン（stripe_customer_id が null）
  if (!org.stripe_customer_id) {
    return (
      <div style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>
          プラン・請求
        </h3>
        <div style={{
          background: '#f8f9fb',
          borderRadius: 8,
          padding: '20px 24px',
          border: '1px solid #E5E7EB',
        }}>
          <p style={{ fontSize: 14, color: '#111827', fontWeight: 600, margin: 0 }}>
            カスタムプラン（個別契約）
          </p>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '8px 0 0' }}>
            ご契約内容についてはお問い合わせください。
          </p>
        </div>
      </div>
    )
  }

  const status = statusLabels[org.plan_status] || { text: org.plan_status || '不明', color: '#6B7280', bg: '#F3F4F6' }
  const monthlyTotal = (org.seat_count || 0) * 7700

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 20px' }}>
        プラン・請求
      </h3>

      {error && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: 6,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
          color: '#DC2626',
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: '#f8f9fb',
        borderRadius: 8,
        padding: '20px 24px',
        border: '1px solid #E5E7EB',
        marginBottom: 20,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 0', color: '#6B7280', width: 140 }}>プラン状態</td>
              <td style={{ padding: '8px 0' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  color: status.color,
                  background: status.bg,
                }}>
                  {status.text}
                </span>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0', color: '#6B7280' }}>席数</td>
              <td style={{ padding: '8px 0', color: '#111827', fontWeight: 600 }}>
                {org.seat_count || 0} ユーザー
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0', color: '#6B7280' }}>月額料金</td>
              <td style={{ padding: '8px 0', color: '#111827', fontWeight: 600 }}>
                {monthlyTotal.toLocaleString()}円（税込）
              </td>
            </tr>
            {org.current_period_end && (
              <tr>
                <td style={{ padding: '8px 0', color: '#6B7280' }}>次回請求日</td>
                <td style={{ padding: '8px 0', color: '#111827' }}>
                  {new Date(org.current_period_end).toLocaleDateString('ja-JP')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={handlePortal}
        disabled={portalLoading}
        style={{
          padding: '10px 24px',
          borderRadius: 6,
          border: 'none',
          background: portalLoading ? '#9CA3AF' : NAVY,
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "'Noto Sans JP', sans-serif",
          cursor: portalLoading ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => { if (!portalLoading) e.target.style.background = '#1a3366' }}
        onMouseLeave={(e) => { if (!portalLoading) e.target.style.background = NAVY }}
      >
        {portalLoading ? '読み込み中...' : '請求情報を管理'}
      </button>
    </div>
  )
}
