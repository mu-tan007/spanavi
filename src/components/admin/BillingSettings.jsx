import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { color, space, radius, font } from '../../constants/design'
import { Button, Card, Badge } from '../ui'

const NAVY = color.navy

const statusVariant = {
  active:   'success',
  past_due: 'warn',
  canceled: 'danger',
  trialing: 'info',
}
const statusText = {
  active: 'アクティブ',
  past_due: '支払い遅延',
  canceled: 'キャンセル済',
  trialing: 'トライアル',
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
    return <div style={{ padding: space[6], color: color.textMid, fontSize: font.size.md }}>読み込み中...</div>
  }

  if (!org) {
    return <div style={{ padding: space[6], color: color.danger, fontSize: font.size.md }}>{error || '組織情報が見つかりません'}</div>
  }

  // カスタムプラン（stripe_customer_id が null）
  if (!org.stripe_customer_id) {
    return (
      <div style={{ padding: space[6] }}>
        <h3 style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: NAVY, margin: `0 0 ${space[4]}px` }}>
          プラン・請求
        </h3>
        <Card variant="subtle" padding="md" style={{ borderRadius: radius.xl }}>
          <p style={{ fontSize: font.size.md, color: color.gray900, fontWeight: font.weight.semibold, margin: 0 }}>
            カスタムプラン（個別契約）
          </p>
          <p style={{ fontSize: font.size.base, color: color.textMid, margin: `${space[2]}px 0 0` }}>
            ご契約内容についてはお問い合わせください。
          </p>
        </Card>
      </div>
    )
  }

  const variant = statusVariant[org.plan_status] || 'default'
  const statusLabel = statusText[org.plan_status] || org.plan_status || '不明'
  const monthlyTotal = (org.seat_count || 0) * 7700

  return (
    <div style={{ padding: space[6] }}>
      <h3 style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: NAVY, margin: `0 0 ${space[5]}px` }}>
        プラン・請求
      </h3>

      {error && (
        <div style={{
          background: color.dangerSoft,
          border: `1px solid ${color.danger}`,
          borderRadius: radius.lg,
          padding: `${space[2.5]}px ${space[3] + 2}px`,
          marginBottom: space[4],
          fontSize: font.size.base,
          color: color.danger,
        }}>
          {error}
        </div>
      )}

      <Card variant="subtle" padding="md" style={{ borderRadius: radius.xl, marginBottom: space[5] }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.md }}>
          <tbody>
            <tr>
              <td style={{ padding: `${space[2]}px 0`, color: color.textMid, width: 140 }}>プラン状態</td>
              <td style={{ padding: `${space[2]}px 0` }}>
                <Badge variant={variant}>{statusLabel}</Badge>
              </td>
            </tr>
            <tr>
              <td style={{ padding: `${space[2]}px 0`, color: color.textMid }}>席数</td>
              <td style={{ padding: `${space[2]}px 0`, color: color.gray900, fontWeight: font.weight.semibold }}>
                {org.seat_count || 0} ユーザー
              </td>
            </tr>
            <tr>
              <td style={{ padding: `${space[2]}px 0`, color: color.textMid }}>月額料金</td>
              <td style={{ padding: `${space[2]}px 0`, color: color.gray900, fontWeight: font.weight.semibold }}>
                {monthlyTotal.toLocaleString()}円（税込）
              </td>
            </tr>
            {org.current_period_end && (
              <tr>
                <td style={{ padding: `${space[2]}px 0`, color: color.textMid }}>次回請求日</td>
                <td style={{ padding: `${space[2]}px 0`, color: color.gray900 }}>
                  {new Date(org.current_period_end).toLocaleDateString('ja-JP')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Button
        variant="primary"
        onClick={handlePortal}
        loading={portalLoading}
        disabled={portalLoading}
      >
        {portalLoading ? '読み込み中...' : '請求情報を管理'}
      </Button>
    </div>
  )
}
