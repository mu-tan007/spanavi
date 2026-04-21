import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STAGE_PROBABILITY, NEXT_STAGE } from '../lib/constants'

const ACTIVE_STAGES = Object.keys(NEXT_STAGE)
const DAY_MS = 24 * 60 * 60 * 1000

export function useMaMandate() {
  return useQuery({
    queryKey: ['ma-mandate'],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_profiles')
        .select('id, ma_mandate')
        .limit(1)
        .maybeSingle()
      return data || null
    },
    staleTime: 60_000,
  })
}

export function useSaveMaMandate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mandate) => {
      const { data: existing } = await supabase
        .from('company_profiles')
        .select('id')
        .limit(1)
        .maybeSingle()

      if (existing?.id) {
        const { error } = await supabase
          .from('company_profiles')
          .update({ ma_mandate: mandate, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('company_profiles')
          .insert({ ma_mandate: mandate })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ma-mandate'] })
      qc.invalidateQueries({ queryKey: ['company-profile'] })
      qc.invalidateQueries({ queryKey: ['budget-forecast'] })
    },
  })
}

function currentFyRange(startMonth, today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const fyStartYear = m >= startMonth ? y : y - 1
  const start = new Date(fyStartYear, startMonth - 1, 1)
  const end   = new Date(fyStartYear + 1, startMonth - 1, 1)
  return { start, end, label: `FY${fyStartYear}` }
}

export function useBudgetForecast() {
  return useQuery({
    queryKey: ['budget-forecast'],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('company_profiles')
        .select('ma_mandate')
        .limit(1)
        .maybeSingle()

      const mandate = profile?.ma_mandate || null
      if (!mandate?.annual_budget_jpy) {
        return { mandate: null, configured: false }
      }

      const { data: deals, error } = await supabase
        .from('deals')
        .select('id, status, ev_estimate')
        .in('status', ACTIVE_STAGES)
      if (error) throw error

      const committed = (deals || []).reduce((sum, d) => {
        const prob = STAGE_PROBABILITY[d.status] || 0
        return sum + (d.ev_estimate || 0) * prob
      }, 0)

      const budget = Number(mandate.annual_budget_jpy) || 0
      const remaining = budget - committed
      const fy = currentFyRange(mandate.fiscal_year_start_month || 4)
      const now = new Date()
      const fyTotalDays = Math.max(1, Math.round((fy.end - fy.start) / DAY_MS))
      const fyRemainingDays = Math.max(0, Math.round((fy.end - now) / DAY_MS))
      const fyElapsedRatio = 1 - (fyRemainingDays / fyTotalDays)

      const committedRatio = budget > 0 ? committed / budget : 0

      let pace = 'ok'
      let paceMessage = '予算内で着地見込'
      if (committedRatio > 1.1) {
        pace = 'over'
        paceMessage = '加重コミットが年間予算を上回っています。一部案件のステージ精査を推奨'
      } else if (committedRatio < 0.3 && fyElapsedRatio >= 0.5) {
        pace = 'low'
        const monthsLeft = Math.max(1, fyRemainingDays / 30)
        const needPerMonth = remaining / monthsLeft
        paceMessage = `FY残り期間に対してパイプラインが不足しています。月あたり約 ¥${(needPerMonth / 1e8).toFixed(1)}億の追加ソーシングを推奨`
      } else if (committedRatio >= 0.7) {
        pace = 'good'
        paceMessage = '予算内で着地見込'
      } else {
        pace = 'building'
        paceMessage = 'パイプライン形成中'
      }

      return {
        configured: true,
        mandate,
        budget,
        committed,
        remaining,
        committedRatio,
        fyLabel: fy.label,
        fyStart: fy.start.toISOString(),
        fyEnd: fy.end.toISOString(),
        fyRemainingDays,
        fyTotalDays,
        fyElapsedRatio,
        activeDealCount: (deals || []).length,
        pace,
        paceMessage,
      }
    },
    staleTime: 30_000,
  })
}
