import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getOrgId } from '../lib/orgContext'

/**
 * Supabaseから全データを取得してSpanaviAppに渡す形式に変換するフック
 * 既存のハードコードデータと同じ形式に変換することで、SpanaviApp内の変更を最小限にする
 */
export function useSpanaviData(authOrgId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fetchedOrgIdRef = useRef(null)
  // 一時的な取得失敗時のリトライ管理。
  // 失敗時に空データで上書きすると「アポ一覧等が全部消えた」表示になるため、
  // 前回データを保持したまま自動リトライする（2026-06-11 IO枯渇インシデント対策 P4）
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef(null)
  const mountedRef = useRef(true)
  useEffect(() => () => {
    mountedRef.current = false
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
  }, [])

  // authOrgIdが確定したらフェッチ（確定前はスキップ）
  useEffect(() => {
    if (!authOrgId) return
    if (fetchedOrgIdRef.current === authOrgId) return
    fetchAllData()
  }, [authOrgId])

  const hasDataRef = useRef(false)

  const fetchAllData = async () => {
    let keepLoadingForRetry = false
    try {
      setLoading(true)
      setError(null)

      // 並列で全テーブル取得（authOrgIdを優先、なければorgContextから）
      const orgId = authOrgId || getOrgId()
      fetchedOrgIdRef.current = orgId
      const [
        clientsRes,
        callListsRes,
        membersRes,
        appointmentsRes,
        rewardTypesRes,
        clientContactsRes,
        sourcingEngRes,
        clientEngagementRewardsRes,
        engagementsRes,
        businessCategoriesRes,
      ] = await Promise.all([
        supabase.from('clients').select('*').eq('org_id', orgId).order('sort_order'),
        supabase.from('call_lists').select('*').eq('org_id', orgId).order('sort_order'),
        // スパキャリ受講生(rank='student')は営業代行のメンバー集計に出さない。
        // 受講生は members に登録されるが本データセットは営業代行向け（ランキング・売上・KPI等の源流）。
        // 注: 除外(is_active/rank)は PostgREST の .neq() で行わない。
        // .neq('rank','student') / .neq('is_active', false) は対象列が NULL の行も巻き添えで除外する
        // (SQL 三値論理: NULL <> x は NULL=非真 で弾かれる)。新規追加メンバーは rank=NULL で作られるため
        // シフト/名簿から消える事故が起きた(手嶋氏)。除外は取得後に JS 側で行う(下記 filter)。
        supabase.from('members').select('*').eq('org_id', orgId).order('sort_order'),
        supabase.from('appointments').select('*').eq('org_id', orgId).order('appointment_date', { ascending: false }),
        supabase.from('reward_types').select('*').order('type_id'),
        supabase.from('client_contacts').select('*').eq('org_id', orgId).order('created_at'),
        supabase.from('engagements').select('id').eq('org_id', orgId).eq('slug', 'seller_sourcing').maybeSingle(),
        supabase.from('client_engagement_reward_settings').select('client_id, engagement_id, reward_type, intro_count, intro_reward_type').eq('org_id', orgId),
        supabase.from('engagements').select('id, name, slug, category_id').eq('org_id', orgId),
        supabase.from('business_categories').select('id, name').eq('org_id', orgId),
      ])

      // Sourcing 事業の member_engagements.role_id → engagement_roles.name を取得
      // members.position はクリーンアップ済み（代表取締役/取締役のみ）なので、事業内ポジションは
      // member_engagements 経由で取得し、既存コード互換のため m.role に注入する
      const sourcingEngId = sourcingEngRes?.data?.id || null
      const sourcingRoleMap = {}
      if (sourcingEngId) {
        const { data: meRoleRows } = await supabase
          .from('member_engagements')
          .select('member_id, role:engagement_roles(name)')
          .eq('org_id', orgId)
          .eq('engagement_id', sourcingEngId)
          .not('role_id', 'is', null)
        ;(meRoleRows || []).forEach(r => {
          if (r.role?.name) sourcingRoleMap[r.member_id] = r.role.name
        })
      }
      // engagement_roles.name → 既存コードが期待する legacy 役職名
      const ROLE_LEGACY_MAP = {
        'リーダー': 'チームリーダー',
        '副リーダー': '副リーダー',
        'メンバー': 'メンバー',
      }

      // エラーチェック: 1本でも失敗したら、空データで画面を上書きせず
      // 前回データを保持したまま自動リトライする。
      // （旧実装は失敗を console.warn だけして空配列で描画していたため、
      //   クエリが波に当たるたび「アポ一覧等が全部消えた」表示になっていた）
      const failedRes = [clientsRes, callListsRes, membersRes, appointmentsRes, rewardTypesRes,
        clientContactsRes, sourcingEngRes, clientEngagementRewardsRes, engagementsRes, businessCategoriesRes]
        .find(res => res?.error)
      if (failedRes) {
        console.warn('[useSpanaviData] 取得失敗 — 前回データを保持して自動再試行します:', failedRes.error.message)
        setError(failedRes.error.message)
        if (mountedRef.current && retryCountRef.current < 5) {
          retryCountRef.current += 1
          const delay = Math.min(3000 * retryCountRef.current, 10000)
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
          retryTimerRef.current = setTimeout(() => { if (mountedRef.current) fetchAllData() }, delay)
          // 初回ロード（まだ何も表示できていない）の間はローディング表示を維持
          if (!hasDataRef.current) keepLoadingForRetry = true
        }
        return // data は更新しない（前回値を維持）
      }
      retryCountRef.current = 0

      const clients = clientsRes.data || []
      const callLists = callListsRes.data || []
      // 除外フィルタは JS 側で(PostgREST .neq() の NULL 巻き添え回避)。
      // is_active === false は明示的に無効化された人だけ除外し、NULL/true は残す。
      // rank === 'student' のスパキャリ受講生のみ除外し、rank=NULL の新規メンバーは残す。
      const members = (membersRes.data || [])
        .filter(m => m.is_active !== false && m.rank !== 'student')
      const appointments = appointmentsRes.data || []
      const rewardTypes = rewardTypesRes.data || []
      const clientContacts = clientContactsRes.data || []

      // client_id → 担当者リストのマップ
      const contactsByClient = {}
      clientContacts.forEach(cc => {
        if (!contactsByClient[cc.client_id]) contactsByClient[cc.client_id] = []
        contactsByClient[cc.client_id].push({ id: cc.id, name: cc.name, email: cc.email, slackMemberId: cc.slack_member_id || '', googleCalendarId: cc.google_calendar_id || '', schedulingUrl: cc.scheduling_url || '', schedulingUrl2: cc.scheduling_url_2 || '', schedulingLabel: cc.scheduling_label || '', schedulingLabel2: cc.scheduling_label_2 || '', schedulingNotes: cc.scheduling_notes || '', isPrimary: cc.is_primary === true })
      })

      // clientsのUUID→name マップ（call_listsのclient_id解決用）
      const clientMap = {}
      clients.forEach(c => { clientMap[c.id] = c })

      // engagement_id → 商材カテゴリ名 / engagement.name のマップを構築
      // 表示上の「リストタイプ」は商材カテゴリ(IFA/M&A/SaaS/人材)を最優先で出す
      const engagementsAll = engagementsRes?.data || []
      const businessCategoriesAll = businessCategoriesRes?.data || []
      const categoryNameMap = new Map(businessCategoriesAll.map(c => [c.id, c.name]))
      const engagementMetaMap = new Map(
        engagementsAll.map(e => [
          e.id,
          {
            engagementName: e.name || '',
            engagementSlug: e.slug || '',
            productCategoryName: e.category_id ? (categoryNameMap.get(e.category_id) || '') : '',
          },
        ])
      )

      // call_lists → 既存CALL_LISTSフォーマットに変換
      const callListsFormatted = callLists.map((cl, idx) => {
        const meta = cl.engagement_id ? engagementMetaMap.get(cl.engagement_id) : null
        return ({
        id: idx + 1,
        _supaId: cl.id,
        company: clientMap[cl.client_id]?.name || cl.name?.split(' - ')[0] || '',
        type: cl.list_type || '',
        productCategoryName: meta?.productCategoryName || '',
        engagementName: meta?.engagementName || '',
        engagementSlug: meta?.engagementSlug || '',
        status: cl.status || '架電可能',
        industry: cl.industry || '',
        count: cl.total_count || 0,
        manager: cl.manager_name || '',
        companyInfo: cl.company_info || '',
        companyUrl: cl.company_url || '',
        scriptBody: cl.script_body || '',
        cautions: cl.cautions || '',
        rebuttalData: cl.rebuttal_data || '',
        scriptPdfs: Array.isArray(cl.script_pdfs) ? cl.script_pdfs : [],
        companyOverviewPdfs: Array.isArray(cl.company_overview_pdfs) ? cl.company_overview_pdfs : [],
        script: cl.script_name || '',
        notes: cl.notes || '',
        is_archived: cl.is_archived || false,
        is_prospecting: cl.is_prospecting === true,
        engagement_id: cl.engagement_id || null,
        client_id: cl.client_id || null,
        // リスト単位のアポ単価上書き（税別円）。NULL=報酬マスタを使用
        appoUnitPrice: cl.appo_unit_price != null ? Number(cl.appo_unit_price) : null,
        // ツリー型スクリプト（ノード＋リンク）。NULL=テキスト型のみ
        scriptTree: cl.script_tree || null,
        contactIds: (cl.contact_ids && cl.contact_ids.length > 0) ? cl.contact_ids : (cl.contact_id ? [cl.contact_id] : []),
        created_at: cl.created_at || null,
      });
      })

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
        memo: c.memo || '',
        googleCalendarId: c.google_calendar_id || '',
        clientEmail: c.client_email || '',
        schedulingUrl: c.scheduling_url || '',
        slackWebhookUrl: c.slack_webhook_url || '',
        slackWebhookUrlInternal: c.slack_webhook_url_internal || '',
        chatworkRoomId: c.chatwork_room_id || '',
        statusChangedAt: c.status_changed_at || null,
        nextContactAt: c.next_contact_at || null,
        contactPhone: c.contact_phone || '',
        isFavorite: c.is_favorite === true,
        address: c.address || '',
        representativeName: c.representative_name || '',
        hpUrl: c.hp_url || '',
      }))

      // members → 既存DEFAULT_MEMBERSフォーマット（名前のリスト）
      const membersFormatted = members.map(m => m.name)

      // members → 詳細情報（従業員名簿タブ用・DEFAULT_MEMBERSと同フィールド名）
      const membersDetailed = members.map(m => {
        // 事業内ポジション（Sourcing）を優先、無ければ会社役職にフォールバック
        const engagementRoleName = sourcingRoleMap[m.id] || null
        const legacyRole = engagementRoleName
          ? (ROLE_LEGACY_MAP[engagementRoleName] || engagementRoleName)
          : (m.position || '')
        return {
          _supaId: m.id,
          id: m.id,
          user_id: m.user_id || null,
          no: m.sort_order || 0,
          name: m.name || '',
          email: m.email || '',
          phone_number: m.phone_number || '',
          start_date: m.start_date || '',
          university: m.university || '',
          year: m.grade || 0,
          offer: m.job_offer || '',
          team: m.team || '',
          position: m.position || '',  // 会社役職（代表取締役/取締役）
          role: legacyRole,             // 事業内ポジション (チームリーダー/副リーダー/メンバー) or 会社役職
          rank: m.rank || '',
          rate: parseFloat(m.incentive_rate) || 0,
          totalSales: parseInt(m.cumulative_sales) || 0,
          joinDate: m.start_date || '',
          operationStartDate: m.operation_start_date || '',
          referrerName: m.referrer_name || '',
          referralPaidPayMonth: m.referral_paid_pay_month || '',
          zoomUserId: m.zoom_user_id || '',
          zoomPhoneNumber: m.zoom_phone_number || '',
          avatarUrl: m.avatar_url || '',
        }
      })

      // call_lists.id → is_prospecting マップ（appointments 側でクライアント開拓フラグを引くため）
      const listProspectingMap = new Map()
      callLists.forEach(cl => { if (cl.id) listProspectingMap.set(cl.id, cl.is_prospecting === true) })

      // appointments → 既存APPO_DATAフォーマットに変換
      const appoDataFormatted = appointments.map(a => ({
        _supaId: a.id,
        client: clientMap[a.client_id]?.name || '',
        company: a.company_name || '',
        getter: a.getter_name || '',
        getDate: a.created_at ? new Date(a.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) : '',
        appointmentDate: a.appointment_date || '',
        meetDate: a.meeting_date ? new Date(a.meeting_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) : '',
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
        recordingUrl: a.recording_url || '',
        appoReport: (a.appo_report || '').replace(/\\n/g, '\n'),
        isCounted: a.is_counted_in_cumulative || false,
        emailStatus: a.email_status || 'pending',
        emailApprovedAt: a.email_approved_at || null,
        emailSentAt: a.email_sent_at || null,
        gcalEventId: a.gcal_event_id || null,
        meetTime: a.meeting_time || '',
        meetLocation: a.meeting_location || '',
        isOnline: a.is_online || false,
        list_id: a.list_id || null,
        item_id: a.item_id || null,
        engagement_id: a.engagement_id || null,
        // クライアント開拓リスト由来のアポは売上集計から除外し、インターン報酬のみカウントする
        isProspecting: !!(a.list_id && listProspectingMap.get(a.list_id)),
        // 録音 AI 再生成時に Zoom 検索ウィンドウを called_at 周辺に合わせるための原値
        createdAtRaw: a.created_at || null,
      }))

      const clientEngagementRewards = clientEngagementRewardsRes?.data || []
      hasDataRef.current = true
      setData({
        callLists: callListsFormatted,
        clientData: clientDataFormatted,
        members: membersFormatted,
        membersDetailed,
        appoData: appoDataFormatted,
        rewardTypes,
        clientEngagementRewards,
        contactsByClient,
        // 生データも保持（書き込み時に使う）
        _raw: { clients, callLists, members, appointments, rewardTypes },
      })
    } catch (err) {
      // ネットワーク断等の例外も同様に: 空表示にせず前回データを保持してリトライ
      console.error('Failed to fetch Spanavi data:', err)
      setError(err.message)
      if (mountedRef.current && retryCountRef.current < 5) {
        retryCountRef.current += 1
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = setTimeout(() => { if (mountedRef.current) fetchAllData() }, Math.min(3000 * retryCountRef.current, 10000))
        if (!hasDataRef.current) keepLoadingForRetry = true
      }
    } finally {
      if (!keepLoadingForRetry) setLoading(false)
    }
  }

  return { data, loading, error, refetch: fetchAllData }
}
