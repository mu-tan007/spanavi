import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useMaNewsReports({ startDate, endDate, industryKey, region } = {}) {
  return useQuery({
    queryKey: ['ma-news-reports', startDate, endDate, industryKey, region],
    queryFn: async () => {
      let q = supabase
        .from('ma_news_reports')
        .select('id, report_date, region, industry_key, title, summary, body_md, target_companies, deal_value_jpy, sources, published_at, created_at')
        .order('report_date', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(600)

      if (startDate) q = q.gte('report_date', startDate)
      if (endDate)   q = q.lte('report_date', endDate)
      if (industryKey && industryKey !== 'all') q = q.eq('industry_key', industryKey)
      if (region && region !== 'all') q = q.eq('region', region)

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
    staleTime: 60_000,
  })
}

export function useMaTrendReports({ periodType, industryKey, region } = {}) {
  return useQuery({
    queryKey: ['ma-trend-reports', periodType, industryKey, region],
    enabled: !!periodType,
    queryFn: async () => {
      let q = supabase
        .from('ma_trend_reports')
        .select('id, period_type, period_start, period_end, region, industry_key, title, summary, body_md, key_deals, sources, created_at')
        .eq('period_type', periodType)
        .order('period_start', { ascending: false })
        .limit(400)
      if (industryKey && industryKey !== 'all') q = q.eq('industry_key', industryKey)
      if (region && region !== 'all') q = q.eq('region', region)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
    staleTime: 120_000,
  })
}

export function useMaNewsAvailableDates() {
  return useQuery({
    queryKey: ['ma-news-available-dates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ma_news_reports')
        .select('report_date')
        .order('report_date', { ascending: false })
        .limit(60)
      if (error) throw error
      const unique = Array.from(new Set((data || []).map(r => r.report_date)))
      return unique
    },
    staleTime: 300_000,
  })
}
