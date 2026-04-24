import { supabase } from '../lib/supabase'
import { getOrgId } from './orgContext'
import { statusIdToLabel } from '../hooks/useCallStatuses'

// ============================================================
// Drive CORS Proxy
// ============================================================

/**
 * Google Drive ファイルをCORSプロキシ経由でダウンロードして File オブジェクトを返す
 * @param {string} driveId - Google Drive ファイルID
 * @param {(msg: string) => void} [onProgress] - 進捗コールバック
 * @returns {Promise<File>}
 */
export async function downloadDriveFileViaProxy(driveId, onProgress) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  onProgress?.('📥 動画をダウンロード中...')

  const res = await fetch(
    `${supabaseUrl}/functions/v1/proxy-drive-download?id=${driveId}`,
    {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
    },
  )

  if (!res.ok) {
    let msg = `ダウンロード失敗: ${res.status}`
    try { const b = await res.json(); msg = b.error || msg } catch { /* noop */ }
    throw new Error(msg)
  }

  const cd = res.headers.get('content-disposition') || ''
  const cdMatch = cd.match(/filename="?([^";\\s]+)"?/)
  const filename = cdMatch ? cdMatch[1] : 'recording.mp4'
  const contentType = res.headers.get('content-type') || 'video/mp4'

  onProgress?.('📦 データを処理中...')
  const blob = await res.blob()
  return new File([blob], filename, { type: contentType })
}

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
      rebuttal_data: data.rebuttalData,
      notes: data.notes,
      list_type: data.type,
      contact_ids: data.contactIds ?? undefined,
      contact_id: (data.contactIds && data.contactIds.length > 0) ? data.contactIds[0] : (data.contactId ?? undefined),
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
      org_id: getOrgId(),
      client_id: clientId,
      name: `${data.company} - ${data.industry}`,
      industry: data.industry,
      status: data.status || '架電可能',
      total_count: parseInt(data.count) || 0,
      manager_name: data.manager,
      company_info: data.companyInfo,
      script_body: data.scriptBody,
      cautions: data.cautions,
      rebuttal_data: data.rebuttalData,
      notes: data.notes,
      list_type: data.type,
      script_name: data.script,
      contact_ids: data.contactIds || [],
      contact_id: (data.contactIds && data.contactIds.length > 0) ? data.contactIds[0] : (data.contactId || null),
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
      org_id: getOrgId(),
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
      google_calendar_id: data.googleCalendarId || null,
      client_email: data.clientEmail || null,
      scheduling_url: data.schedulingUrl || null,
      slack_webhook_url: data.slackWebhookUrl || null,
      slack_webhook_url_internal: data.slackWebhookUrlInternal || null,
      chatwork_room_id: data.chatworkRoomId || null,
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
      google_calendar_id: data.googleCalendarId ?? undefined,
      client_email: data.clientEmail ?? undefined,
      scheduling_url: data.schedulingUrl ?? undefined,
      slack_webhook_url: data.slackWebhookUrl ?? undefined,
      slack_webhook_url_internal: data.slackWebhookUrlInternal ?? undefined,
      chatwork_room_id: data.chatworkRoomId ?? undefined,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateClient error:', error)
  return error
}

export async function updateClientCalendarId(supaId, googleCalendarId) {
  if (!supaId) { console.warn('[DB] updateClientCalendarId: no supaId'); return null }
  const { error } = await supabase
    .from('clients')
    .update({ google_calendar_id: googleCalendarId || null })
    .eq('id', supaId)
  if (error) console.error('[DB] updateClientCalendarId error:', error)
  return error
}

export async function updateClientSchedulingUrl(supaId, schedulingUrl) {
  if (!supaId) { console.warn('[DB] updateClientSchedulingUrl: no supaId'); return null }
  const { error } = await supabase
    .from('clients')
    .update({ scheduling_url: schedulingUrl || null })
    .eq('id', supaId)
  if (error) console.error('[DB] updateClientSchedulingUrl error:', error)
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
      notes: data.note || null,
      appo_report: data.appoReport ?? undefined,
      recording_url: data.recording_url ?? undefined,
      report_style: data.reportStyle ?? undefined,
      report_supplement: data.reportSupplement ?? undefined,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateAppointment error:', error)
  return error
}

// 録音→Whisper→Claude で通話レポートを自動生成
export async function invokeGenerateCallReport(payload) {
  const { data, error } = await supabase.functions.invoke('generate-call-report', { body: payload })
  if (error) console.error('[Edge] generate-call-report error:', error)
  return { data, error }
}

// 架電レコードのレポート(スタイル/補足)を更新
export async function updateCallRecordReport(id, { style, supplement }) {
  if (!id) return { error: new Error('no id') }
  const { data, error } = await supabase
    .from('call_records')
    .update({ report_style: style ?? null, report_supplement: supplement ?? null })
    .eq('id', id)
    .select('id, report_style, report_supplement')
  if (error) {
    console.error('[DB] updateCallRecordReport error:', error)
    return { error }
  }
  if (!data || data.length === 0) {
    console.error('[DB] updateCallRecordReport: 0 rows updated (RLS or id mismatch)', { id })
    return { error: new Error('保存できませんでした (RLS拒否または対象なし)') }
  }
  return { data, error: null }
}

// レポートのスタイル(Smooth/Slack/説得)と補足のみを更新
export async function updateAppointmentReport(supaId, { style, supplement }) {
  if (!supaId) return { error: new Error('no supaId') }
  const { error } = await supabase
    .from('appointments')
    .update({ report_style: style ?? null, report_supplement: supplement ?? null })
    .eq('id', supaId)
  if (error) console.error('[DB] updateAppointmentReport error:', error)
  return { error }
}

// 担当者・ステータス・期間で録音ありの架電レコードを取得（searchページ録音一覧用）
// 戻り値: [{ id, status, called_at, recording_url, getter_name, item_id, list_id, round, company_name, appointment_id?, report_style?, report_supplement?, appo_report? }]
export async function fetchCallRecordsWithRecordings({
  getter = null,
  status = null,
  dateFrom = null,
  dateTo = null,
  sortDir = 'desc',
  limit = 500,
} = {}) {
  let q = supabase
    .from('call_records')
    .select('id, status, called_at, recording_url, getter_name, item_id, list_id, round, report_style, report_supplement, memo, call_list_items!inner(company)')
    .eq('org_id', getOrgId())
    .not('recording_url', 'is', null)
    .neq('recording_url', '')
    .order('called_at', { ascending: sortDir === 'asc', nullsFirst: false })
    .limit(limit)
  if (getter) q = q.eq('getter_name', getter)
  if (status) q = q.eq('status', status)
  if (dateFrom) q = q.gte('called_at', `${dateFrom}T00:00:00`)
  if (dateTo)   q = q.lte('called_at', `${dateTo}T23:59:59`)
  const { data, error } = await q
  if (error) {
    console.error('[DB] fetchCallRecordsWithRecordings error:', error)
    return { data: [], error }
  }
  const rows = (data || []).map(r => ({
    id: r.id,
    status: r.status,
    called_at: r.called_at,
    recording_url: r.recording_url,
    getter_name: r.getter_name,
    item_id: r.item_id,
    list_id: r.list_id,
    round: r.round,
    report_style: r.report_style,
    report_supplement: r.report_supplement,
    memo: r.memo,
    company_name: r.call_list_items?.company || '—',
  }))

  // アポ獲得の record にひもづく appointment（report_style/supplement 用）を取得
  const appoItemIds = [...new Set(rows.filter(r => r.status === 'アポ獲得').map(r => r.item_id))]
  if (appoItemIds.length > 0) {
    const { data: appos } = await supabase
      .from('appointments')
      .select('id, item_id, report_style, report_supplement, appo_report, status, getter_name, company_name')
      .eq('org_id', getOrgId())
      .in('item_id', appoItemIds)
    const appoMap = {}
    ;(appos || []).forEach(a => { if (!appoMap[a.item_id]) appoMap[a.item_id] = a })
    rows.forEach(r => {
      if (r.status === 'アポ獲得' && appoMap[r.item_id]) {
        const a = appoMap[r.item_id]
        r.appointment_id = a.id
        r.appo_report = a.appo_report
        // call_records 側に値が無い場合のみ appointments 側で補完
        if (!r.report_style)      r.report_style      = a.report_style
        if (!r.report_supplement) r.report_supplement = a.report_supplement
      }
    })
  }
  return { data: rows, error: null }
}

// ============================================================
// Recording Bookmarks (録音ブックマーク)
// ============================================================

export async function fetchRecordingBookmarks(userName) {
  if (!userName) return { data: [], error: null }
  const { data, error } = await supabase
    .from('recording_bookmarks')
    .select('*')
    .eq('user_name', userName)
    .order('created_at', { ascending: false })
  if (error) console.error('[DB] fetchRecordingBookmarks error:', error)
  return { data: data || [], error }
}

export async function insertRecordingBookmark({ userName, appointmentId = null, callRecordId = null, recordingUrl, companyName, getterName, note }) {
  const { data, error } = await supabase
    .from('recording_bookmarks')
    .insert({
      org_id: getOrgId(),
      user_name: userName,
      appointment_id: appointmentId,
      call_record_id: callRecordId,
      recording_url: recordingUrl,
      company_name: companyName,
      getter_name: getterName,
      note: note || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertRecordingBookmark error:', error)
  return { data, error }
}

export async function deleteRecordingBookmark(id) {
  const { error } = await supabase.from('recording_bookmarks').delete().eq('id', id)
  if (error) console.error('[DB] deleteRecordingBookmark error:', error)
  return { error }
}

export async function insertAppointment(data) {
  // list_idがあればcall_listsからclient_idを取得（クライアント名変更に強い）
  let clientId = null
  if (data.list_id) {
    const { data: listRow } = await supabase
      .from('call_lists')
      .select('client_id')
      .eq('id', data.list_id)
      .single()
    clientId = listRow?.client_id || null
  }
  // list_idからclient_idが取得できなかった場合はクライアント名でフォールバック
  if (!clientId && data.client) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id')
      .eq('name', data.client)
      .limit(1)
    clientId = clients?.[0]?.id || null
  }

  const appoMonth = data.meetDate ? (parseInt(data.meetDate.slice(5, 7), 10) + '月') : ''

  const { data: result, error } = await supabase
    .from('appointments')
    .insert({
      org_id: getOrgId(),
      client_id: clientId,
      company_name: data.company,
      status: data.status || 'アポ取得',
      getter_name: data.getter,
      appointment_date: data.getDate || null,
      meeting_date: data.meetDate || null,
      sales_amount: parseInt(data.sales) || 0,
      intern_reward: parseInt(data.reward) || 0,
      notes: data.note || null,
      appo_report: data.appoReport || null,
      appo_month: appoMonth,
      email_status: data.emailStatus || 'pending',
      list_id: data.list_id || null,
      item_id: data.item_id || null,
      phone: data.phone || null,
      recording_url: data.recording_url || null,
      report_style: data.reportStyle || null,
      report_supplement: data.reportSupplement || null,
      meeting_time: data.meetTime || null,
      meeting_location: data.meetLocation || null,
      is_online: data.isOnline || false,
      gcal_event_id: data.gcalEventId || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertAppointment error:', error)

  // Fire push notification for new appointment (best-effort, don't block)
  if (result && !error) {
    sendAppointmentPushNotification(data, getOrgId()).catch(e =>
      console.warn('[Push] Failed to send appointment notification:', e)
    )
  }

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

export async function updateEmailStatus(supaId, emailStatus, extra = {}) {
  if (!supaId) { console.warn('[DB] updateEmailStatus: no supaId'); return null }
  const updates = { email_status: emailStatus, ...extra }
  if (emailStatus === 'approved') updates.email_approved_at = new Date().toISOString()
  if (emailStatus === 'sent') updates.email_sent_at = new Date().toISOString()
  const { error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', supaId)
  if (error) console.error('[DB] updateEmailStatus error:', error)
  return error
}

export async function invokeSendEmail({ to, subject, body, cc, bcc, attachments }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({ to, subject, body, cc, bcc, attachments }),
  })
  const data = await res.json()
  if (!res.ok) return { data: null, error: data.error || `送信失敗: ${res.status}` }
  return { data, error: null }
}

export async function invokeSendAppoReport({ channel, text, webhook_url, room_id }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(`${supabaseUrl}/functions/v1/send-appo-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({ channel, text, webhook_url, room_id }),
  })
  const data = await res.json()
  if (!res.ok) return { data: null, error: data.error || `送信失敗: ${res.status}` }
  return { data, error: null }
}

// ── クライアント担当者 CRUD ──────────────────────────────────
export async function insertClientContact(clientId, { name, email, slackMemberId, googleCalendarId, schedulingUrl, schedulingUrl2, schedulingLabel, schedulingLabel2, schedulingNotes }) {
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('client_contacts')
    .insert({ org_id: orgId, client_id: clientId, name, email, slack_member_id: slackMemberId || null, google_calendar_id: googleCalendarId || null, scheduling_url: schedulingUrl || null, scheduling_url_2: schedulingUrl2 || null, scheduling_label: schedulingLabel || null, scheduling_label_2: schedulingLabel2 || null, scheduling_notes: schedulingNotes || null })
    .select()
    .single()
  if (error) console.error('[DB] insertClientContact error:', error)
  return { data, error }
}

export async function updateClientContact(id, { name, email, slackMemberId, googleCalendarId, schedulingUrl, schedulingUrl2, schedulingLabel, schedulingLabel2, schedulingNotes }) {
  const { error } = await supabase
    .from('client_contacts')
    .update({ name, email, slack_member_id: slackMemberId ?? undefined, google_calendar_id: googleCalendarId ?? undefined, scheduling_url: schedulingUrl ?? undefined, scheduling_url_2: schedulingUrl2 ?? undefined, scheduling_label: schedulingLabel ?? undefined, scheduling_label_2: schedulingLabel2 ?? undefined, scheduling_notes: schedulingNotes ?? undefined })
    .eq('id', id)
  if (error) console.error('[DB] updateClientContact error:', error)
  return error
}

export async function updateContactCalendarId(contactId, googleCalendarId) {
  if (!contactId) return null
  const { error } = await supabase
    .from('client_contacts')
    .update({ google_calendar_id: googleCalendarId || null })
    .eq('id', contactId)
  if (error) console.error('[DB] updateContactCalendarId error:', error)
  return error
}

export async function updateContactSchedulingUrl(contactId, schedulingUrl) {
  if (!contactId) return null
  const { error } = await supabase
    .from('client_contacts')
    .update({ scheduling_url: schedulingUrl || null })
    .eq('id', contactId)
  if (error) console.error('[DB] updateContactSchedulingUrl error:', error)
  return error
}

export async function deleteClientContact(id) {
  const { error } = await supabase
    .from('client_contacts')
    .delete()
    .eq('id', id)
  if (error) console.error('[DB] deleteClientContact error:', error)
  return error
}

// ============================================================
// Call List Items (架電先企業)
// ============================================================

export async function fetchCallListItems(listId, opts = {}) {
  const { startNo = null, endNo = null } = opts
  const PAGE_SIZE = 1000
  let from = 0
  let allData = []
  while (true) {
    let q = supabase
      .from('call_list_items')
      .select('*')
      .eq('list_id', listId)
    if (startNo != null) q = q.gte('no', startNo)
    if (endNo != null) q = q.lte('no', endNo)
    const { data, error } = await q
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

// listId+no → call_list_items.id を1件だけ引く（オンデマンド lookup）。
// (list_id, no) のユニークインデックスがあるので 1ms 級。
// listId 単位で Map にキャッシュするので同一企業を2回触っても2回目以降はネットワーク無し。
const _itemIdCache = new Map() // listId -> Map<no, id>
export async function getCallListItemId(listId, no) {
  if (!listId || no == null) return null
  let inner = _itemIdCache.get(listId)
  if (!inner) { inner = new Map(); _itemIdCache.set(listId, inner) }
  if (inner.has(no)) return inner.get(no)
  const { data, error } = await supabase
    .from('call_list_items')
    .select('id')
    .eq('list_id', listId)
    .eq('no', no)
    .maybeSingle()
  if (error) { console.error('[DB] getCallListItemId error:', error); return null }
  const id = data?.id || null
  inner.set(no, id)
  return id
}
export function clearCallListItemIdCache(listId) {
  if (listId) _itemIdCache.delete(listId)
  else _itemIdCache.clear()
}

// 軽量版: { no -> id } マップ生成専用。select('*') と違い数万件でも数十KB・1〜数往復で済む。
// CallingScreen 遷移時のラグ対策。全カラムが必要な場合は fetchCallListItems を使うこと。
export async function fetchCallListItemIdMap(listId) {
  const PAGE_SIZE = 10000
  let from = 0
  const map = {}
  while (true) {
    const { data, error } = await supabase
      .from('call_list_items')
      .select('id, no')
      .eq('list_id', listId)
      .order('no')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('[DB] fetchCallListItemIdMap error:', error)
      return { data: map, error }
    }
    if (data) for (const row of data) map[row.no] = row.id
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: map, error: null }
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
      org_id: getOrgId(),
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
      zoom_phone_number: data.zoomPhoneNumber ?? null,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateMember error:', error)
  return error
}

export async function insertMember(data) {
  const { data: result, error } = await supabase
    .from('members')
    .insert({
      org_id: getOrgId(),
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

// 単一企業ロード（fast-path 用）。AppoListView 等から特定企業の架電ページを開く時に
// 全件 fetchCallListItems を待たずに対象1件だけ即取得して描画するために使う。
export async function fetchCallListItemById(itemId) {
  if (!itemId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('call_list_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()
  if (error) console.error('[DB] fetchCallListItemById error:', error)
  return { data, error }
}

// 単一企業の架電履歴のみ取得（fast-path 用）。
export async function fetchCallRecordsByItem(itemId) {
  if (!itemId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('call_records')
    .select('*')
    .eq('item_id', itemId)
    .order('round')
  if (error) console.error('[DB] fetchCallRecordsByItem error:', error)
  return { data: data || [], error }
}

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
      org_id: getOrgId(),
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
  // appointments.item_id の外部キー参照を解除してから削除
  const { error: unlinkErr } = await supabase
    .from('appointments')
    .update({ item_id: null })
    .eq('list_id', listId)
  if (unlinkErr) { console.error('[DB] unlinkAppointmentItems error:', unlinkErr); return unlinkErr }
  const { error } = await supabase
    .from('call_list_items')
    .delete()
    .eq('list_id', listId)
  if (error) console.error('[DB] deleteCallListItemsByListId error:', error)
  return error
}

export async function fetchAllRecallRecords() {
  // .limit(10000) は PostgREST max_rows (1000) で頭打ち → range で全件ページ取得
  const PAGE = 1000
  const records = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .in('status', ['受付再コール', '社長再コール'])
      .order('called_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) { console.error('[DB] fetchAllRecallRecords error:', error); return { data: records, error } }
    records.push(...(data || []))
    if ((data || []).length < PAGE) break
    from += PAGE
  }

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
    // .in() は URL 長制限があるため 200 件ずつバッチ取得
    const CHUNK = 200
    for (let i = 0; i < itemIds.length; i += CHUNK) {
      const chunk = itemIds.slice(i, i + CHUNK)
      const { data: items, error: itemsErr } = await supabase
        .from('call_list_items')
        .select('id, company, phone, representative, address, call_status')
        .in('id', chunk)
      if (itemsErr) { console.error('[DB] fetchAllRecallRecords items chunk error:', itemsErr); continue }
      ;(items || []).forEach(i => { itemMap[i.id] = i })
    }
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

  // フィルタ2（削除済み）: 以前は call_list_items.call_status で除外していたが、
  // 同企業への後続架電で call_status が変わると未完了の再コールまで消えるバグがあった。
  // 代わりに handleResult / handleAppoSave で再コール自動完了（completeRecallsForItem）を呼ぶ。

  // フィルタ3: 同一 item_id で複数レコードがある場合は最大 round のみ残す
  // （同一企業への再コールが重複して表示されないようにする）
  const latestPerItem = new Map()
  memoFiltered.forEach(r => {
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

/**
 * 指定 item_id の未完了再コールレコードを全て完了にする
 * （架電フローで再コール以外の結果が出た時にバックグラウンドで呼ぶ）
 */
export async function completeRecallsForItem(itemId) {
  if (!itemId) return
  const { data: records } = await supabase
    .from('call_records')
    .select('id, memo')
    .eq('item_id', itemId)
    .in('status', ['受付再コール', '社長再コール'])
  if (!records?.length) return
  for (const r of records) {
    try {
      const memoObj = JSON.parse(r.memo || '{}')
      if (memoObj.recall_completed === true) continue
      memoObj.recall_completed = true
      await supabase.from('call_records').update({ memo: JSON.stringify(memoObj) }).eq('id', r.id)
    } catch (e) { console.warn('[DB] completeRecallsForItem error:', e) }
  }
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
    if (!memberId) console.warn('[DB] insertShift: could not resolve member_id for name:', data.member_name)
  }
  const insertPayload = {
    org_id: getOrgId(),
    member_id: memberId,
    member_name: data.member_name,
    shift_date: data.shift_date,
    start_time: data.start_time,
    end_time: data.end_time,
  }
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
  const counts = {}
  listIds.forEach(id => { counts[id] = 0 })
  // リストごとにcountクエリを発行（Supabaseのデフォルト1000件制限を回避）
  await Promise.all(listIds.map(async (listId) => {
    const { count, error } = await supabase
      .from('call_list_items')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', listId)
      .not('call_status', 'is', null)
    if (error) { console.error('[DB] fetchCalledItemCountsByListIds error:', error); return }
    counts[listId] = count || 0
  }))
  return counts
}

// セッション期間中に架電されたユニーク件数とリスト総件数をSupabaseから取得
export async function fetchCalledCountForSession(listSupaId, startedAt, finishedAt, startNo, endNo) {
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
  if (calledRes.error) { console.error('[DB] fetchCalledCountForSession error:', calledRes.error) }
  if (totalRes.error) { console.error('[DB] fetchCalledCountForSession total error:', totalRes.error) }
  const distinct = new Set((calledRes.data || []).map(r => r.item_id))
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

export async function invokeGenerateCompanyInfo({ itemId, company, representative }) {
  const { data, error } = await supabase.functions.invoke('generate-company-info', {
    body: { item_id: itemId, company, representative },
  })
  if (error) console.error('[Edge] generate-company-info error:', error)
  return { data, error }
}

export async function invokeAppoAiReport(payload) {
  const { data, error } = await supabase.functions.invoke('appo-ai-report', {
    body: payload,
  })
  if (error) console.error('[Edge] appo-ai-report error:', error)
  return { data, error }
}

export async function invokeSyncZoomUsers() {
  const { data, error } = await supabase.functions.invoke('sync-zoom-users', {
    body: {},
    headers: { Authorization: 'Bearer ' + import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
  if (error) console.error('[Edge] sync-zoom-users error:', error)
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
  const { data, error } = await supabase
    .from('call_records')
    .update({ recording_url: recordingUrl })
    .eq('id', id)
    .select('id, recording_url')
  if (error) console.error('[DB] updateCallRecordRecordingUrl error:', error)
  return error
}

// アポイントのappo_report内の録音URLを更新
export async function updateAppoReportRecordingUrl(appoId, newUrl) {
  if (!appoId || !newUrl) return null
  const { data, error: fetchErr } = await supabase
    .from('appointments')
    .select('appo_report')
    .eq('id', appoId)
    .single()
  if (fetchErr || !data?.appo_report) return fetchErr
  // 既存の録音URL行を新URLに置換、なければ末尾に追加
  let report = data.appo_report
  const urlPattern = /・録音URL：.*/
  if (urlPattern.test(report)) {
    report = report.replace(urlPattern, `・録音URL：${newUrl}`)
  } else {
    report = report.replace(/・アポ取得者→/, `・録音URL：${newUrl}\n　・アポ取得者→`)
  }
  const { error } = await supabase
    .from('appointments')
    .update({ appo_report: report })
    .eq('id', appoId)
  if (error) console.error('[DB] updateAppoReportRecordingUrl error:', error)
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

export async function searchCallListItemsServerSide({
  keyword = '', searchField = 'all', statusFilter = 'all', page = 0, pageSize = 50
} = {}) {
  let query = supabase
    .from('call_list_items')
    .select('id, list_id, no, company, business, representative, phone, call_status', { count: 'exact' });

  if (statusFilter === 'uncalled') {
    query = query.is('call_status', null);
  } else if (statusFilter !== 'all') {
    const jp = statusIdToLabel(statusFilter);
    if (jp) query = query.eq('call_status', jp);
  }

  // ilike のワイルドカードは % （.or() 内でも .ilike() 直接呼び出しでも同じ）
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
  // in() 自体の URL 長対策 + PostgREST max_rows (1000) 回避
  const IN_CHUNK = 200
  const PAGE = 1000
  const all = []
  for (let i = 0; i < itemIds.length; i += IN_CHUNK) {
    const idsChunk = itemIds.slice(i, i + IN_CHUNK)
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('call_records')
        .select('*')
        .in('item_id', idsChunk)
        .order('round')
        .range(from, from + PAGE - 1)
      if (error) {
        console.error('[DB] fetchCallRecordsByItemIds error:', error)
        return { data: all, error }
      }
      all.push(...(data || []))
      if ((data || []).length < PAGE) break
      from += PAGE
    }
  }
  return { data: all, error: null }
}

export async function updateCallListScript(supaId, scriptBody) {
  if (!supaId) { console.warn('[DB] updateCallListScript: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ script_body: scriptBody })
    .eq('id', supaId)
  if (error) console.error('[DB] updateCallListScript error:', error)
  return error
}

export async function updateCallListRebuttal(supaId, rebuttalData) {
  if (!supaId) { console.warn('[DB] updateCallListRebuttal: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ rebuttal_data: rebuttalData })
    .eq('id', supaId)
  if (error) console.error('[DB] updateCallListRebuttal error:', error)
  return error
}

// ============================================================
// Script PDFs (クライアント別スクリプト添付PDF)
// ============================================================
const SCRIPT_PDF_BUCKET = 'script-pdfs'

export async function uploadScriptPdf(listId, file) {
  if (!listId || !file) return { item: null, error: new Error('invalid args') }
  const orgId = getOrgId()
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${orgId}/${listId}/${Date.now()}_${safeName}`
  const { error: upErr } = await supabase.storage
    .from(SCRIPT_PDF_BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (upErr) {
    console.error('[DB] uploadScriptPdf error:', upErr)
    return { item: null, error: upErr }
  }
  const item = {
    path,
    name: file.name,
    size: file.size,
    uploaded_at: new Date().toISOString(),
  }
  return { item, error: null }
}

export async function deleteScriptPdfObject(path) {
  if (!path) return null
  const { error } = await supabase.storage.from(SCRIPT_PDF_BUCKET).remove([path])
  if (error) console.error('[DB] deleteScriptPdfObject error:', error)
  return error
}

export async function updateCallListScriptPdfs(supaId, pdfs) {
  if (!supaId) { console.warn('[DB] updateCallListScriptPdfs: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ script_pdfs: pdfs })
    .eq('id', supaId)
  if (error) console.error('[DB] updateCallListScriptPdfs error:', error)
  return error
}

export async function getScriptPdfSignedUrl(path, expiresIn = 600) {
  if (!path) return { url: null, error: new Error('no path') }
  const { data, error } = await supabase.storage
    .from(SCRIPT_PDF_BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error) console.error('[DB] getScriptPdfSignedUrl error:', error)
  return { url: data?.signedUrl || null, error }
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
    .rpc('get_call_ranking', { from_iso: fromISO, to_iso: toISO });
  if (error) console.error('[DB] fetchCallRecordsForRanking error:', error);
  return { data: data || [], error };
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
    .insert([{ ...data, org_id: data.org_id || getOrgId() }])
    .select()
    .single()
  if (error) {
    // 23505 = unique_violation: open session already exists for this (caller, list, range)
    // This happens on rapid reloads when closeOpenCallSessionsForList hasn't propagated yet — skip silently
    if (error.code === '23505') {
      console.warn('[DB] insertCallSession: duplicate open session skipped', data.caller_name, data.list_supa_id)
      return { data: null, error: null }
    }
    console.error('[DB] insertCallSession error:', error)
  }
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

// 同一リスト・同一担当者の未完了セッションを閉じる（リロード・再開時の残留セッション対策）
export async function closeOpenCallSessionsForList(listSupaId, callerName) {
  if (!listSupaId || !callerName) return { error: null }
  const { error } = await supabase
    .from('call_sessions')
    .update({ finished_at: new Date().toISOString() })
    .eq('list_supa_id', listSupaId)
    .eq('caller_name', callerName)
    .is('finished_at', null)
  if (error) console.error('[DB] closeOpenCallSessionsForList error:', error)
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

// ── 報酬確定スナップショット ─────────────────────────────────────────
// 特定メンバーの全確定月スナップショットを取得
export async function fetchMemberPayrollHistory(memberName) {
  const { data, error } = await supabase
    .from('payroll_snapshots')
    .select('pay_month, total_payout, incentive_amt, team_bonus, referral_bonus')
    .eq('org_id', getOrgId())
    .eq('member_name', memberName)
    .order('pay_month', { ascending: false })
  if (error) console.error('[DB] fetchMemberPayrollHistory error:', error)
  return { data: data || [], error }
}

export async function fetchPayrollSnapshots(payMonth) {
  const { data, error } = await supabase
    .from('payroll_snapshots')
    .select('*')
    .eq('org_id', getOrgId())
    .eq('pay_month', payMonth)
    .order('total_payout', { ascending: false })
  if (error) console.error('[DB] fetchPayrollSnapshots error:', error)
  return { data: data || [], error }
}

export async function upsertPayrollSnapshots(rows) {
  const { error } = await supabase
    .from('payroll_snapshots')
    .upsert(rows, { onConflict: 'org_id,pay_month,member_name' })
  if (error) console.error('[DB] upsertPayrollSnapshots error:', error)
  return { error }
}

export async function deletePayrollSnapshots(payMonth) {
  const { error } = await supabase
    .from('payroll_snapshots')
    .delete()
    .eq('org_id', getOrgId())
    .eq('pay_month', payMonth)
  if (error) console.error('[DB] deletePayrollSnapshots error:', error)
  return { error }
}

export async function fetchPayrollAdjustment(payMonth) {
  const { data, error } = await supabase
    .from('payroll_adjustments')
    .select('*')
    .eq('org_id', getOrgId())
    .eq('pay_month', payMonth)
    .maybeSingle()
  if (error) console.error('[DB] fetchPayrollAdjustment error:', error)
  return { data, error }
}

export async function upsertPayrollAdjustment({ payMonth, salesDiscount, incentiveDiscount, note }) {
  const { error } = await supabase
    .from('payroll_adjustments')
    .upsert({
      org_id: getOrgId(),
      pay_month: payMonth,
      sales_discount: salesDiscount || 0,
      incentive_discount: incentiveDiscount || 0,
      note: note || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,pay_month' })
  if (error) console.error('[DB] upsertPayrollAdjustment error:', error)
  return { error }
}

export async function fetchCallSessions(sinceISO) {
  const { data, error } = await supabase
    .from('call_sessions')
    .select('*')
    .gte('started_at', sinceISO)
    .order('started_at', { ascending: false })
  if (error) console.error('[DB] fetchCallSessions error:', error)
  return { data: data || [], error }
}

export async function fetchCallSessionsForRange(fromISO, toISO) {
  const { data, error } = await supabase
    .from('call_sessions')
    .select('id, caller_name, started_at, finished_at, last_called_at, list_name')
    .gte('started_at', fromISO)
    .lte('started_at', toISO)
    .order('started_at', { ascending: false })
  if (error) console.error('[DB] fetchCallSessionsForRange error:', error)
  return { data: data || [], error }
}

export async function fetchAllCallSessionsWithClients() {
  // org_idベースのRLSでテナント分離
  const { data: sessions, error: sErr } = await supabase
    .from('call_sessions')
    .select('*')
    .order('started_at', { ascending: false })
  if (sErr) console.error('[DB] fetchAllCallSessionsWithClients error:', sErr)
  if (!sessions?.length) return { data: [], error: sErr }

  // call_sessions.list_supa_id::uuid = call_lists.id でJOIN
  const supaIds = [...new Set(sessions.map(s => s.list_supa_id).filter(Boolean))]
  let listInfoMap = {}   // { list_supa_id: { name, total_count, client_id } }
  if (supaIds.length) {
    const { data: lists } = await supabase
      .from('call_lists')
      .select('id, client_id, name, industry, total_count')
      .in('id', supaIds)
    ;(lists || []).forEach(l => { listInfoMap[l.id] = l })
  }

  const clientIds = [...new Set(Object.values(listInfoMap).map(l => l.client_id).filter(Boolean))]
  let clientNameMap = {}
  if (clientIds.length) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', clientIds)
    ;(clients || []).forEach(c => { clientNameMap[c.id] = c.name })
  }

  const enriched = sessions.map(s => {
    const listInfo = listInfoMap[s.list_supa_id] || {}
    const clientName = clientNameMap[listInfo.client_id] || ''
    // リスト名はクライアント現在名 + 業種から動的構築（社名変更に追従）
    const dynamicListName = clientName && listInfo.industry
      ? `${clientName} - ${listInfo.industry}`
      : listInfo.name || s.list_name || '—'
    return {
      ...s,
      listName:       dynamicListName,
      listTotalCount: listInfo.total_count ?? s.total_count ?? 0,
      clientId:       listInfo.client_id  || null,
      clientName:     clientName || '未設定',
    }
  })
  return { data: enriched, error: sErr }
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

// リスト単位の架電履歴を新しい順に取得（架電履歴パネル用）
export async function fetchCallSessionsByList(listSupaId, limit = 50) {
  if (!listSupaId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('call_sessions')
    .select('id, caller_name, start_no, end_no, started_at, status_filter, revenue_min, revenue_max, pref_filter')
    .eq('list_supa_id', listSupaId)
    .not('start_no', 'is', null)
    .not('end_no', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) console.error('[DB] fetchCallSessionsByList error:', error)
  return { data: data || [], error }
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

export async function updateMemberAvatarUrl(memberName, avatarUrl) {
  if (!memberName) return null
  const { error } = await supabase
    .from('members')
    .update({ avatar_url: avatarUrl })
    .eq('name', memberName)
  if (error) console.error('[DB] updateMemberAvatarUrl error:', error)
  return error
}

export function getProfileImageUrl(userId) {
  if (!userId) return null
  const { data } = supabase.storage
    .from(PROFILE_BUCKET)
    .getPublicUrl(`${getOrgId()}/${userId}`)
  return data.publicUrl
}

export async function uploadProfileImage(userId, file) {
  if (!userId || !file) return { url: null, error: new Error('invalid args') }
  const path = `${getOrgId()}/${userId}`

  // まず upload を試みる。409（既存ファイル）なら update にフォールバック
  let finalError = null
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_BUCKET)
    .upload(path, file, { contentType: file.type })

  if (uploadError) {
    const is409 = uploadError.statusCode === '409' || uploadError.statusCode === 409
                  || uploadError.message?.toLowerCase().includes('already exists')
    if (is409) {
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
  return { url: data.publicUrl + '?t=' + Date.now(), error: null }
}

// ============================================================
// Settings (全体共通設定)
// ============================================================

export async function fetchSetting(key) {
  const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
  const { data, error } = await supabase
    .from('org_settings')
    .select('setting_value')
    .eq('org_id', ORG_ID)
    .eq('setting_key', key)
    .maybeSingle()
  if (error) console.error('[DB] fetchSetting error:', error)
  return { value: data?.setting_value ?? null, error }
}

export async function saveSetting(key, value) {
  const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
  const { data, error } = await supabase
    .from('org_settings')
    .upsert(
      { org_id: ORG_ID, setting_key: key, setting_value: value, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,setting_key' }
    )
    .select()
  if (error) console.error('[DB] saveSetting error — message:', error.message, '/ code:', error.code, '/ details:', error)
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
    userId: r.user_id,
    userName: r.user_name || '',
    title: r.user_name ? `ロープレ - ${r.user_name}` : 'ロープレ',
    startISO: r.start_iso,
    endISO: r.end_iso,
    dayLabel: r.day_label,
    startLabel: r.start_label,
    endLabel: r.end_label,
    attendeeEmail: r.attendee_email,
  })), error }
}

export async function fetchAllRoleplayBookings() {
  const { data, error } = await supabase.rpc('get_active_roleplay_bookings')
  if (error) console.error('[DB] fetchAllRoleplayBookings error:', error)
  return { data: (data || []).map(r => ({
    id: r.gcal_event_id,
    userId: r.user_id,
    userName: r.user_name || '',
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

export async function deleteRoleplayBooking(gcalEventId) {
  if (!gcalEventId) return null
  const { error } = await supabase.rpc('delete_roleplay_booking', { p_gcal_event_id: gcalEventId })
  if (error) console.error('[DB] deleteRoleplayBooking error:', error)
  return error
}

// ============================================================
// Reward Master (報酬マスター)
// ============================================================

export async function fetchRewardMaster() {
  const { data, error } = await supabase
    .from('reward_tiers')
    .select('*, reward_types(name, timing, basis, tax)')
    .order('type_id')
    .order('sort_order')
  if (error) { console.error('[DB] fetchRewardMaster error:', error); return { data: [], error } }
  const flat = (data || []).map(row => ({
    id: row.type_id,
    name: row.reward_types?.name || '',
    timing: row.reward_types?.timing || '',
    basis: row.reward_types?.basis || '',
    tax: row.reward_types?.tax || '',
    lo: row.lo,
    hi: row.hi,
    price: row.price,
    memo: row.memo,
    _tierId: row.id,
    _typeSort: row.reward_types?.sort_order ?? 99,
    _tierSort: row.sort_order,
  }))
  return { data: flat, error: null }
}

export async function fetchRewardTypes() {
  const { data, error } = await supabase
    .from('reward_types')
    .select('*, reward_tiers(*)')
    .order('sort_order')
  if (error) console.error('[DB] fetchRewardTypes error:', error)
  return { data: data || [], error }
}

export async function insertRewardType(data) {
  const { data: row, error } = await supabase
    .from('reward_types')
    .insert([data])
    .select()
    .single()
  if (error) console.error('[DB] insertRewardType error:', error)
  return { data: row, error }
}

export async function updateRewardType(typeId, updates) {
  const { error } = await supabase
    .from('reward_types')
    .update(updates)
    .eq('type_id', typeId)
  if (error) console.error('[DB] updateRewardType error:', error)
  return { error }
}

export async function deleteRewardType(typeId) {
  const { error } = await supabase
    .from('reward_types')
    .delete()
    .eq('type_id', typeId)
  if (error) console.error('[DB] deleteRewardType error:', error)
  return { error }
}

export async function insertRewardTier(data) {
  const { data: row, error } = await supabase
    .from('reward_tiers')
    .insert([data])
    .select()
    .single()
  if (error) console.error('[DB] insertRewardTier error:', error)
  return { data: row, error }
}

export async function updateRewardTier(id, updates) {
  const { error } = await supabase
    .from('reward_tiers')
    .update(updates)
    .eq('id', id)
  if (error) console.error('[DB] updateRewardTier error:', error)
  return { error }
}

export async function deleteRewardTier(id) {
  const { error } = await supabase
    .from('reward_tiers')
    .delete()
    .eq('id', id)
  if (error) console.error('[DB] deleteRewardTier error:', error)
  return { error }
}

export async function updateSessionRange(sessionId, startNo, endNo) {
  const { error } = await supabase
    .from('call_sessions')
    .update({ start_no: startNo, end_no: endNo })
    .eq('id', sessionId)
  if (error) throw error
}

export async function deleteSession(sessionId) {
  const { error } = await supabase
    .from('call_sessions')
    .delete()
    .eq('id', sessionId)
  if (error) throw error
}

export async function fetchCallListItemByAppo(company, phone, hintListId = null, hintItemId = null) {
  // ヒント（アポデータに保存されたlist_id/item_id）があればそれを優先
  if (hintItemId && hintListId) {
    const { data } = await supabase
      .from('call_list_items')
      .select('id, list_id')
      .eq('id', hintItemId)
      .limit(1);
    if (data?.length) return { data: data[0], error: null };
  }
  if (hintListId) {
    // ヒントのリスト内で企業名検索
    const normalizedPhone = phone ? phone.replace(/[^\d]/g, '') : '';
    if (normalizedPhone) {
      const { data } = await supabase
        .from('call_list_items')
        .select('id, list_id')
        .eq('phone', normalizedPhone)
        .eq('list_id', hintListId)
        .limit(1);
      if (data?.length) return { data: data[0], error: null };
    }
    if (company) {
      const { data } = await supabase
        .from('call_list_items')
        .select('id, list_id')
        .eq('company', company)
        .eq('list_id', hintListId)
        .limit(1);
      if (data?.length) return { data: data[0], error: null };
    }
  }

  // フォールバック: 全リストから検索
  const normalizedPhone = phone ? phone.replace(/[^\d]/g, '') : '';
  if (normalizedPhone) {
    const { data } = await supabase
      .from('call_list_items')
      .select('id, list_id')
      .eq('phone', normalizedPhone)
      .limit(1);
    if (data?.length) return { data: data[0], error: null };
  }
  if (company) {
    // 1) 完全一致
    const { data } = await supabase
      .from('call_list_items')
      .select('id, list_id')
      .eq('company', company)
      .limit(1);
    if (data?.length) return { data: data[0], error: null };

    // 2) 「株式会社」「有限会社」等の位置違いに対応（法人格を除いた社名で部分一致）
    const coreName = company.replace(/^(株式会社|有限会社|合同会社|合資会社|合名会社)|(株式会社|有限会社|合同会社|合資会社|合名会社)$/g, '').trim()
    if (coreName && coreName !== company) {
      const { data: fuzzy, error } = await supabase
        .from('call_list_items')
        .select('id, list_id')
        .ilike('company', `%${coreName}%`)
        .limit(1);
      return { data: fuzzy?.[0] || null, error };
    }
  }
  return { data: null, error: null };
}

export async function fetchCallActivity(fromISO, toISO) {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('call_records')
      .select('called_at, status, getter_name')
      .eq('org_id', getOrgId())
      .gte('called_at', fromISO)
      .lte('called_at', toISO)
      .order('called_at')
      .range(from, from + PAGE - 1);
    if (error) { console.error('[DB] fetchCallActivity error:', error); return { data: all, error }; }
    all.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return { data: all, error: null };
}

export async function fetchAppoActivity(fromISO, toISO) {
  const { data, error } = await supabase
    .from('appointments')
    .select('created_at, getter_name')
    .eq('org_id', getOrgId())
    .gte('created_at', fromISO)
    .lte('created_at', toISO);
  if (error) console.error('[DB] fetchAppoActivity error:', error);
  return { data: data || [], error };
}

export async function fetchCallRecordsByRange(fromISO, toISO) {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('call_records')
      .select('called_at, status, list_id, getter_name')
      .eq('org_id', getOrgId())
      .gte('called_at', fromISO)
      .lte('called_at', toISO)
      .order('called_at')
      .range(from, from + PAGE - 1);
    if (error) { console.error('[DB] fetchCallRecordsByRange error:', error); return { data: all, error }; }
    all.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return { data: all, error: null };
}

// ============================================================
// Performance RPC (サーバーサイド集計)
// ============================================================

export async function rpcPerfActivitySummary(fromISO, toISO, prevFromISO, prevToISO) {
  const { data, error } = await supabase.rpc('perf_activity_summary', {
    p_from: fromISO, p_to: toISO,
    p_prev_from: prevFromISO || null, p_prev_to: prevToISO || null,
  })
  if (error) console.error('[RPC] perf_activity_summary error:', error)
  return { data: data || { current: { total: 0, ceo_connect: 0, appo: 0 }, previous: { total: 0, ceo_connect: 0, appo: 0 } }, error }
}

export async function rpcPerfHourlyChart(dateStr) {
  const { data, error } = await supabase.rpc('perf_hourly_chart', { p_date: dateStr })
  if (error) console.error('[RPC] perf_hourly_chart error:', error)
  return { data: data || [], error }
}

export async function rpcPerfRanking(fromISO, toISO) {
  const { data, error } = await supabase.rpc('perf_ranking', { p_from: fromISO, p_to: toISO })
  if (error) console.error('[RPC] perf_ranking error:', error)
  return { data: data || [], error }
}

export async function rpcPerfWeeklyTrend(weekStartStr, weeks = 8) {
  const { data, error } = await supabase.rpc('perf_weekly_trend', { p_week_start: weekStartStr, p_weeks: weeks })
  if (error) console.error('[RPC] perf_weekly_trend error:', error)
  return { data: data || [], error }
}

export async function fetchCallListsMeta() {
  const { data, error } = await supabase
    .from('call_lists')
    .select('id, name, is_archived, client_id, clients(name)')
    .eq('org_id', getOrgId())
    .order('name');
  if (error) console.error('[DB] fetchCallListsMeta error:', error);
  return { data: data || [], error };
}

// ============================================================
// Training Progress（研修進捗）
// ============================================================

export async function fetchTrainingProgress(userId) {
  if (!userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('training_progress')
    .select('*')
    .eq('user_id', userId)
  if (error) console.error('[DB] fetchTrainingProgress error:', error)
  return { data: data || [], error }
}

export async function upsertTrainingStage(userId, stageKey, payload) {
  if (!userId || !stageKey) return { error: 'missing params' }
  const { error } = await supabase
    .from('training_progress')
    .upsert({
      user_id: userId,
      stage_key: stageKey,
      completed: payload.completed ?? true,
      completed_at: payload.completed ? new Date().toISOString() : null,
      passed: payload.passed ?? null,
      completed_by: payload.completed_by ?? null,
      notes: payload.notes ?? null,
      org_id: getOrgId(),
    }, { onConflict: 'user_id,stage_key' })
  if (error) console.error('[DB] upsertTrainingStage error:', error)
  return { error }
}

// ============================================================
// Roleplay Sessions（ロープレセッション）
// ============================================================

export async function fetchRoleplaySessions(userId) {
  if (!userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('roleplay_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('session_date', { ascending: false })
  if (error) console.error('[DB] fetchRoleplaySessions error:', error)
  return { data: data || [], error }
}

export async function insertRoleplaySession(userId, payload) {
  if (!userId) return { data: null, error: 'no userId' }
  const { data, error } = await supabase
    .from('roleplay_sessions')
    .insert({
      user_id: userId,
      org_id: getOrgId(),
      partner_name: payload.partner_name || null,
      session_type: payload.session_type,
      session_date: payload.session_date || null,
      passed: payload.passed ?? null,
      notes: payload.notes || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertRoleplaySession error:', error)
  return { data, error }
}

export async function updateRoleplaySession(id, payload) {
  if (!id) return { error: 'no id' }
  const { error } = await supabase
    .from('roleplay_sessions')
    .update(payload)
    .eq('id', id)
  if (error) console.error('[DB] updateRoleplaySession error:', error)
  return { error }
}

export async function deleteRoleplaySession(id) {
  if (!id) return { error: 'no id' }
  const { error } = await supabase
    .from('roleplay_sessions')
    .delete()
    .eq('id', id)
  if (error) console.error('[DB] deleteRoleplaySession error:', error)
  return { error }
}

export async function uploadAppoAttachments(appoId, files) {
  if (!appoId || !files?.length) return { urls: [], error: null }
  const safeId = String(appoId).replace(/[^a-zA-Z0-9_-]/g, '')
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const urls = []
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `attachments/${safeId}_${dateStr}_${safeName}`
    const { error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true })
    if (uploadError) {
      console.error('[DB] uploadAppoAttachment error:', uploadError)
      continue
    }
    const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(path)
    if (urlData?.publicUrl) urls.push({ name: file.name, url: urlData.publicUrl })
  }
  return { urls, error: null }
}

export async function uploadAppoRecording(appoId, file) {
  if (!appoId || !file) return { url: null, error: 'missing params' }
  const ext = file.name?.split('.').pop() || 'mp4'
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const safeId = String(appoId).replace(/[^a-zA-Z0-9_-]/g, '')
  const path = `${safeId}_${dateStr}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(path, file, { contentType: file.type || 'audio/mp4', upsert: true })
  if (uploadError) {
    console.error('[DB] uploadAppoRecording error:', uploadError)
    return { url: null, error: uploadError }
  }
  const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(path)
  return { url: urlData.publicUrl, error: null }
}

// ============================================================
// Weekly Meeting Videos（週次ミーティング録画）
// ============================================================
export async function fetchWeeklyMeetingVideos() {
  const { data, error } = await supabase
    .from('weekly_meeting_videos')
    .select('*')
    .order('meeting_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) console.error('[DB] fetchWeeklyMeetingVideos error:', error);
  return { data: data || [], error };
}

// Cloudflare Stream 経由のアップロード（Direct Creator Upload + TUS）
export async function uploadWeeklyMeetingVideo({ file, title, meetingDate, uploadedByName, onProgress }) {
  if (!file) return { error: 'missing file' };
  const orgId = getOrgId();
  if (!orgId) return { error: 'no org' };
  const { data: { user } = {} } = await supabase.auth.getUser();

  // 1. Edge Function 経由で Direct Upload URL + uid を取得
  const { data: du, error: duErr } = await supabase.functions.invoke('cf-stream', {
    body: { mode: 'direct_upload', title: title || file.name, maxDurationSeconds: 21600 },
  });
  if (duErr || !du?.uploadURL || !du?.uid) {
    console.error('[DB] uploadWeeklyMeetingVideo direct_upload error:', duErr || du);
    return { error: duErr || new Error('cf direct_upload failed') };
  }
  const uploadURL = du.uploadURL;
  const uid = du.uid;

  // 2. TUS PATCH ループで直接 Cloudflare Stream にアップロード
  //    XHR を使うことでチャンク内のバイト単位進捗が取れる（fetchだと不可）
  const CHUNK = 6 * 1024 * 1024; // 6MB: tus推奨 + 進捗更新の頻度確保
  const total = file.size;
  const sendChunk = (offset, blob) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        try { onProgress?.(offset + e.loaded, total); } catch (_) {}
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const hdr = xhr.getResponseHeader('Upload-Offset');
        resolve(hdr ? parseInt(hdr, 10) : offset + blob.size);
      } else {
        reject(new Error(`CF upload PATCH ${xhr.status}: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('CF upload network error'));
    xhr.ontimeout = () => reject(new Error('CF upload timeout'));
    xhr.open('PATCH', uploadURL);
    xhr.setRequestHeader('Upload-Offset', String(offset));
    xhr.setRequestHeader('Tus-Resumable', '1.0.0');
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
    xhr.send(blob);
  });
  let offset = 0;
  try {
    while (offset < total) {
      const end = Math.min(offset + CHUNK, total);
      const blob = file.slice(offset, end);
      offset = await sendChunk(offset, blob);
    }
    try { onProgress?.(total, total); } catch (_) {}
  } catch (err) {
    console.error('[DB] uploadWeeklyMeetingVideo PATCH error:', err);
    return { error: err };
  }

  // 3. DB にメタデータを保存
  const row = {
    org_id: orgId,
    title: title || file.name,
    meeting_date: meetingDate || null,
    stream_uid: uid,
    stream_ready: false,
    size_bytes: file.size,
    mime_type: file.type || 'video/mp4',
    uploaded_by: user?.id || null,
    uploaded_by_name: uploadedByName || null,
  };
  const { data, error: insertError } = await supabase.from('weekly_meeting_videos').insert(row).select().single();
  if (insertError) {
    console.error('[DB] uploadWeeklyMeetingVideo insert error:', insertError);
    return { error: insertError };
  }
  return { data, error: null };
}

// 配信可否・duration・サムネを Stream API に問い合わせ、DBに反映
export async function refreshWeeklyMeetingStatus(videoId, uid) {
  const { data, error } = await supabase.functions.invoke('cf-stream', {
    body: { mode: 'status', uid },
  });
  if (error || !data) return { error };
  const patch = {
    stream_ready: !!data.readyToStream,
    stream_thumbnail: data.thumbnail || null,
    duration_sec: data.duration ? Math.round(data.duration) : null,
  };
  const { error: upErr } = await supabase.from('weekly_meeting_videos').update(patch).eq('id', videoId);
  return { data: { ...data, ...patch }, error: upErr || null };
}

// 旧: Google Drive 経由のアップロード（Cloudflare Stream 移行後も参考に残す）
// eslint-disable-next-line no-unused-vars
async function _legacy_uploadWeeklyMeetingVideoViaDrive({ file, title, meetingDate, uploadedByName, onProgress }) {
  if (!file) return { error: 'missing file' };
  const orgId = getOrgId();
  if (!orgId) return { error: 'no org' };
  const { data: { user } = {} } = await supabase.auth.getUser();
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const safeTitle = (title || 'meeting').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const driveName = `${ts}_${safeTitle}.${ext}`;

  // Google Drive へ resumable upload（Supabase 標準 upload は 50MB 制限のため Drive 経由）
  const { data: initData, error: initErr } = await initResumableUpload(driveName);
  if (initErr || !initData?.upload_uri) {
    console.error('[DB] uploadWeeklyMeetingVideo init error:', initErr);
    return { error: initErr || new Error('Drive resumable init failed') };
  }
  let fileId = null;
  try {
    const result = await uploadFileToGdriveResumable(file, initData.upload_uri, (pct) => {
      try { onProgress?.(Math.round((pct / 100) * file.size), file.size); } catch (_) {}
    });
    fileId = result?.fileId || null;
  } catch (err) {
    console.error('[DB] uploadWeeklyMeetingVideo drive upload error:', err);
    return { error: err };
  }
  if (!fileId) return { error: new Error('Drive upload returned no fileId') };

  // 「リンクを知っている人が閲覧可能」の共有設定を付与
  const { data: permData, error: permErr } = await setDrivePermissions(fileId);
  const driveUrl = permData?.drive_url || `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  if (permErr) console.warn('[DB] uploadWeeklyMeetingVideo permission warn:', permErr);

  const row = {
    org_id: orgId,
    title: title || file.name,
    meeting_date: meetingDate || null,
    drive_file_id: fileId,
    public_url: driveUrl,
    storage_path: null,
    size_bytes: file.size,
    mime_type: file.type || 'video/mp4',
    uploaded_by: user?.id || null,
    uploaded_by_name: uploadedByName || null,
  };
  const { data, error: insertError } = await supabase.from('weekly_meeting_videos').insert(row).select().single();
  if (insertError) {
    console.error('[DB] uploadWeeklyMeetingVideo insert error:', insertError);
    return { error: insertError };
  }
  return { data, error: null };
}

export async function updateWeeklyMeetingVideo(id, patch) {
  const { data, error } = await supabase.from('weekly_meeting_videos')
    .update(patch).eq('id', id).select().single();
  if (error) console.error('[DB] updateWeeklyMeetingVideo error:', error);
  return { data, error };
}

export async function deleteWeeklyMeetingVideo(id, { streamUid = null, storagePath = null } = {}) {
  const { error: dbErr } = await supabase.from('weekly_meeting_videos').delete().eq('id', id);
  if (dbErr) { console.error('[DB] deleteWeeklyMeetingVideo db error:', dbErr); return { error: dbErr }; }
  if (streamUid) {
    const { error: cfErr } = await supabase.functions.invoke('cf-stream', { body: { mode: 'delete', uid: streamUid } });
    if (cfErr) console.error('[DB] deleteWeeklyMeetingVideo cf error:', cfErr);
  }
  if (storagePath) {
    const { error: stErr } = await supabase.storage.from('weekly-meetings').remove([storagePath]);
    if (stErr) console.error('[DB] deleteWeeklyMeetingVideo storage error:', stErr);
  }
  return { error: null };
}

export async function uploadRoleplayRecording(userId, sessionId, file) {
  if (!userId || !sessionId || !file) return { path: null, url: null, error: 'missing params' }
  const ext = file.name.split('.').pop() || 'mp4'
  const path = `${userId}/${sessionId}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('roleplay-recordings')
    .upload(path, file, { contentType: file.type || 'audio/mp4', upsert: true })
  if (uploadError) {
    console.error('[DB] uploadRoleplayRecording error:', uploadError)
    return { path: null, url: null, error: uploadError }
  }
  const { data: urlData } = supabase.storage.from('roleplay-recordings').getPublicUrl(path)
  return { path, url: urlData.publicUrl, error: null }
}

// 動画ファイルをオリジナルのまま保存（サムネイル・再生用）
export async function uploadRoleplayVideo(userId, sessionId, file) {
  if (!userId || !sessionId || !file) return { url: null, path: null, error: 'missing params' }
  const ext = file.name.split('.').pop() || 'mp4'
  const path = `${userId}/${sessionId}_video.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('roleplay-recordings')
    .upload(path, file, { contentType: file.type || 'video/mp4', upsert: true })
  if (uploadError) {
    console.error('[DB] uploadRoleplayVideo error:', uploadError)
    return { url: null, path: null, error: uploadError }
  }
  const { data: urlData } = supabase.storage.from('roleplay-recordings').getPublicUrl(path)
  return { url: urlData.publicUrl, path, error: null }
}

// 動画パスから署名付きURLを生成（1時間有効）
export async function createVideoSignedUrl(videoPath) {
  if (!videoPath) return null
  const { data, error } = await supabase.storage
    .from('roleplay-recordings')
    .createSignedUrl(videoPath, 3600)
  if (error) {
    console.error('[DB] createVideoSignedUrl error:', error)
    return null
  }
  return data?.signedUrl || null
}

export async function invokeAnalyzeRoleplay(payload) {
  const { data, error } = await supabase.functions.invoke('analyze-roleplay', { body: payload })
  if (error) {
    console.error('[Edge] analyze-roleplay error:', error)
    // non-2xx の場合、レスポンスボディから実際のエラーメッセージを取得
    // 自前エラー: { error: "..." }  Supabaseインフラエラー: { code: "WORKER_LIMIT", message: "..." }
    if (error.context) {
      try {
        const body = await error.context.json()
        const msg = body?.error || body?.message || null
        if (msg) return { data: { error: msg }, error: null }
      } catch {}
    }
  }
  return { data, error }
}

// ロープレ録画をGoogle Driveにアップロードし、共有リンクを返す
export async function invokeUploadToGdrive({ storage_path, filename, mode, file_id, folder_id, origin }) {
  const { data, error } = await supabase.functions.invoke('upload-to-gdrive', {
    body: { storage_path, filename, mode, file_id, folder_id, origin },
  })
  if (error) console.error('[Edge] upload-to-gdrive error:', error)
  return { data, error }
}

// Google Drive resumable upload URI を取得
export async function initResumableUpload(filename, folderId) {
  return invokeUploadToGdrive({ filename, folder_id: folderId, mode: 'init_resumable', origin: window.location.origin })
}

// Google Drive にファイルをチャンク分割でアップロード（resumable）
export async function uploadFileToGdriveResumable(file, uploadUri, onProgress) {
  const CHUNK_SIZE = 8 * 1024 * 1024 // 8MB
  const totalSize = file.size
  let offset = 0

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize)
    const chunk = file.slice(offset, end)
    const contentRange = `bytes ${offset}-${end - 1}/${totalSize}`

    const res = await fetch(uploadUri, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - offset),
        'Content-Range': contentRange,
      },
      body: chunk,
    })

    if (res.status === 308) {
      const range = res.headers.get('Range')
      offset = range ? parseInt(range.split('-')[1], 10) + 1 : end
    } else if (res.ok) {
      const data = await res.json()
      onProgress?.(100)
      return { fileId: data.id, webViewLink: data.webViewLink }
    } else {
      throw new Error(`Resumable upload failed at offset ${offset}: ${res.status}`)
    }

    onProgress?.(Math.round((offset / totalSize) * 100))
  }
  throw new Error('Upload completed without final response')
}

// Google Drive ファイルに共有設定を付与し、共有URLを返す
export async function setDrivePermissions(fileId) {
  return invokeUploadToGdrive({ file_id: fileId, mode: 'set_permissions' })
}

export async function pollRoleplayAnalysis(sessionId, { intervalMs = 5000, timeoutMs = 300000, signal } = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now()

    const poll = async () => {
      if (signal?.aborted) {
        clearInterval(intervalId)
        resolve({ ai_status: 'error', error: '分析がキャンセルされました。' })
        return
      }
      try {
        const { data, error } = await supabase
          .from('roleplay_sessions')
          .select('ai_status, transcript, ai_feedback')
          .eq('id', sessionId)
          .single()

        if (error) {
          console.error('[Poll] error:', error)
          return // transient error, keep polling
        }

        if (data.ai_status === 'done') {
          clearInterval(intervalId)
          resolve({ transcript: data.transcript, ai_feedback: data.ai_feedback, ai_status: 'done' })
          return
        }

        if (data.ai_status === 'error') {
          clearInterval(intervalId)
          const errorMsg = data.ai_feedback?.error || 'AI分析でエラーが発生しました。'
          resolve({ ai_status: 'error', error: errorMsg })
          return
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(intervalId)
          resolve({ ai_status: 'error', error: '分析がタイムアウトしました。しばらく待ってから再度お試しください。' })
          return
        }
      } catch (e) {
        console.error('[Poll] unexpected error:', e)
      }
    }

    const intervalId = setInterval(poll, intervalMs)
    poll() // poll immediately
  })
}

export async function postRoleplayToSlack(payload) {
  const { data, error } = await supabase.functions.invoke('post-roleplay-to-slack', { body: payload })
  if (error) console.error('[Edge] post-roleplay-to-slack error:', error)
  return { data, error }
}

// call_listsテーブルからindustry（業種）のユニーク一覧を取得
export async function fetchCallListIndustries() {
  const { data, error } = await supabase
    .from('call_lists')
    .select('industry')
    .eq('org_id', getOrgId())
    .not('industry', 'is', null)
    .neq('industry', '');
  if (error) {
    console.error('[DB] fetchCallListIndustries error:', error);
    return { data: [], error };
  }
  const unique = [...new Set((data || []).map(r => r.industry).filter(Boolean))].sort();
  return { data: unique, error: null };
}

// ============================================================
// Org Settings
// ============================================================

export async function fetchOrgSettings() {
  const { data, error } = await supabase
    .from('org_settings')
    .select('setting_key, setting_value')
    .eq('org_id', getOrgId());
  if (error) {
    console.error('[DB] fetchOrgSettings error:', error);
    return { data: {}, error };
  }
  const map = {};
  (data || []).forEach(r => { map[r.setting_key] = r.setting_value; });
  return { data: map, error: null };
}

// ============================================================
// Past Appointment Matching (過去アポ × 架電リスト照合)
// ============================================================

export async function fetchMatchingListItemsByCompanyNames(companyNames, activeListIds) {
  if (!companyNames?.length || !activeListIds?.length) return { data: {}, error: null }
  const CHUNK = 200
  // チャンクを並列で投げる (以前は sequential で RTT × N かかっていた)
  const chunks = []
  for (let i = 0; i < companyNames.length; i += CHUNK) {
    chunks.push(companyNames.slice(i, i + CHUNK))
  }
  const results = await Promise.all(chunks.map(chunk =>
    supabase
      .from('call_list_items')
      .select('id, list_id, company')
      .in('list_id', activeListIds)
      .in('company', chunk)
  ))
  const allRows = []
  for (const r of results) {
    if (r.error) {
      console.error('[DB] fetchMatchingListItemsByCompanyNames error:', r.error)
      return { data: {}, error: r.error }
    }
    allRows.push(...(r.data || []))
  }
  const map = {}
  allRows.forEach(r => {
    if (!map[r.company]) map[r.company] = []
    map[r.company].push({ itemId: r.id, listId: r.list_id })
  })
  return { data: map, error: null }
}

// ============================================================
// テナント管理（スーパー管理者用）
// ============================================================

/**
 * 新規テナント（組織）を作成する
 * @param {string} name - 組織名
 * @param {string} slug - URL識別子（英数字）
 * @returns {{ data: { id: string }, error: object|null }}
 */
export async function createOrganization(name, slug) {
  const { data, error } = await supabase
    .from('organizations')
    .insert({ name, slug })
    .select('id')
    .single()
  return { data, error }
}

/**
 * 新規テナントの管理者メンバーを作成する
 * @param {string} orgId - 組織ID
 * @param {string} name - 管理者名
 * @param {string} email - 実メールアドレス
 * @returns {{ data: object, error: object|null }}
 */
export async function createTenantAdmin(orgId, name, email) {
  const { data, error } = await supabase
    .from('members')
    .insert({
      org_id: orgId,
      name,
      email,
      role: 'admin',
      rank: 'トレーニー',
      position: '代表',
      is_active: true,
      start_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single()
  return { data, error }
}

// ============================================================
// Push Notification Helper
// ============================================================

async function sendAppointmentPushNotification(appoData, orgId) {
  if (!orgId) return
  // Notify all members in the org who have push subscriptions
  const { data: adminMembers } = await supabase
    .from('members')
    .select('user_id')
    .eq('org_id', orgId)
    .not('user_id', 'is', null)
  const userIds = (adminMembers || []).map(m => m.user_id).filter(Boolean)
  if (userIds.length === 0) return

  await supabase.functions.invoke('send-push', {
    body: {
      type: 'appointment',
      title: '新しいアポ',
      body: `${appoData.getter || ''}が${appoData.company || ''}のアポを獲得しました`,
      user_ids: userIds,
      org_id: orgId,
    },
  })
}
