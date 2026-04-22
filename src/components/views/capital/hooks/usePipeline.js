import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  NEXT_STAGE,
  STAGE_AGE_THRESHOLDS,
  STAGE_PROBABILITY,
  RECOMMENDATION_RULES,
} from '../lib/constants'

const ACTIVE_STAGES = Object.keys(NEXT_STAGE)
const DAY_MS = 24 * 60 * 60 * 1000

function daysSince(ts) {
  if (!ts) return 0
  return Math.max(0, (Date.now() - new Date(ts).getTime()) / DAY_MS)
}

function recommend(total) {
  if (total == null) return null
  if (total >= RECOMMENDATION_RULES.pursueMin) return 'PURSUE'
  if (total <= RECOMMENDATION_RULES.passMax)   return 'PASS'
  return 'HOLD'
}

function urgency(deal, stageAge) {
  const threshold = STAGE_AGE_THRESHOLDS[deal.status] || 14
  const priorityWeight = deal.priority === 1 ? 3.0 : deal.priority === 2 ? 2.0 : 1.0
  const clampedAge = Math.min(stageAge, threshold * 3)
  const ageRatio = clampedAge / threshold
  const total = deal.score?.total ?? 60
  const decisiveness = 1 + Math.abs(total - 60) / 40
  return priorityWeight * ageRatio * decisiveness
}

function needsDecision(deal, stageAge) {
  const threshold = STAGE_AGE_THRESHOLDS[deal.status]
  if (!threshold) return false
  if (deal.score?.total == null) return false
  if (stageAge >= threshold) return true
  if (deal.priority === 1 && stageAge >= 3) return true
  if ((deal.score?.total ?? 0) >= 80 && stageAge >= 5) return true
  return false
}

export function useDecisionQueue() {
  return useQuery({
    queryKey: ['pipeline', 'decision-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cap_deals')
        .select(`
          id, name, status, priority, industry_label,
          ev_estimate, score, updated_at, created_at,
          contacts(id, name)
        `)
        .in('status', ACTIVE_STAGES)

      if (error) throw error

      const items = (data || [])
        .map(d => {
          const stageAge = daysSince(d.updated_at)
          return {
            ...d,
            stageAge: Math.round(stageAge * 10) / 10,
            threshold: STAGE_AGE_THRESHOLDS[d.status],
            nextStage: NEXT_STAGE[d.status],
            recommendation: recommend(d.score?.total),
            urgency: urgency(d, stageAge),
            needsDecision: needsDecision(d, stageAge),
            weightedEv: (d.ev_estimate || 0) * (STAGE_PROBABILITY[d.status] || 0),
          }
        })
        .filter(d => d.needsDecision)
        .sort((a, b) => b.urgency - a.urgency)

      const weightedEvTotal = items.reduce((s, d) => s + d.weightedEv, 0)
      const byRec = items.reduce((acc, d) => {
        acc[d.recommendation] = (acc[d.recommendation] || 0) + 1
        return acc
      }, {})

      return { items, weightedEvTotal, byRec }
    },
    staleTime: 30_000,
  })
}
