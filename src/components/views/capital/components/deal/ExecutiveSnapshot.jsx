import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Input, Select, Card, Badge } from '../../../../ui'

// エグゼクティブ・スナップショット
// Deal Stage ゲート進捗 + KPI (IRR/MoIC/投資額/ホールド) + 次マイルストーン
const STAGES = [
  { key: 'nda',        label: 'NDA',        short: 'NDA' },
  { key: 'ioi',        label: 'IOI',        short: 'IOI' },
  { key: 'loi',        label: 'LOI',        short: 'LOI' },
  { key: 'excl',       label: 'Exclusivity', short: '独占交渉' },
  { key: 'spa',        label: 'SPA',        short: 'SPA' },
  { key: 'close',      label: 'Closing',    short: 'クローズ' },
]

// 案件の status からステージ推定 (暫定)
const STATUS_TO_STAGE = {
  nn_review: 0, im_review: 0, top_meeting: 0,
  loi_prep: 2, dd: 3, spa_negotiation: 4,
  closed: 5, stop: -1, break: -1,
}

export default function ExecutiveSnapshot({ deal, company, valuation, intermediaryId }) {
  // 包括NDA 締結判定
  const { data: firmContracts = [] } = useQuery({
    queryKey: ['firm-contracts-snap', intermediaryId],
    enabled: !!intermediaryId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase.from('cap_firm_contracts')
        .select('contract_type, signed_at, expires_at')
        .eq('intermediary_id', intermediaryId)
      return (data || []).filter(c => !c.expires_at || c.expires_at >= today)
    },
  })

  // 案件固有契約 (LOI/SPA)
  const { data: dealContracts = [] } = useQuery({
    queryKey: ['deal-contracts-snap', deal?.id],
    enabled: !!deal?.id,
    queryFn: async () => {
      const { data } = await supabase.from('cap_deal_contracts').select('contract_type, executed_at, status').eq('deal_id', deal.id)
      return data || []
    },
  })

  const hasNda = firmContracts.some(c => c.contract_type === 'nda')
  const hasLoi = dealContracts.some(c => c.contract_type === 'loi' && (c.status === 'signed' || c.executed_at))
  const hasSpa = dealContracts.some(c => c.contract_type === 'spa' && (c.status === 'signed' || c.executed_at))
  const closed = deal?.status === 'closed'
  const statusIdx = STATUS_TO_STAGE[deal?.status] ?? 0

  // ステージ達成状況 (契約書優先、なければstatusから推定)
  const reached = {
    nda: hasNda || statusIdx >= 0,
    ioi: statusIdx >= 1 || hasLoi,
    loi: hasLoi || statusIdx >= 2,
    excl: statusIdx >= 3,
    spa: hasSpa || statusIdx >= 4,
    close: closed || statusIdx >= 5,
  }
  const currentIdx = STAGES.reduce((max, s, i) => reached[s.key] ? Math.max(max, i) : max, -1)

  const ev = deal?.ev_estimate
  const score = deal?.score || {}

  return (
    <div style={{ background: `linear-gradient(135deg, ${color.navy} 0%, ${color.border} 100%)`, color: color.textDark, border: `0.5px solid ${color.border}`, borderRadius: radius.xl, padding: '20px 24px', marginBottom: 14 }}>
      {/* Stage Gate bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: space[5] }}>
        {STAGES.map((s, i) => {
          const done = i <= currentIdx
          const current = i === currentIdx + 1
          return (
            <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: done ? color.navy : current ? color.white : color.white,
                  border: '1.5px solid ' + (done ? '#4a8cd0' : current ? color.navy : color.border),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: font.size.sm, fontWeight: font.weight.semibold, color: done ? color.white : current ? '#6a8aaa' : '#2a4a6a',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: font.size.xs - 1, color: done ? '#cedbea' : current ? '#6a8aaa' : '#2a4a6a', letterSpacing: 0.5 }}>
                  {s.short}
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <div style={{ flex: 1, height: 1.5, background: i < currentIdx ? color.navy : color.border, margin: '0 -10px', marginTop: -14 }} />
              )}
            </div>
          )
        })}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICell label="想定EV" value={ev ? `¥${(ev / 100000000).toFixed(1)}億` : '—'} hint="買収企業価値" />
        <KPICell label="買収スコア"
          value={score.total ? score.total : '—'}
          hint={score.total ? `財務${score.financial || 0} / シナジー${score.synergy || 0}` : 'IM投入で自動算出'}
          tone={score.total >= 80 ? 'green' : score.total >= 60 ? 'blue' : score.total ? 'red' : 'gray'}
        />
        <KPICell label="想定IRR"
          value="—"
          hint="LBOモデルから算出"
        />
        <KPICell label="想定 MoIC"
          value="—"
          hint="5年ホールド前提"
        />
      </div>
    </div>
  )
}

function KPICell({ label, value, hint, tone = 'gray' }) {
  const toneColor = { green: '#6ad095', blue: '#6aa0d0', red: '#d08080', gray: color.textDark }[tone]
  return (
    <div style={{ padding: 14, background: alpha(color.white, 0.04), border: `0.5px solid ${color.border}`, borderRadius: radius.xl }}>
      <div style={{ fontSize: font.size.xs - 1, color: '#6a8aaa', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: font.weight.semibold, color: toneColor, lineHeight: font.lineHeight.tight }}>{value}</div>
      {hint && <div style={{ fontSize: font.size.xs - 1, color: color.textMid, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}
