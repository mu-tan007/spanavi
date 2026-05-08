import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { invokeFn } from '../../lib/invokeFn'
import MarkdownBody from '../ui/MarkdownBody'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Input, Select, Card, Badge } from '../../../../ui'

// 案件詳細タブ — IM/ノンネーム/QA回答/議事録等を AI が総合した売り手企業サマリー
async function readFnError(fnErr) {
  let detail = fnErr?.message || String(fnErr)
  try {
    const ctx = fnErr?.context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json()
      detail = body?.error || body?.message || JSON.stringify(body)
    } else if (ctx && typeof ctx.text === 'function') {
      detail = await ctx.text()
    }
  } catch { /* ignore */ }
  return detail
}


export default function DealSummaryTab({ dealId }) {
  const qc = useQueryClient()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const { data: company } = useQuery({
    queryKey: ['deal-summary', dealId],
    queryFn: async () => {
      const { data } = await supabase.from('cap_deal_companies').select('detailed_summary, detailed_summary_updated_at').eq('deal_id', dealId).maybeSingle()
      return data
    },
  })

  async function generateSummary() {
    setGenerating(true); setError('')
    try {
      await invokeFn('deal-summary-generate', { deal_id: dealId })
      logAudit({ action: 'ai_call', resourceType: 'deal_summary', resourceId: dealId })
      qc.invalidateQueries({ queryKey: ['deal-summary', dealId] })
      qc.invalidateQueries({ queryKey: ['deal', dealId] })
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const hasSummary = !!company?.detailed_summary
  const updatedAt = company?.detailed_summary_updated_at

  return (
    <div style={{ background: color.white, border: `0.5px solid ${color.border}`, borderRadius: radius.xl, padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: `0.5px solid ${color.border}`, background: color.gray50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy }}>案件詳細サマリー</div>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>
            AIチャットに投入された IM / ノンネーム / Q&A回答 / 議事録 / 財務 / 追加資料 を総合して AI が作成
            {updatedAt && ` · 最終更新 ${new Date(updatedAt).toLocaleString('ja-JP')}`}
          </div>
        </div>
        <Button size="sm" loading={generating} onClick={generateSummary}>
          {generating ? '生成中…' : hasSummary ? '再生成' : 'AI生成'}
        </Button>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 28px', minHeight: 400 }}>
        {error && (
          <div style={{ marginBottom: space[4], padding: '10px 14px', background: '#FAECE7', border: `0.5px solid #e0c0c0`, borderRadius: radius.lg, fontSize: font.size.sm, color: color.danger }}>
            {error}
          </div>
        )}
        {!hasSummary ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: color.textMid }}>
            <div style={{ fontSize: font.size.md, marginBottom: 10, color: color.textMid }}>まだサマリーが生成されていません</div>
            <div style={{ fontSize: font.size.sm, lineHeight: 1.8, marginBottom: space[6] }}>
              AIチャットに資料 (IM / ノンネーム / Q&A回答 など) をアップロードした後、<br/>
              右上の「AI生成」ボタンを押すと、売り手企業の詳細サマリーが作成されます。
            </div>
          </div>
        ) : (
          <MarkdownBody>{company.detailed_summary}</MarkdownBody>
        )}
      </div>
    </div>
  )
}
