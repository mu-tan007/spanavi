import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'

export function useDeals(filters = {}) {
  return useQuery({
    queryKey: ['deals', filters],
    queryFn: async () => {
      let q = supabase
        .from('cap_deals')
        .select(`
          id, name, status, priority, source_type, industry_label,
          ev_estimate, fee_estimate, score, created_at, updated_at,
          intermediaries(id, name),
          contacts(id, name, email),
          deal_financials(fiscal_year, revenue, operating_income, ebitda, net_assets, cash, interest_bearing_debt)
        `)
        .order('priority', { ascending: true })
        .order('updated_at', { ascending: false })

      if (filters.status)   q = q.eq('status', filters.status)
      if (filters.priority) q = q.eq('priority', filters.priority)
      if (filters.search)   q = q.ilike('name', `%${filters.search}%`)

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
    staleTime: 30_000,
  })
}

export function useDeal(id) {
  return useQuery({
    queryKey: ['deal', id],
    queryFn: async () => {
      const [
        { data: deal },
        { data: company },
        { data: financials },
        { data: files },
        { data: meetings },
        { data: qa },
        { data: contracts },
        { data: todos },
        { data: schedules },
        { data: valuation },
        { data: lbo },
      ] = await Promise.all([
        supabase.from('cap_deals').select(`
          *, intermediaries(id,name,type), contacts(id,name,email,title)
        `).eq('id', id).single(),
        supabase.from('cap_deal_companies').select('*').eq('deal_id', id).maybeSingle(),
        supabase.from('cap_deal_financials').select('*').eq('deal_id', id).order('fiscal_year'),
        supabase.from('cap_deal_files').select('*').eq('deal_id', id).order('uploaded_at', { ascending: false }),
        supabase.from('cap_deal_meetings').select('*').eq('deal_id', id).order('held_at', { ascending: false }),
        supabase.from('cap_deal_qa').select('*').eq('deal_id', id).order('created_at'),
        supabase.from('cap_deal_contracts').select('*').eq('deal_id', id).order('created_at'),
        supabase.from('cap_deal_todos').select('*').eq('deal_id', id).eq('is_done', false),
        supabase.from('cap_deal_schedules').select('*').eq('deal_id', id),
        supabase.from('cap_deal_valuations').select('*').eq('deal_id', id).maybeSingle(),
        supabase.from('cap_lbo_models').select('*').eq('deal_id', id).maybeSingle(),
      ])
      return { deal, company, financials: financials || [], files: files || [],
               meetings: meetings || [], qa: qa || [], contracts: contracts || [],
               todos: todos || [], schedules: schedules || [], valuation, lbo }
    },
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function useUpdateDealStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, reason }) => {
      const update = { status, updated_at: new Date().toISOString() }
      if (status === 'stop')  update.stop_reason  = reason || null
      if (status === 'break') update.break_reason = reason || null
      const { error } = await supabase.from('cap_deals').update(update).eq('id', id)
      if (error) throw error
      await supabase.from('cap_deal_status_logs').insert({ deal_id: id, to_status: status, note: reason })
      logAudit({ action: 'update', resourceType: 'deal', resourceId: id, metadata: { field: 'status', to: status, reason } })
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['deal', id] })
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useCreateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      // Spanavi 統合後は tenant_id を持たない。auth.users().id を assigned_user_id に使う想定。
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('cap_deals')
        .insert({ assigned_user_id: user.id, ...payload })
        .select()
        .single()
      if (error) throw error
      logAudit({ action: 'create', resourceType: 'deal', resourceId: data.id, resourceName: data.name })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
