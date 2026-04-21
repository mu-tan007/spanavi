import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [
        { data: deals },
        { data: todos },
        { data: notifications },
        { data: meetings },
      ] = await Promise.all([
        supabase.from('deals').select('id, name, status, priority, industry_label, ev_estimate, intermediary_id, contact_id, updated_at'),
        supabase.from('deal_todos').select('id, title, due_date, is_done, priority, deal_id').eq('is_done', false).order('due_date', { ascending: true }).limit(6),
        supabase.from('notifications').select('id, type, title, summary, is_read, created_at, deal_id').order('created_at', { ascending: false }).limit(5),
        supabase.from('deal_meetings').select('id, deal_id, meeting_type, held_at, summary').gte('held_at', new Date().toISOString()).order('held_at', { ascending: true }).limit(5),
      ])

      const active = (deals || []).filter(d => !['stop','break'].includes(d.status))
      const stopped = (deals || []).filter(d => d.status === 'stop')
      const broken  = (deals || []).filter(d => d.status === 'break')

      const statusCounts = {}
      for (const d of active) {
        statusCounts[d.status] = (statusCounts[d.status] || 0) + 1
      }

      const priority1 = active.filter(d => d.priority === 1).length
      const topMeetingThisMonth = (meetings || []).filter(m => m.meeting_type === 'top_meeting').length
      const unreadNotif = (notifications || []).filter(n => !n.is_read).length

      return {
        deals: deals || [],
        active,
        stopped,
        broken,
        statusCounts,
        kpi: {
          activeCount: active.length,
          priority1Count: priority1,
          topMeetingCount: topMeetingThisMonth,
          todoCount: (todos || []).length,
          unreadNotif,
        },
        todos: todos || [],
        notifications: notifications || [],
        meetings: meetings || [],
      }
    },
    staleTime: 30_000,
  })
}
