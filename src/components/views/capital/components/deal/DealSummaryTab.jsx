import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { invokeFn } from '../../lib/invokeFn'
import MarkdownBody from '../ui/MarkdownBody'

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
      const { data } = await supabase.from('deal_companies').select('detailed_summary, detailed_summary_updated_at').eq('deal_id', dealId).maybeSingle()
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
    <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #E5E5E5', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}>案件詳細サマリー</div>
          <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>
            AIチャットに投入された IM / ノンネーム / Q&A回答 / 議事録 / 財務 / 追加資料 を総合して AI が作成
            {updatedAt && ` · 最終更新 ${new Date(updatedAt).toLocaleString('ja-JP')}`}
          </div>
        </div>
        <button onClick={generateSummary} disabled={generating}
          style={{
            height: 34, padding: '0 18px',
            background: generating ? '#A0A0A0' : '#032D60', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: generating ? 'default' : 'pointer', letterSpacing: 0.5,
          }}>
          {generating ? '生成中…' : hasSummary ? '再生成' : 'AI生成'}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 28px', minHeight: 400 }}>
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FAECE7', border: '0.5px solid #e0c0c0', borderRadius: 6, fontSize: 12, color: '#EA001E' }}>
            {error}
          </div>
        )}
        {!hasSummary ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: '#706E6B' }}>
            <div style={{ fontSize: 14, marginBottom: 10, color: '#706E6B' }}>まだサマリーが生成されていません</div>
            <div style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 24 }}>
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
