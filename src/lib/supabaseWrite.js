import { supabase } from '../lib/supabase'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

// ============================================================
// Call Lists (架電リスト)
// ============================================================

export async function updateCallList(supaId, data) {
  if (!supaId) { console.warn('[DB] updateCallList: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({
      industry: data.industry,
      status: data.status,
      total_count: parseInt(data.count) || 0,
      manager_name: data.manager,
      company_info: data.companyInfo,
      script_body: data.scriptBody,
      cautions: data.cautions,
      notes: data.notes,
      list_type: data.type,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateCallList error:', error)
  return error
}

export async function insertCallList(data) {
  // まずclient_idを取得
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .eq('name', data.company)
    .limit(1)
  const clientId = clients?.[0]?.id || null

  const { data: result, error } = await supabase
    .from('call_lists')
    .insert({
      org_id: ORG_ID,
      client_id: clientId,
      name: `${data.company} - ${data.industry}`,
      industry: data.industry,
      status: data.status || '架電可能',
      total_count: parseInt(data.count) || 0,
      manager_name: data.manager,
      company_info: data.companyInfo,
      script_body: data.scriptBody,
      cautions: data.cautions,
      notes: data.notes,
      list_type: data.type,
      script_name: data.script,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertCallList error:', error)
  return { result, error }
}

export async function deleteCallList(supaId) {
  if (!supaId) { console.warn('[DB] deleteCallList: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .delete()
    .eq('id', supaId)
  if (error) console.error('[DB] deleteCallList error:', error)
  return error
}

export async function archiveCallList(supaId) {
  if (!supaId) { console.warn('[DB] archiveCallList: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ is_archived: true })
    .eq('id', supaId)
  if (error) console.error('[DB] archiveCallList error:', error)
  return error
}

export async function restoreCallList(supaId) {
  if (!supaId) { console.warn('[DB] restoreCallList: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ is_archived: false })
    .eq('id', supaId)
  if (error) console.error('[DB] restoreCallList error:', error)
  return error
}

// ============================================================
// Clients (クライアント)
// ============================================================

export async function insertClient(data) {
  const { data: result, error } = await supabase
    .from('clients')
    .insert({
      org_id: ORG_ID,
      name: data.company,
      status: data.status || '準備中',
      contract_status: data.contract || '未',
      industry: data.industry || '',
      supply_target: parseInt(data.target) || 0,
      reward_type: data.rewardType || null,
      payment_site: data.paySite || '',
      payment_note: data.payNote || '',
      list_source: data.listSrc || '',
      calendar_type: data.calendar || '',
      contact_method: data.contact || '',
      notes: data.noteFirst || '',
    })
    .select()
    .single()
  if (error) console.error('[DB] insertClient error:', error)
  return { result, error }
}

export async function updateClient(supaId, data) {
  if (!supaId) { console.warn('[DB] updateClient: no supaId'); return null }
  const { error } = await supabase
    .from('clients')
    .update({
      name: data.company,
      status: data.status,
      contract_status: data.contract,
      industry: data.industry,
      supply_target: parseInt(data.target) || 0,
      reward_type: data.rewardType,
      payment_site: data.paySite,
      payment_note: data.payNote,
      list_source: data.listSrc,
      calendar_type: data.calendar,
      contact_method: data.contact,
      notes: data.noteFirst,
      note_kickoff: data.noteKickoff || null,
      note_regular: data.noteRegular || null,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateClient error:', error)
  return error
}

export async function deleteClient(supaId) {
  if (!supaId) { console.warn('[DB] deleteClient: no supaId'); return null }
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', supaId)
  if (error) console.error('[DB] deleteClient error:', error)
  return error
}

// ============================================================
// Appointments (アポ管理)
// ============================================================

export async function updateAppointment(supaId, data) {
  if (!supaId) { console.warn('[DB] updateAppointment: no supaId'); return null }
  const { error } = await supabase
    .from('appointments')
    .update({
      company_name: data.company,
      status: data.status,
      getter_name: data.getter,
      appointment_date: data.getDate || null,
      meeting_date: data.meetDate || null,
      sales_amount: parseInt(data.sales) || 0,
      intern_reward: parseInt(data.reward) || 0,
      notes: data.note,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateAppointment error:', error)
  return error
}

export async function insertAppointment(data) {
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .eq('name', data.client)
    .limit(1)
  const clientId = clients?.[0]?.id || null

  const appoMonth = data.meetDate ? (parseInt(data.meetDate.slice(5, 7), 10) + '月') : ''

  const { data: result, error } = await supabase
    .from('appointments')
    .insert({
      org_id: ORG_ID,
      client_id: clientId,
      company_name: data.company,
      status: data.status || 'アポ取得',
      getter_name: data.getter,
      appointment_date: data.getDate || null,
      meeting_date: data.meetDate || null,
      sales_amount: parseInt(data.sales) || 0,
      intern_reward: parseInt(data.reward) || 0,
      notes: data.note,
      appo_month: appoMonth,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertAppointment error:', error)
  return { result, error }
}

export async function updatePreCheckResult(supaId, data) {
  if (!supaId) { console.warn('[DB] updatePreCheckResult: no supaId'); return null }
  const { error } = await supabase
    .from('appointments')
    .update({
      pre_check_status: data.preCheckStatus || null,
      pre_check_memo: data.preCheckMemo || null,
      rescheduled_at: data.rescheduledAt || null,
      cancel_reason: data.cancelReason || null,
      status: data.status,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updatePreCheckResult error:', error)
  return error
}

export async function deleteAppointment(supaId) {
  if (!supaId) { console.warn('[DB] deleteAppointment: no supaId'); return null }
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', supaId)
  if (error) console.error('[DB] deleteAppointment error:', error)
  return error
}

// ============================================================
// Call List Items (架電先企業)
// ============================================================

export async function fetchCallListItems(listId) {
  const PAGE_SIZE = 1000
  let from = 0
  let allData = []
  while (true) {
    const { data, error } = await supabase
      .from('call_list_items')
      .select('*')
      .eq('list_id', listId)
      .order('no')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('[DB] fetchCallListItems error:', error)
      return { data: allData.length ? allData : [], error }
    }
    allData = allData.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: allData, error: null }
}

export async function updateCallListItem(id, updates) {
  if (!id) { console.warn('[DB] updateCallListItem: no id'); return null }
  const { error } = await supabase
    .from('call_list_items')
    .update(updates)
    .eq('id', id)
  if (error) console.error('[DB] updateCallListItem error:', error)
  return error
}

export async function insertCallListItems(listId, rows) {
  if (!listId || !rows?.length) return { data: null, error: null }
  const CHUNK_SIZE = 500
  const totalChunks = Math.ceil(rows.length / CHUNK_SIZE)
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const items = chunk.map(r => ({
      org_id: ORG_ID,
      list_id: listId,
      no: r.no,
      company: r.company || '',
      business: r.business || '',
      representative: r.representative || '',
      phone: r.phone || '',
      address: r.address || '',
      revenue: r.revenue ?? null,
      net_income: r.net_income ?? null,
      employees: r.employees ?? null,
      url: r.url || null,
      memo: r.memo || null,
    }))
    const chunkNo = Math.floor(i / CHUNK_SIZE) + 1
    console.log(`[DB] insertCallListItems チャンク ${chunkNo}/${totalChunks} — ${chunk.length}件`)
    const { error } = await supabase
      .from('call_list_items')
      .upsert(items, { onConflict: 'list_id,no', ignoreDuplicates: true })
    if (error) {
      console.error(`[DB] insertCallListItems error (チャンク${chunkNo}/${totalChunks}):`, error)
      return { data: null, error }
    }
  }
  return { data: null, error: null }
}

// ============================================================
// Members (従業員)
// ============================================================

export async function updateMember(supaId, data) {
  if (!supaId) { console.warn('[DB] updateMember: no supaId'); return null }
  const { error } = await supabase
    .from('members')
    .update({
      name: data.name,
      university: data.university,
      grade: parseInt(data.year) || 0,
      team: data.team,
      position: data.role,
      rank: data.rank,
      incentive_rate: parseFloat(data.rate) || 0,
      job_offer: data.offer,
      operation_start_date: data.operationStartDate || null,
      referrer_name: data.referrerName || null,
      zoom_user_id: data.zoomUserId || null,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateMember error:', error)
  return error
}

export async function insertMember(data) {
  const { data: result, error } = await supabase
    .from('members')
    .insert({
      org_id: ORG_ID,
      name: data.name,
      university: data.university || '',
      grade: parseInt(data.year) || 0,
      team: data.team || '',
      position: data.role || 'メンバー',
      rank: data.rank || 'トレーニー',
      incentive_rate: parseFloat(data.rate) || 0.22,
      job_offer: data.offer || '',
      cumulative_sales: 0,
      start_date: new Date().toISOString().slice(0, 10),
      operation_start_date: data.operationStartDate || null,
      referrer_name: data.referrerName || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertMember error:', error)
  return { result, error }
}

export async function deleteMember(supaId) {
  if (!supaId) { console.warn('[DB] deleteMember: no supaId'); return null }
  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', supaId)
  if (error) console.error('[DB] deleteMember error:', error)
  return error
}

export async function updateAppoCounted(supaId, isCounted) {
  if (!supaId) return null
  const { error } = await supabase
    .from('appointments')
    .update({ is_counted_in_cumulative: isCounted })
    .eq('id', supaId)
  if (error) console.error('[DB] updateAppoCounted error:', error)
  return error
}

export async function updateMemberReward(supaId, { cumulativeSales, rank, incentiveRate }) {
  if (!supaId) { console.warn('[DB] updateMemberReward: no supaId'); return null }
  const { error } = await supabase
    .from('members')
    .update({
      cumulative_sales: cumulativeSales,
      rank: rank,
      incentive_rate: incentiveRate,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateMemberReward error:', error)
  return error
}

// ============================================================
// Call Records (架電記録)
// ============================================================

export async function fetchCallRecords(listId) {
  const PAGE_SIZE = 1000
  let from = 0
  let allData = []
  while (true) {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .eq('list_id', listId)
      .order('round')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('[DB] fetchCallRecords error:', error)
      return { data: allData.length ? allData : [], error }
    }
    allData = allData.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: allData, error: null }
}

export async function insertCallRecord(data) {
  const { data: result, error } = await supabase
    .from('call_records')
    .insert({
      org_id: ORG_ID,
      item_id: data.item_id,
      list_id: data.list_id,
      round: data.round,
      status: data.status,
      memo: data.memo || null,
      called_at: data.called_at || new Date().toISOString(),
      recording_url: data.recording_url || null,
      getter_name: data.getter_name || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertCallRecord error:', error)
  return { result, error }
}

export async function deleteCallRecord(id) {
  if (!id) { console.warn('[DB] deleteCallRecord: no id'); return null }
  const { error } = await supabase
    .from('call_records')
    .delete()
    .eq('id', id)
  if (error) console.error('[DB] deleteCallRecord error:', error)
  return error
}

export async function deleteCallRecordByItemRound(itemId, round) {
  if (!itemId || round == null) { console.warn('[DB] deleteCallRecordByItemRound: missing args'); return null }
  const { error } = await supabase
    .from('call_records')
    .delete()
    .eq('item_id', itemId)
    .eq('round', round)
  if (error) console.error('[DB] deleteCallRecordByItemRound error:', error)
  return error
}

export async function deleteCallRecordsByListId(listId) {
  if (!listId) { console.warn('[DB] deleteCallRecordsByListId: no listId'); return null }
  const { error } = await supabase
    .from('call_records')
    .delete()
    .eq('list_id', listId)
  if (error) console.error('[DB] deleteCallRecordsByListId error:', error)
  return error
}

export async function deleteCallListItemsByListId(listId) {
  if (!listId) { console.warn('[DB] deleteCallListItemsByListId: no listId'); return null }
  const { error } = await supabase
    .from('call_list_items')
    .delete()
    .eq('list_id', listId)
  if (error) console.error('[DB] deleteCallListItemsByListId error:', error)
  return error
}

export async function fetchAllRecallRecords() {
  const { data: records, error } = await supabase
    .from('call_records')
    .select('*')
    .in('status', ['受付再コール', '社長再コール'])
    .order('called_at', { ascending: false })
  if (error) { console.error('[DB] fetchAllRecallRecords error:', error); return { data: [], error } }

  // フィルタ1: memo.recall_completed === true のものを除外
  const memoFiltered = (records || []).filter(r => {
    try { return JSON.parse(r.memo || '{}').recall_completed !== true } catch { return true }
  })

  const itemIds = [...new Set(memoFiltered.map(r => r.item_id).filter(Boolean))]
  const listIds = [...new Set(memoFiltered.map(r => r.list_id).filter(Boolean))]
  let itemMap = {}
  let listMap = {}
  let clientMap = {}

  if (itemIds.length > 0) {
    // call_status も取得して完了判定に使う
    const { data: items } = await supabase
      .from('call_list_items')
      .select('id, company, phone, representative, address, call_status')
      .in('id', itemIds)
    ;(items || []).forEach(i => { itemMap[i.id] = i })
  }

  if (listIds.length > 0) {
    const { data: lists } = await supabase
      .from('call_lists')
      .select('id, name, client_id, industry')
      .in('id', listIds)
    ;(lists || []).forEach(l => { listMap[l.id] = l })
    const clientIds = [...new Set(Object.values(listMap).map(l => l.client_id).filter(Boolean))]
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds)
      ;(clients || []).forEach(c => { clientMap[c.id] = c })
    }
  }

  // フィルタ2: call_list_items.call_status が再コール系でないものを除外
  // （架電フローで呼び直し済みの場合、memo は未更新でも call_status で検出できる）
  const recallStatuses = new Set(['受付再コール', '社長再コール'])
  const statusFiltered = memoFiltered.filter(r => {
    const item = itemMap[r.item_id]
    if (!item) return true // アイテム情報がなければ除外しない
    return !item.call_status || recallStatuses.has(item.call_status)
  })

  // フィルタ3: 同一 item_id で複数レコードがある場合は最大 round のみ残す
  // （同一企業への再コールが重複して表示されないようにする）
  const latestPerItem = new Map()
  statusFiltered.forEach(r => {
    const existing = latestPerItem.get(r.item_id)
    if (!existing || r.round > existing.round) {
      latestPerItem.set(r.item_id, r)
    }
  })
  const filtered = Array.from(latestPerItem.values())

  const data = filtered.map(r => {
    const list = listMap[r.list_id] || {}
    const client = clientMap[list.client_id] || {}
    return {
      ...r,
      _source: 'supabase',
      _memoObj: (() => { try { return JSON.parse(r.memo || '{}') } catch { return {} } })(),
      _item: itemMap[r.item_id] || {},
      _list_name: list.name || '',
      _list_industry: list.industry || '',
      _client_name: client.name || '',
    }
  })
  return { data, error: null }
}

export async function updateCallRecordMemo(id, memoObj) {
  if (!id) { console.warn('[DB] updateCallRecordMemo: no id'); return null }
  const { error } = await supabase
    .from('call_records')
    .update({ memo: JSON.stringify(memoObj) })
    .eq('id', id)
  if (error) console.error('[DB] updateCallRecordMemo error:', error)
  return error
}

// ============================================================
// Shifts (シフト管理)
// ============================================================

export async function fetchShifts(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number)
  const start = `${yearMonth}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .gte('shift_date', start)
    .lte('shift_date', end)
    .order('shift_date')
  if (error) console.error('[DB] fetchShifts error:', error)
  return { data: data || [], error }
}

export async function insertShift(data) {
  // member_idがnullまたはUUID形式でない場合、名前で照合してidを取得
  let memberId = data.member_id
  if (!memberId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(memberId))) {
    console.warn('[DB] insertShift: member_id invalid, looking up by name:', data.member_name, '(got:', memberId, ')')
    const { data: found, error: lookupErr } = await supabase
      .from('members')
      .select('id')
      .eq('name', data.member_name)
      .limit(1)
    if (lookupErr) console.error('[DB] insertShift: member lookup error:', lookupErr)
    memberId = found?.[0]?.id || null
    if (memberId) console.log('[DB] insertShift: resolved member_id by name:', data.member_name, '->', memberId)
    else console.warn('[DB] insertShift: could not resolve member_id for name:', data.member_name)
  }
  const insertPayload = {
    org_id: ORG_ID,
    member_id: memberId,
    member_name: data.member_name,
    shift_date: data.shift_date,
    start_time: data.start_time,
    end_time: data.end_time,
  }
  console.log('[DB] insertShift payload:', JSON.stringify(insertPayload))
  const { data: result, error } = await supabase
    .from('shifts')
    .insert(insertPayload)
    .select()
    .single()
  if (error) console.error('[DB] insertShift error — code:', error.code, '| message:', error.message, '| details:', error.details, '| hint:', error.hint)
  return { result, error }
}

export async function updateShift(id, data) {
  if (!id) { console.warn('[DB] updateShift: no id'); return null }
  const { error } = await supabase
    .from('shifts')
    .update({ start_time: data.start_time, end_time: data.end_time })
    .eq('id', id)
  if (error) console.error('[DB] updateShift error:', error)
  return error
}

export async function deleteShift(id) {
  if (!id) { console.warn('[DB] deleteShift: no id'); return null }
  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', id)
  if (error) console.error('[DB] deleteShift error:', error)
  return error
}

// ============================================================
// List Export Helpers
// ============================================================

export async function fetchCalledItemCountsByListIds(listIds) {
  if (!listIds?.length) return {}
  const { data, error } = await supabase
    .from('call_list_items')
    .select('list_id')
    .in('list_id', listIds)
    .not('call_status', 'is', null)
  if (error) { console.error('[DB] fetchCalledItemCountsByListIds error:', error); return {} }
  const counts = {}
  listIds.forEach(id => { counts[id] = 0 })
  ;(data || []).forEach(item => { counts[item.list_id] = (counts[item.list_id] || 0) + 1 })
  return counts
}

// セッション期間中に架電されたユニーク件数とリスト総件数をSupabaseから取得
export async function fetchCalledCountForSession(listSupaId, startedAt, finishedAt, startNo, endNo) {
  console.log('[fetchCalledCount] params:', listSupaId, startedAt, finishedAt)
  if (!listSupaId || !startedAt) {
    console.warn('[fetchCalledCount] listSupaIdまたはstartedAtが未設定 — スキップ')
    return { count: 0, total: 0, error: null }
  }
  let calledQuery = supabase
    .from('call_records')
    .select('item_id')
    .eq('list_id', listSupaId)
    .gte('called_at', startedAt)
  if (finishedAt) calledQuery = calledQuery.lte('called_at', finishedAt)

  let totalQuery = supabase
    .from('call_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', listSupaId)
  if (startNo != null && endNo != null) {
    totalQuery = totalQuery.gte('no', startNo).lte('no', endNo)
  }

  const [calledRes, totalRes] = await Promise.all([calledQuery, totalQuery])
  console.log('[fetchCalledCount] calledRes:', calledRes.data, 'totalRes.count:', totalRes.count)
  if (calledRes.error) { console.error('[DB] fetchCalledCountForSession error:', calledRes.error) }
  if (totalRes.error) { console.error('[DB] fetchCalledCountForSession total error:', totalRes.error) }
  const distinct = new Set((calledRes.data || []).map(r => r.item_id))
  console.log('[fetchCalledCount] distinctCount:', distinct.size, 'total:', totalRes.count)
  return { count: distinct.size, total: totalRes.count || 0, error: calledRes.error || null }
}

// ============================================================
// Edge Functions
// ============================================================

export async function fetchZoomUserId(name) {
  if (!name) return null
  const { data } = await supabase
    .from('members')
    .select('zoom_user_id')
    .eq('name', name)
    .limit(1)
  return data?.[0]?.zoom_user_id || null
}

export async function invokeAppoAiReport(payload) {
  const { data, error } = await supabase.functions.invoke('appo-ai-report', {
    body: payload,
  })
  if (error) console.error('[Edge] appo-ai-report error:', error)
  return { data, error }
}

export async function invokeGetZoomRecording(payload) {
  const { data, error } = await supabase.functions.invoke('get-zoom-recording', {
    body: payload,
    headers: { Authorization: 'Bearer ' + import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
  if (error) console.error('[Edge] get-zoom-recording error:', error)
  return { data, error }
}

export async function invokeTranscribeRecording(payload) {
  const { data, error } = await supabase.functions.invoke('transcribe-recording', {
    body: payload,
    headers: { Authorization: 'Bearer ' + import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
  if (error) console.error('[Edge] transcribe-recording error:', error)
  return { data, error }
}

export async function updateCallRecordRecordingUrl(id, recordingUrl) {
  if (!id) { console.warn('[DB] updateCallRecordRecordingUrl: no id'); return null }
  console.log('[DB] updateCallRecordRecordingUrl: id=', id, 'url=', recordingUrl)
  const { data, error } = await supabase
    .from('call_records')
    .update({ recording_url: recordingUrl })
    .eq('id', id)
    .select('id, recording_url')
  console.log('[DB] updateCallRecordRecordingUrl: result=', data, 'error=', error)
  if (error) console.error('[DB] updateCallRecordRecordingUrl error:', error)
  return error
}

export async function fetchCallRecordsByItemId(itemId) {
  const { data, error } = await supabase
    .from('call_records')
    .select('*')
    .eq('item_id', itemId)
    .order('called_at')
  if (error) console.error('[DB] fetchCallRecordsByItemId error:', error)
  return { data: data || [], error }
}

export async function fetchItemsByCallStatus(statuses) {
  if (!statuses?.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('call_list_items')
    .select('id, company, phone, representative, call_status, list_id')
    .in('call_status', statuses)
    .order('call_status')
    .order('company')
  if (error) console.error('[DB] fetchItemsByCallStatus error:', error)
  return { data: data || [], error }
}

export async function fetchAllCallListItemsBasic() {
  const PAGE_SIZE = 1000
  let from = 0
  let allData = []
  while (true) {
    const { data, error } = await supabase
      .from('call_list_items')
      .select('id, list_id, no, company, business, representative, phone, call_status')
      .order('list_id')
      .order('no')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('[DB] fetchAllCallListItemsBasic error:', error)
      return { data: allData.length ? allData : [], error }
    }
    allData = allData.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: allData, error: null }
}

const _STATUS_ID_TO_JP = {
  normal: '不通', excluded: '除外', absent: '社長不在',
  reception_block: '受付ブロック', reception_recall: '受付再コール',
  ceo_recall: '社長再コール', appointment: 'アポ獲得', ceo_decline: '社長お断り',
};

export async function searchCallListItemsServerSide({
  keyword = '', searchField = 'all', statusFilter = 'all', page = 0, pageSize = 50
} = {}) {
  let query = supabase
    .from('call_list_items')
    .select('id, list_id, no, company, business, representative, phone, call_status', { count: 'exact' });

  if (statusFilter === 'uncalled') {
    query = query.is('call_status', null);
  } else if (statusFilter !== 'all') {
    const jp = _STATUS_ID_TO_JP[statusFilter];
    if (jp) query = query.eq('call_status', jp);
  }

  const kw = keyword.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
  if (kw) {
    if (searchField === 'all') {
      query = query.or(
        `company.ilike.%${kw}%,representative.ilike.%${kw}%,phone.ilike.%${kw}%,business.ilike.%${kw}%,call_status.ilike.%${kw}%`
      );
    } else if (searchField === 'status') {
      query = query.ilike('call_status', `%${kw}%`);
    } else {
      query = query.ilike(searchField, `%${kw}%`);
    }
  }

  query = query.order('list_id').order('no').range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, error, count } = await query;
  if (error) console.error('[DB] searchCallListItemsServerSide error:', error);
  return { data: data || [], error, count: count ?? 0 };
}

export async function fetchCallListItemsByIds(itemIds) {
  if (!itemIds?.length) return { data: [], error: null }
  const PAGE_SIZE = 1000
  let from = 0
  let allData = []
  while (true) {
    const { data, error } = await supabase
      .from('call_list_items')
      .select('*')
      .in('id', itemIds)
      .order('list_id')
      .order('no')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('[DB] fetchCallListItemsByIds error:', error)
      return { data: allData.length ? allData : [], error }
    }
    allData = allData.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: allData, error: null }
}

export async function fetchCallRecordsByItemIds(itemIds) {
  if (!itemIds?.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('call_records')
    .select('*')
    .in('item_id', itemIds)
    .order('round')
  if (error) console.error('[DB] fetchCallRecordsByItemIds error:', error)
  return { data: data || [], error }
}

export async function updateCallListCount(supaId, count) {
  if (!supaId) { console.warn('[DB] updateCallListCount: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ total_count: count })
    .eq('id', supaId)
  if (error) console.error('[DB] updateCallListCount error:', error)
  return error
}

export async function fetchListIdsByItemCriteria({ prefecture, revenueMin, revenueMax, netIncomeMin, netIncomeMax, callStatus, callCountMin, callCountMax } = {}) {
  let query = supabase.from('call_list_items').select('list_id')
  if (prefecture) query = query.ilike('address', '%' + prefecture + '%')
  if (revenueMin != null && revenueMin !== '') query = query.gte('revenue', revenueMin)
  if (revenueMax != null && revenueMax !== '') query = query.lte('revenue', revenueMax)
  if (netIncomeMin != null && netIncomeMin !== '') query = query.gte('net_income', netIncomeMin)
  if (netIncomeMax != null && netIncomeMax !== '') query = query.lte('net_income', netIncomeMax)
  if (callStatus) query = Array.isArray(callStatus) ? query.in('call_status', callStatus) : query.eq('call_status', callStatus)
  const { data, error } = await query
  if (error) { console.error('[DB] fetchListIdsByItemCriteria error:', error); return null }
  return [...new Set((data || []).map(r => r.list_id))]
}

export async function fetchCallRecordsForRanking(fromISO, toISO) {
  const { data, error } = await supabase
    .from('call_records')
    .select('id, getter_name, status, called_at')
    .gte('called_at', fromISO)
    .lte('called_at', toISO)
  if (error) console.error('[DB] fetchCallRecordsForRanking error:', error)
  return { data: data || [], error }
}

export async function fetchMyCallRecords(userName) {
  if (!userName) return { data: [], error: null }
  const PAGE_SIZE = 1000
  let from = 0
  let allData = []
  while (true) {
    const { data, error } = await supabase
      .from('call_records')
      .select('id, status, called_at')
      .eq('getter_name', userName)
      .order('called_at')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('[DB] fetchMyCallRecords error:', error)
      return { data: allData.length ? allData : [], error }
    }
    allData = allData.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: allData, error: null }
}

export async function insertCallSession(data) {
  const { data: row, error } = await supabase
    .from('call_sessions')
    .insert([data])
    .select()
    .single()
  if (error) console.error('[DB] insertCallSession error:', error)
  return { data: row, error }
}

export async function updateCallSession(id, updates) {
  const { error } = await supabase
    .from('call_sessions')
    .update(updates)
    .eq('id', id)
  if (error) console.error('[DB] updateCallSession error:', error)
  return { error }
}

export async function deleteCallSessionsByIds(ids) {
  if (!ids?.length) return { error: null }
  const { error } = await supabase
    .from('call_sessions')
    .delete()
    .in('id', ids)
  if (error) console.error('[DB] deleteCallSessionsByIds error:', error)
  return { error }
}

export async function fetchCallSessions(sinceISO) {
  const { data, error } = await supabase
    .from('call_sessions')
    .select('*')
    .gte('started_at', sinceISO)
    .is('finished_at', null)
    .order('started_at', { ascending: false })
  if (error) console.error('[DB] fetchCallSessions error:', error)
  return { data: data || [], error }
}

// 複数リストの最終架電セッション日時を一括取得 → { [supaId]: latestStartedAt }
// .in()によるURL長超過を避けるため、全セッションを取得してJS側でフィルタリング
export async function fetchLatestSessionPerList(supaIds) {
  if (!supaIds?.length) return { data: {}, error: null }
  const idSet = new Set(supaIds)
  const { data, error } = await supabase
    .from('call_sessions')
    .select('list_id, started_at')
    .order('started_at', { ascending: false })
  if (error) {
    console.error('[DB] fetchLatestSessionPerList error:', error)
    return { data: {}, error }
  }
  const map = {}
  ;(data || []).forEach(row => {
    if (idSet.has(row.list_id) && !map[row.list_id]) {
      map[row.list_id] = row.started_at
    }
  })
  return { data: map, error: null }
}

export async function fetchRecentDuplicateSession(listId, startNo, endNo) {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
  let query = supabase
    .from('call_sessions')
    .select('id')
    .eq('list_id', listId)
    .gte('started_at', oneMinuteAgo)
    .order('started_at', { ascending: false })
    .limit(1)
  if (startNo != null) query = query.eq('start_no', startNo)
  if (endNo != null) query = query.eq('end_no', endNo)
  const { data, error } = await query
  if (error) console.error('[DB] fetchRecentDuplicateSession error:', error)
  return { data: data?.[0] || null, error }
}

// ============================================================
// Profile Image (Supabase Storage)
// ============================================================
const PROFILE_BUCKET = 'profile-images'

export function getProfileImageUrl(userId) {
  if (!userId) return null
  const { data } = supabase.storage
    .from(PROFILE_BUCKET)
    .getPublicUrl(`${ORG_ID}/${userId}`)
  return data.publicUrl
}

export async function uploadProfileImage(userId, file) {
  if (!userId || !file) return { url: null, error: new Error('invalid args') }
  const path = `${ORG_ID}/${userId}`
  console.log('[Storage] uploadProfileImage — bucket:', PROFILE_BUCKET, '/ path:', path, '/ fileName:', file.name, '/ fileSize:', file.size, 'bytes / contentType:', file.type)

  // まず upload を試みる。409（既存ファイル）なら update にフォールバック
  let finalError = null
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_BUCKET)
    .upload(path, file, { contentType: file.type })

  if (uploadError) {
    const is409 = uploadError.statusCode === '409' || uploadError.statusCode === 409
                  || uploadError.message?.toLowerCase().includes('already exists')
    if (is409) {
      console.log('[Storage] 既存ファイルを検出 — update にフォールバック')
      const { error: updateError } = await supabase.storage
        .from(PROFILE_BUCKET)
        .update(path, file, { contentType: file.type })
      finalError = updateError ?? null
    } else {
      finalError = uploadError
    }
  }

  if (finalError) {
    console.error('[Storage] uploadProfileImage error — message:', finalError.message, '/ statusCode:', finalError.statusCode, '/ details:', finalError)
    return { url: null, error: finalError }
  }

  const { data } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(path)
  console.log('[Storage] uploadProfileImage 成功 — publicUrl:', data.publicUrl)
  return { url: data.publicUrl + '?t=' + Date.now(), error: null }
}

// ============================================================
// Settings (全体共通設定)
// ============================================================

export async function fetchSetting(key) {
  console.log('[DB] fetchSetting 開始 — key:', key)
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) console.error('[DB] fetchSetting error:', error)
  else console.log('[DB] fetchSetting 完了 — key:', key, '/ value:', data?.value ?? null)
  return { value: data?.value ?? null, error }
}

export async function saveSetting(key, value) {
  console.log('[DB] saveSetting 開始 — key:', key, '/ value length:', value?.length ?? 0)
  const { data, error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select()
  if (error) console.error('[DB] saveSetting error — message:', error.message, '/ code:', error.code, '/ details:', error)
  else console.log('[DB] saveSetting 完了 — upsert result:', data)
  return error
}

// ============================================================
// Roleplay Bookings (ロープレ予約)
// ============================================================

export async function fetchRoleplayBookings(userId) {
  if (!userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('roleplay_bookings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) console.error('[DB] fetchRoleplayBookings error:', error)
  return { data: (data || []).map(r => ({
    id: r.gcal_event_id,
    title: r.user_name ? `ロープレ - ${r.user_name}` : 'ロープレ',
    startISO: r.start_iso,
    endISO: r.end_iso,
    dayLabel: r.day_label,
    startLabel: r.start_label,
    endLabel: r.end_label,
    attendeeEmail: r.attendee_email,
  })), error }
}

export async function insertRoleplayBooking(userId, booking) {
  if (!userId) return null
  const { error } = await supabase
    .from('roleplay_bookings')
    .insert({
      gcal_event_id: booking.id,
      user_id: userId,
      user_name: booking.title?.replace('ロープレ - ', '') || '',
      start_iso: booking.startISO,
      end_iso: booking.endISO,
      day_label: booking.dayLabel,
      start_label: booking.startLabel,
      end_label: booking.endLabel,
      attendee_email: booking.attendeeEmail || null,
    })
  if (error) console.error('[DB] insertRoleplayBooking error:', error)
  return error
}

export async function deleteRoleplayBooking(gcalEventId, userId) {
  if (!gcalEventId || !userId) return null
  const { error } = await supabase
    .from('roleplay_bookings')
    .delete()
    .eq('gcal_event_id', gcalEventId)
    .eq('user_id', userId)
  if (error) console.error('[DB] deleteRoleplayBooking error:', error)
  return error
}
