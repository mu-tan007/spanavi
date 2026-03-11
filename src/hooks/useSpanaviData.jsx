import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Supabaseから全データを取得してSpanaviAppに渡す形式に変換するフック
 * 既存のハードコードデータと同じ形式に変換することで、SpanaviApp内の変更を最小限にする
 */
export function useSpanaviData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAllData()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        fetchAllData()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)

      // 並列で全テーブル取得
      const [
        clientsRes,
        callListsRes,
        membersRes,
        appointmentsRes,
        rewardTypesRes,
      ] = await Promise.all([
        supabase.from('clients').select('*').order('sort_order'),
        supabase.from('call_lists').select('*').order('sort_order'),
        supabase.from('members').select('*').order('sort_order'),
        supabase.from('appointments').select('*').order('appointment_date', { ascending: false }),
        supabase.from('reward_types').select('*').order('type_id'),
      ])

      // エラーチェック
      for (const res of [clientsRes, callListsRes, membersRes, appointmentsRes, rewardTypesRes]) {
        if (res.error) {
          console.warn('Supabase fetch warning:', res.error.message)
        }
      }

      const clients = clientsRes.data || []
      const callLists = callListsRes.data || []
      const members = membersRes.data || []
      const appointments = appointmentsRes.data || []
      const rewardTypes = rewardTypesRes.data || []

      // clientsのUUID→name マップ（call_listsのclient_id解決用）
      const clientMap = {}
      clients.forEach(c => { clientMap[c.id] = c })

      // call_lists → 既存CALL_LISTSフォーマットに変換
      const callListsFormatted = callLists.map((cl, idx) => ({
        id: idx + 1,
        _supaId: cl.id,
        company: clientMap[cl.client_id]?.name || cl.name?.split(' - ')[0] || '',
        type: cl.list_type || '',
        status: cl.status || '架電可能',
        industry: cl.industry || '',
        count: cl.total_count || 0,
        manager: cl.manager_name || '',
        companyInfo: cl.company_info || '',
        scriptBody: cl.script_body || '',
        cautions: cl.cautions || '',
        script: cl.script_name || '',
        notes: cl.notes || '',
        is_archived: cl.is_archived || false,
      }))

      // clients → 既存CLIENT_DATAフォーマットに変換
      const clientDataFormatted = clients.map(c => ({
        _supaId: c.id,
        no: c.sort_order || 0,
        status: c.status || '',
        contract: c.contract_status || '',
        company: c.name || '',
        industry: c.industry || '',
        target: c.supply_target || 0,
        rewardType: c.reward_type || '',
        paySite: c.payment_site || '',
        payNote: c.payment_note || '',
        listSrc: c.list_source || '',
        calendar: c.calendar_type || '',
        contact: c.contact_method || '',
        noteFirst: (c.notes || '').replace(/\\n/g, '\n'),
        noteKickoff: (c.note_kickoff || '').replace(/\\n/g, '\n'),
        noteRegular: (c.note_regular || '').replace(/\\n/g, '\n'),
      }))

      // members → 既存DEFAULT_MEMBERSフォーマット（名前のリスト）
      const membersFormatted = members.map(m => m.name)

      // members → 詳細情報（従業員名簿タブ用・DEFAULT_MEMBERSと同フィールド名）
      const membersDetailed = members.map(m => ({
        _supaId: m.id,
        id: m.id,
        no: m.sort_order || 0,
        name: m.name || '',
        university: m.university || '',
        year: m.grade || 0,
        offer: m.job_offer || '',
        team: m.team || '',
        role: m.position || '',
        rank: m.rank || '',
        rate: parseFloat(m.incentive_rate) || 0,
        totalSales: parseInt(m.cumulative_sales) || 0,
        joinDate: m.start_date || '',
        operationStartDate: m.operation_start_date || '',
        referrerName: m.referrer_name || '',
        zoomUserId: m.zoom_user_id || '',
      }))

      // appointments → 既存APPO_DATAフォーマットに変換
      const appoDataFormatted = appointments.map(a => ({
        _supaId: a.id,
        client: clientMap[a.client_id]?.name || '',
        company: a.company_name || '',
        getter: a.getter_name || '',
        getDate: a.appointment_date || '',
        meetDate: a.meeting_date ? a.meeting_date.split('T')[0] : '',
        status: a.status || '',
        sales: a.sales_amount || 0,
        reward: a.intern_reward || 0,
        note: (a.notes || '').replace(/\\n/g, '\n'),
        month: a.appo_month || '',
        preCheckStatus: a.pre_check_status || '',
        preCheckMemo: a.pre_check_memo || '',
        rescheduledAt: a.rescheduled_at ? a.rescheduled_at.slice(0, 16).replace(' ', 'T') : '',
        cancelReason: a.cancel_reason || '',
        phone: a.phone || '',
        appoReport: (a.appo_report || '').replace(/\\n/g, '\n'),
        isCounted: a.is_counted_in_cumulative || false,
      }))

      setData({
        callLists: callListsFormatted,
        clientData: clientDataFormatted,
        members: membersFormatted,
        membersDetailed,
        appoData: appoDataFormatted,
        rewardTypes,
        // 生データも保持（書き込み時に使う）
        _raw: { clients, callLists, members, appointments, rewardTypes },
      })
    } catch (err) {
      console.error('Failed to fetch Spanavi data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error, refetch: fetchAllData }
}
