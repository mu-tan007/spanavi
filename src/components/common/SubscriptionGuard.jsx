import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getOrgId } from '../../lib/orgContext'

const NAVY = '#0D2247'

/**
 * サブスクリプション状態に応じたアクセス制御
 * - active / trialing → 通常表示
 * - past_due → 警告バナー + 利用許可（猶予期間）
 * - canceled / unpaid / none → ブロック画面
 * - stripe_customer_id=NULL + active → レガシー（MASP等）、スキップ
 */
export default function SubscriptionGuard({ children }) {
  const [status, setStatus] = useState(null) // null=ロード中
  const [isLegacy, setIsLegacy] = useState(false)

  useEffect(() => {
    const orgId = getOrgId()
    if (!orgId) return

    supabase
      .from('organizations')
      .select('plan_status, stripe_customer_id')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (!data) { setStatus('none'); return }
        // stripe_customer_id が null で active → レガシープラン（課金チェックスキップ）
        if (!data.stripe_customer_id && data.plan_status === 'active') {
          setIsLegacy(true)
          setStatus('active')
        } else {
          setStatus(data.plan_status || 'none')
        }
      })
  }, [])

  // ロード中
  if (status === null) return null

  // レガシーまたはactive/trialing → 通常表示
  if (isLegacy || status === 'active' || status === 'trialing') {
    return children
  }

  // past_due → 警告バナー + 利用許可
  if (status === 'past_due') {
    return (
      <>
        <div style={{
          background: '#FEF3C7',
          border: '1px solid #F59E0B',
          padding: '10px 20px',
          fontSize: 13,
          color: '#92400E',
          textAlign: 'center',
          fontFamily: "'Noto Sans JP', sans-serif",
        }}>
          お支払いに問題があります。管理画面の「プラン・請求」から支払い情報をご確認ください。
        </div>
        {children}
      </>
    )
  }

  // canceled / unpaid / none → ブロック
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f0e8',
      fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        padding: '40px 36px',
        maxWidth: 460,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
          ご利用が停止されています
        </div>
        <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.8, marginBottom: 24 }}>
          サブスクリプションが無効です。<br />
          管理者にお問い合わせいただくか、プランを再開してください。
        </div>
        <a
          href="/signup"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            borderRadius: 6,
            background: NAVY,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          プランを申し込む
        </a>
      </div>
    </div>
  )
}
