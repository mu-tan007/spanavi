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
  const payload = {
    industry: data.industry,
    status: data.status,
    total_count: parseInt(data.count) || 0,
    manager_name: data.manager,
    company_info: data.companyInfo,
    company_url: data.companyUrl ?? null,
    script_body: data.scriptBody,
    cautions: data.cautions,
    rebuttal_data: data.rebuttalData,
    notes: data.notes,
    list_type: data.type,
    is_prospecting: data.isProspecting === true,
    contact_ids: data.contactIds ?? undefined,
    contact_id: (data.contactIds && data.contactIds.length > 0) ? data.contactIds[0] : (data.contactId ?? undefined),
  }
  if (data.engagementId) payload.engagement_id = data.engagementId
  // リスト名は「{会社名} - {業種}」で常に再生成（業種＝リスト名として一元管理）。
  // data.name が明示的に渡されればそれを優先する。
  if (typeof data.name === 'string' && data.name.trim()) {
    payload.name = data.name.trim()
  } else if (data.company && data.industry) {
    payload.name = `${data.company} - ${data.industry}`
  }
  const { error } = await supabase
    .from('call_lists')
    .update(payload)
    .eq('id', supaId)
  if (error) console.error('[DB] updateCallList error:', error)
  // スマートキュー mv 経由の画面（詳細条件抽出 / ②業種×ステータス）に
  // 即時反映させるため refresh を発火
  else refreshSmartQueueMVs()
  return error
}

export async function insertCallList(data, engagementId = null) {
  // まずclient_idと（フォールバック用に）engagement_idを取得
  const { data: clients } = await supabase
    .from('clients')
    .select('id, engagement_id')
    .eq('name', data.company)
    .limit(1)
  const clientId = clients?.[0]?.id || null
  // 引数で渡された engagement_id を優先、無ければ client の engagement_id、それも無ければ seller_sourcing にフォールバック
  const resolvedEngagementId = await resolveEngagementId(engagementId || clients?.[0]?.engagement_id)

  const { data: result, error } = await supabase
    .from('call_lists')
    .insert({
      org_id: getOrgId(),
      engagement_id: resolvedEngagementId,
      client_id: clientId,
      // 明示的に data.name があれば優先、無ければ「会社名 - 業種」を自動生成
      name: (typeof data.name === 'string' && data.name.trim())
        ? data.name.trim()
        : `${data.company} - ${data.industry}`,
      industry: data.industry,
      status: data.status || '架電可能',
      total_count: parseInt(data.count) || 0,
      manager_name: data.manager,
      company_info: data.companyInfo,
      company_url: data.companyUrl ?? null,
      script_body: data.scriptBody,
      cautions: data.cautions,
      rebuttal_data: data.rebuttalData,
      notes: data.notes,
      list_type: data.type,
      is_prospecting: data.isProspecting === true,
      script_name: data.script,
      contact_ids: data.contactIds || [],
      contact_id: (data.contactIds && data.contactIds.length > 0) ? data.contactIds[0] : (data.contactId || null),
    })
    .select()
    .single()
  if (error) console.error('[DB] insertCallList error:', error)
  else refreshSmartQueueMVs()
  return { result, error }
}

export async function deleteCallList(supaId) {
  if (!supaId) { console.warn('[DB] deleteCallList: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .delete()
    .eq('id', supaId)
  if (error) console.error('[DB] deleteCallList error:', error)
  else refreshSmartQueueMVs()
  return error
}

export async function archiveCallList(supaId) {
  if (!supaId) { console.warn('[DB] archiveCallList: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ is_archived: true })
    .eq('id', supaId)
  if (error) console.error('[DB] archiveCallList error:', error)
  // スマートキュー mv は materialized なので即時 refresh で UI に反映
  else refreshSmartQueueMVs()
  return error
}

export async function restoreCallList(supaId) {
  if (!supaId) { console.warn('[DB] restoreCallList: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ is_archived: false })
    .eq('id', supaId)
  if (error) console.error('[DB] restoreCallList error:', error)
  else refreshSmartQueueMVs()
  return error
}

// スマートキュー用 mv を refresh（fire-and-forget）。CONCURRENTLY なので
// 完了を待たなくても他クエリは読める。エラーは握りつぶしてログのみ。
export function refreshSmartQueueMVs() {
  supabase.rpc('refresh_smart_queue_mvs').then(({ error }) => {
    if (error) console.warn('[DB] refresh_smart_queue_mvs failed:', error)
  })
}

// ============================================================
// Clients (クライアント)
// ============================================================

// engagement_id が UUID 形式かどうか判定（仮想 masp_global を弾く）
function isRealEngagementId(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// 渡された engagementId が無効な場合は seller_sourcing にフォールバック
async function resolveEngagementId(engagementId) {
  if (isRealEngagementId(engagementId)) return engagementId;
  const orgId = getOrgId();
  if (!orgId) return null;
  const { data } = await supabase
    .from('engagements')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', 'seller_sourcing')
    .maybeSingle();
  return data?.id || null;
}

export async function insertClient(data, engagementId = null) {
  const resolvedEngagementId = await resolveEngagementId(engagementId);
  const { data: result, error } = await supabase
    .from('clients')
    .insert({
      org_id: getOrgId(),
      engagement_id: resolvedEngagementId,
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
      status_changed_at: new Date().toISOString(),
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
      memo: data.memo === undefined ? undefined : data.memo,
      google_calendar_id: data.googleCalendarId ?? undefined,
      client_email: data.clientEmail ?? undefined,
      scheduling_url: data.schedulingUrl ?? undefined,
      slack_webhook_url: data.slackWebhookUrl ?? undefined,
      slack_webhook_url_internal: data.slackWebhookUrlInternal ?? undefined,
      chatwork_room_id: data.chatworkRoomId ?? undefined,
      // ステータス変更時のみ更新（呼び出し側で statusChangedAt を渡したときだけ反映）
      status_changed_at: data.statusChangedAt ?? undefined,
      // 次回接点予定日（呼び出し側が明示的に渡したときだけ反映、null可）
      next_contact_at: data.nextContactAt === undefined ? undefined : data.nextContactAt,
    })
    .eq('id', supaId)
  if (error) console.error('[DB] updateClient error:', error)
  return error
}

// 次回接点予定日のみ更新する軽量API（クライアント詳細ページから単独で呼ぶ）
export async function updateClientNextContactAt(supaId, nextContactAt) {
  if (!supaId) return { error: new Error('no supaId') }
  const { error } = await supabase
    .from('clients')
    .update({ next_contact_at: nextContactAt })
    .eq('id', supaId)
  if (error) console.error('[DB] updateClientNextContactAt error:', error)
  return { error }
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

// ============================================================
// アポ取得報告テンプレ (appointment_report_templates)
// ============================================================

export async function fetchReportTemplates() {
  const orgId = getOrgId()
  if (!orgId) return { data: [], error: new Error('no org') }
  const { data, error } = await supabase
    .from('appointment_report_templates')
    .select('id, org_id, name, description, scope_level, engagement_id, client_id, list_id, schema, body_template, ai_prompt, is_active, created_by, created_at, updated_at')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('scope_level')
    .order('created_at', { ascending: false })
  if (error) console.error('[DB] fetchReportTemplates error:', error)
  return { data: data || [], error }
}

export async function insertReportTemplate(payload) {
  const orgId = getOrgId()
  const { data: { session } } = await supabase.auth.getSession()
  const { data, error } = await supabase
    .from('appointment_report_templates')
    .insert({
      org_id: orgId,
      name: payload.name,
      description: payload.description || null,
      scope_level: payload.scope_level,
      engagement_id: payload.engagement_id || null,
      client_id: payload.client_id || null,
      list_id: payload.list_id || null,
      schema: payload.schema || [],
      body_template: payload.body_template || '',
      ai_prompt: payload.ai_prompt || null,
      is_active: true,
      created_by: session?.user?.id || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertReportTemplate error:', error)
  return { data, error }
}

export async function updateReportTemplate(id, payload) {
  const { data, error } = await supabase
    .from('appointment_report_templates')
    .update({
      name: payload.name,
      description: payload.description || null,
      scope_level: payload.scope_level,
      engagement_id: payload.engagement_id || null,
      client_id: payload.client_id || null,
      list_id: payload.list_id || null,
      schema: payload.schema || [],
      body_template: payload.body_template || '',
      ai_prompt: payload.ai_prompt || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) console.error('[DB] updateReportTemplate error:', error)
  return { data, error }
}

export async function deleteReportTemplate(id) {
  // 論理削除 (is_active=false) でユニーク制約を解放する
  const { error } = await supabase
    .from('appointment_report_templates')
    .update({ is_active: false })
    .eq('id', id)
  if (error) console.error('[DB] deleteReportTemplate error:', error)
  return { error }
}

// クライアント開拓アポ取得時、CRM の clients テーブルへ upsert する。
// 既存(name一致)があれば「面談予定」に更新、無ければ新規作成。
// 進行段階が支援中/準備中の場合は status は変更しない。
export async function ensureProspectingClient({ name, industry, contactPerson, contactEmail, contactPhone, nextContactAt }) {
  if (!name) return { data: null, error: new Error('no name') }
  const orgId = getOrgId()
  const { data: existing, error: e0 } = await supabase
    .from('clients')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('name', name)
    .maybeSingle()
  if (e0) {
    console.warn('[DB] ensureProspectingClient lookup error:', e0)
  }
  if (existing) {
    const updates = {}
    if (nextContactAt) updates.next_contact_at = nextContactAt
    if (contactPerson) updates.contact_person = contactPerson
    if (contactEmail) updates.contact_email = contactEmail
    if (contactPhone) updates.contact_phone = contactPhone
    if (industry) updates.industry = industry
    // 既に進行段階が進んでいる場合は status を巻き戻さない
    if (existing.status !== '支援中' && existing.status !== '準備中') {
      updates.status = '面談予定'
      updates.status_changed_at = new Date().toISOString()
    }
    if (Object.keys(updates).length === 0) return { data: existing, error: null }
    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) console.error('[DB] ensureProspectingClient update error:', error)
    return { data, error }
  }
  // 新規 INSERT
  const { data, error } = await supabase
    .from('clients')
    .insert({
      org_id: orgId,
      name,
      status: '面談予定',
      contract_status: '未',
      industry: industry || '',
      contact_person: contactPerson || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      next_contact_at: nextContactAt || null,
      status_changed_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) console.error('[DB] ensureProspectingClient insert error:', error)
  return { data, error }
}

// 企業名・住所・代表者から公式 HP URL を AI + web search で推定
export async function invokeLookupCompanyHomepage({ company_name, address, prefecture, representative }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('not authenticated')
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-company-homepage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ company_name, address, prefecture, representative }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { url: null, confidence: 'low', reason: json.reason || `HTTP ${res.status}` }
    return json
  } catch (e) {
    console.warn('[lookup-homepage] error:', e)
    return { url: null, confidence: 'low', reason: e?.message || String(e) }
  }
}

// 録音を文字起こし＋テンプレ駆動でフィールド抽出
export async function invokeTranscribeAndExtract({ recording_url, item_id, ai_prompt, extract_fields }) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('not authenticated')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-and-extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ recording_url, item_id, ai_prompt, extract_fields }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

// gcal-proxy Edge Function 経由で Google Calendar にイベントを作成する
export async function createGcalEvent({ summary, description, startISO, endISO, location: locationStr }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('not authenticated')
    const eventBody = {
      summary,
      description: description || '',
      start: { dateTime: startISO, timeZone: 'Asia/Tokyo' },
      end:   { dateTime: endISO,   timeZone: 'Asia/Tokyo' },
    }
    if (locationStr) eventBody.location = locationStr
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcal-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(eventBody),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.warn('[gcal] createEvent failed:', json)
      return { eventId: null, error: json.error || `HTTP ${res.status}` }
    }
    return { eventId: json.eventId || null, error: null }
  } catch (e) {
    console.warn('[gcal] createEvent error:', e)
    return { eventId: null, error: e?.message || String(e) }
  }
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

export async function insertAppointment(data, engagementId = null) {
  // list_idがあればcall_listsからclient_idと engagement_id を取得（クライアント名変更に強い）
  let clientId = null
  let listEngagementId = null
  if (data.list_id) {
    const { data: listRow } = await supabase
      .from('call_lists')
      .select('client_id, engagement_id')
      .eq('id', data.list_id)
      .single()
    clientId = listRow?.client_id || null
    listEngagementId = listRow?.engagement_id || null
  }
  // list_idからclient_idが取得できなかった場合はクライアント名でフォールバック
  let clientEngagementId = null
  if (!clientId && data.client) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, engagement_id')
      .eq('name', data.client)
      .limit(1)
    clientId = clients?.[0]?.id || null
    clientEngagementId = clients?.[0]?.engagement_id || null
  } else if (clientId) {
    // client_id があれば engagement_id も同時に引き直す（list 由来の場合は既に持っている）
    if (!listEngagementId) {
      const { data: c } = await supabase.from('clients').select('engagement_id').eq('id', clientId).maybeSingle()
      clientEngagementId = c?.engagement_id || null
    }
  }
  // 優先順: 引数 > list の engagement_id > client の engagement_id > seller_sourcing フォールバック
  const resolvedEngagementId = await resolveEngagementId(engagementId || listEngagementId || clientEngagementId)

  const appoMonth = data.meetDate ? (parseInt(data.meetDate.slice(5, 7), 10) + '月') : ''

  // クライアント別のデフォルト備考。data.note が空の場合のみ適用。
  // 将来 clients テーブルに default_appo_note カラムを生やせばここの分岐を外せる。
  const CLIENT_DEFAULT_NOTES = {
    'ブティックス株式会社': 'ご面談当日にお手元に決算書や財務状況がわかるデータをご準備いただくことは可能かヒアリングすること。（簡易的な株価の算定のため）',
  }
  const defaultNote = !data.note && data.client ? (CLIENT_DEFAULT_NOTES[data.client] || null) : null
  const finalNote = data.note || defaultNote || null

  const { data: result, error } = await supabase
    .from('appointments')
    .insert({
      org_id: getOrgId(),
      engagement_id: resolvedEngagementId,
      client_id: clientId,
      company_name: data.company,
      status: data.status || 'アポ取得',
      getter_name: data.getter,
      appointment_date: data.getDate || null,
      meeting_date: data.meetDate || null,
      sales_amount: parseInt(data.sales) || 0,
      intern_reward: parseInt(data.reward) || 0,
      notes: finalNote,
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
      // transcribe-recording が録音から判定した M&A 意向（4値）を直書き保存。
      // 既存の appo_report テキストからの正規表現抽出（apppoReportParse）は後方互換 fallback。
      keyman_ma_intent: data.keymanMaIntent || null,
      // テンプレ駆動: 保存時テンプレIDのスナップショット + 動的フィールド値
      report_template_id_snapshot: data.reportTemplateIdSnapshot || null,
      report_data: data.reportData || null,
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
export async function insertClientContact(clientId, { name, email, slackMemberId, googleCalendarId, schedulingUrl, schedulingUrl2, schedulingLabel, schedulingLabel2, schedulingNotes, isPrimary }) {
  const orgId = getOrgId()
  const payload = { org_id: orgId, client_id: clientId, name, email, slack_member_id: slackMemberId || null, google_calendar_id: googleCalendarId || null, scheduling_url: schedulingUrl || null, scheduling_url_2: schedulingUrl2 || null, scheduling_label: schedulingLabel || null, scheduling_label_2: schedulingLabel2 || null, scheduling_notes: schedulingNotes || null }
  if (isPrimary === true || isPrimary === false) payload.is_primary = isPrimary
  const { data, error } = await supabase
    .from('client_contacts')
    .insert(payload)
    .select()
    .single()
  if (error) console.error('[DB] insertClientContact error:', error)
  return { data, error }
}

export async function updateClientContact(id, { name, email, slackMemberId, googleCalendarId, schedulingUrl, schedulingUrl2, schedulingLabel, schedulingLabel2, schedulingNotes, isPrimary }) {
  const patch = { name, email, slack_member_id: slackMemberId ?? undefined, google_calendar_id: googleCalendarId ?? undefined, scheduling_url: schedulingUrl ?? undefined, scheduling_url_2: schedulingUrl2 ?? undefined, scheduling_label: schedulingLabel ?? undefined, scheduling_label_2: schedulingLabel2 ?? undefined, scheduling_notes: schedulingNotes ?? undefined }
  if (isPrimary === true || isPrimary === false) patch.is_primary = isPrimary
  const { error } = await supabase
    .from('client_contacts')
    .update(patch)
    .eq('id', id)
  if (error) console.error('[DB] updateClientContact error:', error)
  return error
}

// 主担当を 1 名に切替 (同一 client 内の他の担当者は false にしてから対象を true に)
// 部分 unique index を満たすため、2 ステップで安全に行う。
export async function setPrimaryContact(clientId, contactId) {
  if (!clientId || !contactId) return { error: { message: 'clientId / contactId が必要です' } }
  // 1) まず同 client 内の主担当を全部下ろす
  const { error: e1 } = await supabase
    .from('client_contacts')
    .update({ is_primary: false })
    .eq('client_id', clientId)
    .eq('is_primary', true)
  if (e1) { console.error('[DB] setPrimaryContact step1 error:', e1); return { error: e1 } }
  // 2) 対象を主担当にする
  const { error: e2 } = await supabase
    .from('client_contacts')
    .update({ is_primary: true })
    .eq('id', contactId)
  if (e2) { console.error('[DB] setPrimaryContact step2 error:', e2); return { error: e2 } }
  return { error: null }
}

// ── 担当者メモ (追記専用) ─────────────────────────────────────
export async function fetchContactMemoEvents(contactId) {
  if (!contactId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('contact_memo_events')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
  if (error) console.error('[DB] fetchContactMemoEvents error:', error)
  return { data: data || [], error }
}

export async function insertContactMemoEvent({ contactId, bodyMd, rawTranscript, voiceInputId, source, extracted, authorUserId, authorName }) {
  const orgId = getOrgId()
  const payload = {
    org_id: orgId,
    contact_id: contactId,
    body_md: bodyMd,
    raw_transcript: rawTranscript ?? null,
    voice_input_id: voiceInputId ?? null,
    source: source || 'manual',
    extracted: extracted || {},
    author_user_id: authorUserId ?? null,
    author_name: authorName ?? null,
  }
  const { data, error } = await supabase
    .from('contact_memo_events')
    .insert(payload)
    .select()
    .single()
  if (error) console.error('[DB] insertContactMemoEvent error:', error)
  return { data, error }
}

// ── 音声入力ログ (原本永続保持) ──────────────────────────────
export async function insertContactVoiceInput({ targetKind, contactId, clientId, audioUrl, durationSec, uploadedByUserId, uploadedByName }) {
  const orgId = getOrgId()
  const payload = {
    org_id: orgId,
    target_kind: targetKind,
    contact_id: contactId ?? null,
    client_id: clientId ?? null,
    audio_url: audioUrl ?? null,
    duration_sec: durationSec ?? null,
    uploaded_by_user_id: uploadedByUserId ?? null,
    uploaded_by_name: uploadedByName ?? null,
    status: 'pending',
  }
  const { data, error } = await supabase
    .from('contact_voice_inputs')
    .insert(payload)
    .select()
    .single()
  if (error) console.error('[DB] insertContactVoiceInput error:', error)
  return { data, error }
}

export async function updateContactVoiceInput(id, patch) {
  if (!id) return { error: { message: 'id が必要です' } }
  const allowed = ['transcript', 'ai_summary', 'ai_extracted', 'status', 'error', 'audio_url', 'duration_sec']
  const update = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (patch[k] !== undefined) update[k] = patch[k]
  const { error } = await supabase
    .from('contact_voice_inputs')
    .update(update)
    .eq('id', id)
  if (error) console.error('[DB] updateContactVoiceInput error:', error)
  return { error }
}

export async function uploadContactAudio(voiceInputId, blob, ext = 'webm') {
  const orgId = getOrgId()
  if (!orgId || !voiceInputId || !blob) return { path: null, error: { message: 'orgId / voiceInputId / blob 必須' } }
  const path = `${orgId}/${voiceInputId}.${ext}`
  const { error } = await supabase.storage
    .from('contact-audio')
    .upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false })
  if (error) { console.error('[Storage] uploadContactAudio error:', error); return { path: null, error } }
  return { path, error: null }
}

export async function getContactAudioSignedUrl(path, expiresInSec = 600) {
  if (!path) return { url: null, error: { message: 'path が必要です' } }
  const { data, error } = await supabase.storage
    .from('contact-audio')
    .createSignedUrl(path, expiresInSec)
  if (error) { console.error('[Storage] getContactAudioSignedUrl error:', error); return { url: null, error } }
  return { url: data?.signedUrl ?? null, error: null }
}

// process-contact-voice Edge Function 呼び出し
// voice_input_id を渡すと Whisper + Claude を経て transcript / ai_summary / ai_extracted が返る
export async function invokeProcessContactVoice(voiceInputId) {
  if (!voiceInputId) return { data: null, error: { message: 'voiceInputId が必要です' } }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const session = (await supabase.auth.getSession())?.data?.session
  const token = session?.access_token || anonKey
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/process-contact-voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ voice_input_id: voiceInputId }),
    })
    const data = await res.json()
    if (!res.ok) return { data: null, error: data.error || `処理失敗: ${res.status}` }
    return { data, error: null }
  } catch (e) {
    console.error('[invoke] process-contact-voice error:', e)
    return { data: null, error: e.message || String(e) }
  }
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

// 旧キーマン携帯番号（または別事業所番号）が編集/削除された時に、
// その旧番号でこの item に紐づいていた着信履歴を全て紐づけ解除する。
// rawNumber は normalize 前/後どちらでも OK（内部でバリアント展開）。
export async function unlinkIncomingCallsByCallerNumber(itemId, rawNumber) {
  if (!itemId || !rawNumber) return null
  const digits = String(rawNumber).replace(/\D/g, '')
  if (!digits) return null
  // 着信履歴に保存されている caller_number は表記揺れが大きいので複数形式を当てる
  const local = digits.startsWith('81') ? '0' + digits.slice(2) : digits
  const intl = local.startsWith('0') ? '+81' + local.slice(1) : `+81${local}`
  const variants = Array.from(new Set([
    String(rawNumber),
    digits,
    local,
    intl,
    intl.replace('+', ''),
  ].filter(Boolean)))
  const { error } = await supabase
    .from('incoming_calls')
    .update({ item_id: null, company_name: null })
    .eq('item_id', itemId)
    .in('caller_number', variants)
  if (error) console.error('[DB] unlinkIncomingCallsByCallerNumber error:', error)
  return error
}

// CSV 取り込み時、各セルの先頭に「事業内容：」「電話番号：」のようなラベルが
// 紛れ込んでいたら自動で除去する。Excel の見出し付きセルをコピペした時に
// 起きる汚染（フラーレンリスト 47件の事例）への構造的予防。
const FIELD_LABEL_PREFIXES = {
  business: ['事業内容', '業務内容', '事業'],
  phone: ['電話番号', '電話', 'TEL', 'ＴＥＬ'],
  address: ['住所', '所在地'],
  representative: ['代表者', '代表', '社長'],
  company: ['企業名', '会社名'],
  url: ['HP', 'ＨＰ', 'URL', 'ＵＲＬ', 'ホームページ', 'ウェブサイト'],
  memo: ['メモ', '備考'],
}
function stripLabelPrefix(value, field) {
  if (!value || typeof value !== 'string') return value
  const labels = FIELD_LABEL_PREFIXES[field] || []
  for (const label of labels) {
    const re = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:：]\\s*')
    if (re.test(value)) return value.replace(re, '')
  }
  return value
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
      company: stripLabelPrefix(r.company || '', 'company'),
      business: stripLabelPrefix(r.business || '', 'business'),
      representative: stripLabelPrefix(r.representative || '', 'representative'),
      phone: stripLabelPrefix(r.phone || '', 'phone'),
      address: stripLabelPrefix(r.address || '', 'address'),
      revenue: r.revenue ?? null,
      net_income: r.net_income ?? null,
      employees: r.employees ?? null,
      url: stripLabelPrefix(r.url || '', 'url') || null,
      memo: stripLabelPrefix(r.memo || '', 'memo') || null,
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
  // members.position = 会社役職 (代表取締役/取締役)。事業内ポジションは member_engagements 側へ。
  // data.role は useSpanaviData が member_engagements から注入した legacy 互換値なので
  // ここで position に書き戻すと会社役職を破壊する。data.position が明示指定された時だけ書く。
  const patch = {
    name: data.name,
    university: data.university,
    grade: parseInt(data.year) || 0,
    team: data.team,
    rank: data.rank,
    incentive_rate: parseFloat(data.rate) || 0,
    job_offer: data.offer,
    operation_start_date: data.operationStartDate || null,
    referrer_name: data.referrerName || null,
    zoom_user_id: data.zoomUserId || null,
    zoom_phone_number: data.zoomPhoneNumber ?? null,
  }
  if (Object.prototype.hasOwnProperty.call(data, 'position')) {
    patch.position = data.position || null
  }
  const { error } = await supabase
    .from('members')
    .update(patch)
    .eq('id', supaId)
  if (error) console.error('[DB] updateMember error:', error)
  return error
}

/** MyPage 用: 本人が編集可能な基本情報のみを更新 */
export async function updateMemberProfile(supaId, { name, email, phone_number, start_date }) {
  if (!supaId) { console.warn('[DB] updateMemberProfile: no supaId'); return new Error('no supaId') }
  const patch = {}
  if (name !== undefined) patch.name = name
  if (email !== undefined) patch.email = email
  if (phone_number !== undefined) patch.phone_number = phone_number
  if (start_date !== undefined) patch.start_date = start_date || null
  const { error } = await supabase
    .from('members')
    .update(patch)
    .eq('id', supaId)
  if (error) console.error('[DB] updateMemberProfile error:', error)
  return error
}

export async function insertMember(data) {
  // Phase 5 以降 members.position は 会社役職 (代表取締役/取締役) 専用。
  // 事業内ポジションは member_engagements.role_id 側にあるため、ここで data.role を
  // position に書き込まない。data.position が明示指定された時のみセット。
  const row = {
    org_id: getOrgId(),
    name: data.name,
    university: data.university || '',
    grade: parseInt(data.year) || 0,
    team: data.team || '',
    rank: data.rank || null,
    incentive_rate: parseFloat(data.rate) || 0,
    job_offer: data.offer || '',
    cumulative_sales: 0,
    start_date: new Date().toISOString().slice(0, 10),
    operation_start_date: data.operationStartDate || null,
    referrer_name: data.referrerName || null,
  }
  if (Object.prototype.hasOwnProperty.call(data, 'position')) {
    row.position = data.position || null
  }
  const { data: result, error } = await supabase
    .from('members')
    .insert(row)
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

/** メンバーをソフト削除（退職扱い）。過去の架電履歴・売上等は保持される */
export async function deactivateMember(supaId) {
  if (!supaId) { console.warn('[DB] deactivateMember: no supaId'); return new Error('no supaId') }
  const { error } = await supabase
    .from('members')
    .update({ is_active: false })
    .eq('id', supaId)
  if (error) console.error('[DB] deactivateMember error:', error)
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
      // 旧ラベル '社長再コール' は古いキャッシュSPAから書き込まれる残存対策で含める
      .in('status', ['受付再コール', 'キーマン再コール', '社長再コール'])
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
      .select('id, name, client_id, industry, is_archived')
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

  // フィルタ2: アーカイブ済みリストの再コールは除外
  const listAlive = memoFiltered.filter(r => listMap[r.list_id]?.is_archived !== true)

  // フィルタ3: call_list_items.call_status（その企業の直近架電結果）が
  // 受付再コール / キーマン再コール でないものは除外。
  // 過去に再コールを記録 → 別画面（CallingScreen 等）から非再コール結果で上書きしたが、
  // その時に call_records 側の recall_completed フラグが立たなかった「取り残し」を排除する。
  // call_list_items が取得できなかったレコードは安全側で残す（fetch失敗時の取りこぼし防止）。
  const RECALL_LATEST_STATUSES = new Set(['受付再コール', 'キーマン再コール', '社長再コール'])
  const statusFresh = listAlive.filter(r => {
    const item = itemMap[r.item_id]
    if (!item) return true
    return RECALL_LATEST_STATUSES.has(item.call_status)
  })

  // フィルタ4: 同一 item_id で複数レコードがある場合は最大 round のみ残す
  // （同一企業への再コールが重複して表示されないようにする）
  const latestPerItem = new Map()
  statusFresh.forEach(r => {
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
    .in('status', ['受付再コール', 'キーマン再コール'])
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

export async function invokeGenerateCompanyInfo({ itemId, company, representative, address }) {
  const { data, error } = await supabase.functions.invoke('generate-company-info', {
    body: { item_id: itemId, company, representative, address },
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
  // search_call_list_items RPC を使う。SQL 側で OR-ILIKE を直接実行するため、
  // supabase-js の .or() URL 構築の制約や 100k 行スケールの不安定挙動を回避できる。
  const { data, error } = await supabase.rpc('search_call_list_items', {
    p_keyword: keyword.trim(),
    p_search_field: searchField || 'all',
    p_status_filter: statusFilter || 'all',
    p_offset: page * pageSize,
    p_limit: pageSize,
  });
  if (error) {
    console.error('[DB] search_call_list_items rpc error:', error);
    return { data: [], error, count: 0 };
  }
  const rows = data || [];
  // total_count は全行に同じ値が入っている（RPC 内 CROSS JOIN）
  const count = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;
  // total_count を表向きの行から除外
  const cleaned = rows.map(({ total_count, ...rest }) => rest);
  return { data: cleaned, error: null, count };
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

export async function updateCallListCautions(supaId, cautions) {
  if (!supaId) { console.warn('[DB] updateCallListCautions: no supaId'); return null }
  const { error } = await supabase
    .from('call_lists')
    .update({ cautions })
    .eq('id', supaId)
  if (error) console.error('[DB] updateCallListCautions error:', error)
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

// 被紹介者を「紹介フィー支払済」としてマーキング（重複支給防止）
export async function markMembersReferralPaid(memberIds, payMonth) {
  if (!memberIds || memberIds.length === 0) return { error: null }
  const { error } = await supabase
    .from('members')
    .update({ referral_paid_pay_month: payMonth })
    .eq('org_id', getOrgId())
    .in('id', memberIds)
  if (error) console.error('[DB] markMembersReferralPaid error:', error)
  return { error }
}

// 指定月の紹介フィー支払マークをクリア（確定解除時）
export async function clearMembersReferralPaid(payMonth) {
  const { error } = await supabase
    .from('members')
    .update({ referral_paid_pay_month: null })
    .eq('org_id', getOrgId())
    .eq('referral_paid_pay_month', payMonth)
  if (error) console.error('[DB] clearMembersReferralPaid error:', error)
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

// member の avatar_url を更新する。
// 第 1 引数は UUID 形式（members.id）を優先、文字列でハイフンが含まれない場合は name として fallback。
export async function updateMemberAvatarUrl(memberIdOrName, avatarUrl) {
  if (!memberIdOrName) return null
  const isUuid = typeof memberIdOrName === 'string' && /^[0-9a-f]{8}-/i.test(memberIdOrName)
  const query = supabase.from('members').update({ avatar_url: avatarUrl })
  const { error } = isUuid
    ? await query.eq('id', memberIdOrName)
    : await query.eq('name', memberIdOrName)
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
    .select('*, reward_types(name, timing, basis, tax, calc_type)')
    .order('type_id')
    .order('sort_order')
  if (error) { console.error('[DB] fetchRewardMaster error:', error); return { data: [], error } }
  const flat = (data || []).map(row => ({
    id: row.type_id,
    name: row.reward_types?.name || '',
    timing: row.reward_types?.timing || '',
    basis: row.reward_types?.basis || '',
    tax: row.reward_types?.tax || '',
    calc_type: row.reward_types?.calc_type || 'rate',
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
  return { data: data || { current: { total: 0, keyman_connect: 0, appo: 0 }, previous: { total: 0, keyman_connect: 0, appo: 0 } }, error }
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

export async function rpcPerfRankingScoped(fromISO, toISO, listId = null) {
  const { data, error } = await supabase.rpc('perf_ranking_scoped', {
    p_from: fromISO, p_to: toISO, p_list_id: listId,
  })
  if (error) console.error('[RPC] perf_ranking_scoped error:', error)
  return { data: data || [], error }
}

export async function rpcPerfCallHeatmap(fromISO, toISO, { getterName = null, getterNames = null, listId = null } = {}) {
  const { data, error } = await supabase.rpc('perf_call_heatmap', {
    p_from: fromISO, p_to: toISO,
    p_getter_name: getterName,
    p_getter_names: getterNames,
    p_list_id: listId,
  })
  if (error) console.error('[RPC] perf_call_heatmap error:', error)
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

  // 1. Edge Function 経由で TUS セッション作成 → uploadUrl + uid を取得
  const { data: du, error: duErr } = await supabase.functions.invoke('cf-stream', {
    body: {
      mode: 'tus_create',
      title: title || file.name,
      filename: file.name,
      filetype: file.type || 'video/mp4',
      fileSize: file.size,
      maxDurationSeconds: 7200,
    },
  });
  if (duErr || du?.error || !du?.uploadUrl || !du?.uid) {
    // Cloudflare からの詳細エラーを優先して表示
    const cfErr = du?.error
      ? (du.detail ? `${du.error}: ${du.detail}` : du.error)
      : (duErr?.message || 'cf tus_create failed');
    console.error('[DB] uploadWeeklyMeetingVideo tus_create error:', cfErr, { duErr, du });
    return { error: new Error(cfErr) };
  }
  const uploadURL = du.uploadUrl;
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
      // SaaS化: rank/position はテナントが後から設定。Sourcing前提のデフォルトを書かない。
      rank: null,
      position: null,
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
  const { data: sourcingEng } = await supabase
    .from('engagements')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', 'seller_sourcing')
    .maybeSingle()
  const engagementId = sourcingEng?.id || null
  if (!engagementId) return

  // 組織側の通知ルールを取得（行が無ければ catalog default を使う）
  const { data: setting } = await supabase
    .from('engagement_notification_settings')
    .select('enabled, recipients_scope')
    .eq('engagement_id', engagementId)
    .eq('notification_type', 'appointment_created')
    .maybeSingle()
  let scope = setting?.recipients_scope
  if (!setting) {
    const { data: cat } = await supabase
      .from('notification_type_catalog')
      .select('default_recipients_scope, is_active')
      .eq('id', 'appointment_created')
      .maybeSingle()
    if (cat?.is_active === false) return
    scope = cat?.default_recipients_scope || 'all_engagement_members'
  } else if (setting.enabled === false) {
    return
  }

  const userIds = await resolveRecipientUserIds({
    orgId, engagementId, scope, getterName: appoData.getter || null,
  })
  if (userIds.length === 0) return

  await supabase.functions.invoke('send-push', {
    body: {
      type: 'appointment_created',
      title: '新しいアポ',
      body: `${appoData.getter || ''} さんが ${appoData.company || ''} のアポイントを取りました`,
      user_ids: userIds,
      org_id: orgId,
      engagement_id: engagementId,
    },
  })
}

// 受信者スコープを解決（client / edge 両方で使える logic）
async function resolveRecipientUserIds({ orgId, engagementId, scope, getterName }) {
  // 全メンバー（事業所属者）の {user_id, name, team} を一括取得
  const { data: assignments } = await supabase
    .from('member_engagements')
    .select('member:members!inner(id, user_id, name, team), role:engagement_roles(name)')
    .eq('org_id', orgId)
    .eq('engagement_id', engagementId)
  const all = (assignments || [])
    .map(a => ({
      user_id: a.member?.user_id || null,
      name: a.member?.name || '',
      team: a.member?.team || null,
      role_name: a.role?.name || null,
    }))
    .filter(x => x.user_id)

  // admins
  const { data: adminUsers } = await supabase
    .from('users')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'admin')
  const adminIds = new Set((adminUsers || []).map(u => u.id))

  if (scope === 'admin_only') {
    return Array.from(adminIds)
  }
  if (scope === 'all_engagement_members') {
    const set = new Set(all.map(x => x.user_id))
    adminIds.forEach(id => set.add(id))
    return Array.from(set)
  }
  if (scope === 'team_leaders_and_above') {
    const set = new Set(all.filter(x => x.role_name === 'リーダー').map(x => x.user_id))
    adminIds.forEach(id => set.add(id))
    return Array.from(set)
  }
  if (scope === 'getter_and_team_and_admin') {
    const set = new Set()
    const getter = getterName ? all.find(x => x.name === getterName) : null
    if (getter?.user_id) set.add(getter.user_id)
    if (getter?.team) {
      all.filter(x => x.team === getter.team && x.role_name === 'リーダー')
        .forEach(x => set.add(x.user_id))
    }
    adminIds.forEach(id => set.add(id))
    return Array.from(set)
  }
  // 不明スコープは admin のみで安全側
  return Array.from(adminIds)
}

// ============================================================
// CRM 新規開拓 (client_lead_lists / _companies / client_call_records)
// ============================================================

export async function fetchClientLeadLists() {
  const orgId = getOrgId()
  if (!orgId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('client_lead_lists')
    .select('*')
    .eq('org_id', orgId)
    .order('imported_at', { ascending: false })
  if (error) console.error('[DB] fetchClientLeadLists error:', error)
  return { data: data || [], error }
}

export async function insertClientLeadList({ name, industry, scriptBody, createdByName }) {
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('client_lead_lists')
    .insert({
      org_id: orgId,
      name,
      industry: industry || null,
      script_body: scriptBody || null,
      created_by_name: createdByName || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertClientLeadList error:', error)
  return { data, error }
}

export async function updateClientLeadList(id, patch) {
  const payload = {}
  if (patch.name !== undefined) payload.name = patch.name
  if (patch.industry !== undefined) payload.industry = patch.industry
  if (patch.scriptBody !== undefined) payload.script_body = patch.scriptBody
  if (patch.isArchived !== undefined) payload.is_archived = patch.isArchived
  const { error } = await supabase
    .from('client_lead_lists')
    .update(payload)
    .eq('id', id)
  if (error) console.error('[DB] updateClientLeadList error:', error)
  return { error }
}

export async function deleteClientLeadList(id) {
  const { error } = await supabase
    .from('client_lead_lists')
    .delete()
    .eq('id', id)
  if (error) console.error('[DB] deleteClientLeadList error:', error)
  return { error }
}

export async function fetchClientLeadCompanies(listId) {
  if (!listId) return { data: [], error: null }
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('client_lead_companies')
    .select('*')
    .eq('org_id', orgId)
    .eq('list_id', listId)
    .order('no', { ascending: true })
  if (error) console.error('[DB] fetchClientLeadCompanies error:', error)
  return { data: data || [], error }
}

export async function insertClientLeadCompaniesBulk(listId, rows) {
  if (!listId || !Array.isArray(rows) || rows.length === 0) return { data: [], error: null }
  const orgId = getOrgId()
  const payload = rows.map((r, i) => ({
    org_id: orgId,
    list_id: listId,
    no: r.no ?? (i + 1),
    company: r.company || '',
    representative: r.representative || null,
    business: r.business || null,
    address: r.address || null,
    prefecture: r.prefecture || null,
    phone: r.phone || null,
    email: r.email || null,
    website: r.website || null,
  }))
  const { data, error } = await supabase
    .from('client_lead_companies')
    .insert(payload)
    .select()
  if (error) console.error('[DB] insertClientLeadCompaniesBulk error:', error)
  return { data: data || [], error }
}

export async function fetchClientCallRecords(listId) {
  if (!listId) return { data: [], error: null }
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('client_call_records')
    .select('*')
    .eq('org_id', orgId)
    .eq('list_id', listId)
    .order('called_at', { ascending: false })
  if (error) console.error('[DB] fetchClientCallRecords error:', error)
  return { data: data || [], error }
}

export async function insertClientCallRecord({ listId, leadCompanyId, round, status, memo, getterName, recordingUrl }) {
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('client_call_records')
    .insert({
      org_id: orgId,
      list_id: listId,
      lead_company_id: leadCompanyId,
      round: round || 1,
      status,
      memo: memo || null,
      getter_name: getterName || null,
      recording_url: recordingUrl || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertClientCallRecord error:', error)
  return { data, error }
}

export async function updateClientCallRecordRecordingUrl(id, recordingUrl) {
  if (!id) { console.warn('[DB] updateClientCallRecordRecordingUrl: no id'); return null }
  const { error } = await supabase
    .from('client_call_records')
    .update({ recording_url: recordingUrl })
    .eq('id', id)
  if (error) console.error('[DB] updateClientCallRecordRecordingUrl error:', error)
  return error
}

export async function deleteClientCallRecordByRound(leadCompanyId, round) {
  if (!leadCompanyId || round == null) return { error: new Error('missing args') }
  const { error } = await supabase
    .from('client_call_records')
    .delete()
    .eq('lead_company_id', leadCompanyId)
    .eq('round', round)
  if (error) console.error('[DB] deleteClientCallRecordByRound error:', error)
  return { error }
}

// 管理者がクライアントの代理ログイン用 magic link を発行
//   - Edge Function 側で email ベースの権限チェックあり（篠宮のみ）
//   - 結果: { url, client_name, client_email_masked } または { error }
export async function invokeAdminImpersonateClient(clientId, redirectPath = '/client') {
  if (!clientId) return { data: null, error: new Error('clientId required') }
  const { data, error } = await supabase.functions.invoke('admin-impersonate-client', {
    body: { client_id: clientId, redirect_path: redirectPath },
  })
  if (error) console.error('[Edge] admin-impersonate-client error:', error)
  return { data, error }
}

// 全リスト横断で「最新ラウンドが再コール待ち」の企業を抽出
//   memo の "[再コール予定: ...]" から予定日時を取り出して付加
export async function fetchAllPendingRecalls() {
  const orgId = getOrgId()
  if (!orgId) return { data: [], error: null }

  const { data: records, error } = await supabase
    .from('client_call_records')
    .select('id, list_id, lead_company_id, round, status, memo, called_at')
    .eq('org_id', orgId)
    .in('status', ['reception_recall', 'keyman_recall'])
    .order('called_at', { ascending: false })
    .limit(500)
  if (error || !records || records.length === 0) {
    return { data: [], error: error || null }
  }

  // 該当 lead_company の最新ラウンドが本当に recall か確認
  const companyIds = [...new Set(records.map(r => r.lead_company_id))]
  const { data: maxRoundRecs } = await supabase
    .from('client_call_records')
    .select('lead_company_id, round, status')
    .eq('org_id', orgId)
    .in('lead_company_id', companyIds)
  const maxRoundByCompany = {}
  ;(maxRoundRecs || []).forEach(r => {
    if (!maxRoundByCompany[r.lead_company_id] || r.round > maxRoundByCompany[r.lead_company_id].round) {
      maxRoundByCompany[r.lead_company_id] = r
    }
  })

  const seen = new Set()
  const pending = []
  for (const r of records) {
    if (seen.has(r.lead_company_id)) continue
    const max = maxRoundByCompany[r.lead_company_id]
    if (!max || (max.status !== 'reception_recall' && max.status !== 'keyman_recall')) continue
    if (max.round !== r.round) continue
    seen.add(r.lead_company_id)
    const m = (r.memo || '').match(/\[再コール予定:\s*(.+?)\]/)
    pending.push({ ...r, recall_at_raw: m ? m[1] : null })
  }

  const leadCompanyIds = pending.map(p => p.lead_company_id)
  const listIds = [...new Set(pending.map(p => p.list_id))]
  const [{ data: leadCompanies }, { data: lists }] = await Promise.all([
    supabase
      .from('client_lead_companies')
      .select('id, no, company, phone, business, representative')
      .eq('org_id', orgId)
      .in('id', leadCompanyIds.length > 0 ? leadCompanyIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('client_lead_lists')
      .select('id, name, industry')
      .eq('org_id', orgId)
      .in('id', listIds.length > 0 ? listIds : ['00000000-0000-0000-0000-000000000000']),
  ])
  const cMap = Object.fromEntries((leadCompanies || []).map(c => [c.id, c]))
  const lMap = Object.fromEntries((lists || []).map(l => [l.id, l]))

  return {
    data: pending.map(p => ({
      ...p,
      company: cMap[p.lead_company_id] || null,
      list: lMap[p.list_id] || null,
    })),
    error: null,
  }
}

// アポ獲得時: clients に新規追加し、lead_company に promoted_to_client_id を保持
export async function promoteLeadCompanyToClient(leadCompany, { contactPerson } = {}) {
  if (!leadCompany?.id || !leadCompany?.company) {
    return { data: null, error: new Error('invalid leadCompany') }
  }
  const orgId = getOrgId()
  // 1) clients に INSERT (status='面談予定')
  const { data: client, error: e1 } = await supabase
    .from('clients')
    .insert({
      org_id: orgId,
      name: leadCompany.company,
      status: '面談予定',
      contract_status: '未',
      industry: leadCompany.business || '',
      contact_person: contactPerson || leadCompany.representative || null,
      contact_phone: leadCompany.phone || null,
      contact_email: leadCompany.email || null,
      status_changed_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (e1) {
    console.error('[DB] promoteLeadCompanyToClient (insert client) error:', e1)
    return { data: null, error: e1 }
  }
  // 2) lead_company に紐付け
  const { error: e2 } = await supabase
    .from('client_lead_companies')
    .update({
      promoted_to_client_id: client.id,
      promoted_at: new Date().toISOString(),
    })
    .eq('id', leadCompany.id)
  if (e2) {
    console.warn('[DB] promoteLeadCompanyToClient (update lead) error:', e2)
  }
  return { data: client, error: null }
}

// ============================================================
// CRM 月別目標 (client_monthly_targets)
// ============================================================

export async function fetchClientMonthlyTargets(fromYearMonth, toYearMonth) {
  const orgId = getOrgId()
  if (!orgId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('client_monthly_targets')
    .select('id, client_id, year_month, target_count')
    .eq('org_id', orgId)
    .gte('year_month', fromYearMonth)
    .lte('year_month', toYearMonth)
  if (error) console.error('[DB] fetchClientMonthlyTargets error:', error)
  return { data: data || [], error }
}

export async function upsertClientMonthlyTarget(clientId, yearMonth, targetCount) {
  if (!clientId || !yearMonth) {
    console.warn('[DB] upsertClientMonthlyTarget: missing args')
    return { data: null, error: new Error('missing args') }
  }
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('client_monthly_targets')
    .upsert(
      {
        org_id: orgId,
        client_id: clientId,
        year_month: yearMonth,
        target_count: Math.max(0, Number(targetCount) || 0),
      },
      { onConflict: 'client_id,year_month' }
    )
    .select('id, client_id, year_month, target_count')
    .single()
  if (error) console.error('[DB] upsertClientMonthlyTarget error:', error)
  return { data, error }
}

export async function deleteClientMonthlyTarget(clientId, yearMonth) {
  if (!clientId || !yearMonth) return { error: new Error('missing args') }
  const orgId = getOrgId()
  const { error } = await supabase
    .from('client_monthly_targets')
    .delete()
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .eq('year_month', yearMonth)
  if (error) console.error('[DB] deleteClientMonthlyTarget error:', error)
  return { error }
}

// ============================================================
// 経営俯瞰 engagement × 月の目標 (engagement_monthly_targets)
// 軸②(クライアント開拓) を商材別に月次目標管理する用
// ============================================================

export async function fetchEngagementMonthlyTargets(fromYearMonth, toYearMonth) {
  const orgId = getOrgId()
  if (!orgId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('engagement_monthly_targets')
    .select('id, engagement_id, year_month, target_count')
    .eq('org_id', orgId)
    .gte('year_month', fromYearMonth)
    .lte('year_month', toYearMonth)
  if (error) console.error('[DB] fetchEngagementMonthlyTargets error:', error)
  return { data: data || [], error }
}

export async function upsertEngagementMonthlyTarget(engagementId, yearMonth, targetCount) {
  if (!engagementId || !yearMonth) {
    return { data: null, error: new Error('missing args') }
  }
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('engagement_monthly_targets')
    .upsert({
      org_id: orgId,
      engagement_id: engagementId,
      year_month: yearMonth,
      target_count: Math.max(0, Number(targetCount) || 0),
    }, { onConflict: 'org_id,engagement_id,year_month' })
    .select('id, engagement_id, year_month, target_count')
    .single()
  if (error) console.error('[DB] upsertEngagementMonthlyTarget error:', error)
  return { data, error }
}

// ============================================================
// Payroll Invoices (給与請求書 - メンバー × 月)
// ============================================================
const PAYROLL_INVOICE_BUCKET = 'payroll-invoices'

const PAYROLL_INVOICE_EXT_FROM_MIME = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

function payrollInvoicePath(orgId, memberId, payMonth, ext) {
  return `${orgId}/${memberId}/${payMonth}.${ext}`
}

export async function uploadPayrollInvoice(memberId, payMonth, file) {
  if (!memberId || !payMonth || !file) {
    return { data: null, error: new Error('invalid args') }
  }
  const orgId = getOrgId()
  const ext = PAYROLL_INVOICE_EXT_FROM_MIME[file.type] || ''
  if (!ext) {
    return { data: null, error: new Error('PDF / PNG / JPG のみアップロード可能です') }
  }
  if (file.size > 5 * 1024 * 1024) {
    return { data: null, error: new Error('ファイルサイズは 5MB 以下にしてください') }
  }

  // 既存ファイル削除（拡張子が変わった場合に古いオブジェクトを残さない）
  const { data: existing } = await supabase
    .from('payroll_invoices')
    .select('storage_path')
    .eq('org_id', orgId)
    .eq('member_id', memberId)
    .eq('pay_month', payMonth)
    .maybeSingle()
  if (existing?.storage_path && existing.storage_path !== payrollInvoicePath(orgId, memberId, payMonth, ext)) {
    await supabase.storage.from(PAYROLL_INVOICE_BUCKET).remove([existing.storage_path])
  }

  const path = payrollInvoicePath(orgId, memberId, payMonth, ext)
  const { error: upErr } = await supabase.storage
    .from(PAYROLL_INVOICE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (upErr) {
    console.error('[DB] uploadPayrollInvoice storage error:', upErr)
    return { data: null, error: upErr }
  }

  const auth = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('payroll_invoices')
    .upsert({
      org_id: orgId,
      member_id: memberId,
      pay_month: payMonth,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      uploaded_at: new Date().toISOString(),
      uploaded_by: auth?.data?.user?.id || null,
    }, { onConflict: 'org_id,member_id,pay_month' })
    .select()
    .single()

  if (error) console.error('[DB] uploadPayrollInvoice insert error:', error)
  return { data, error }
}

export async function fetchPayrollInvoice(memberId, payMonth) {
  if (!memberId || !payMonth) return { data: null, error: new Error('missing args') }
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('payroll_invoices')
    .select('*')
    .eq('org_id', orgId)
    .eq('member_id', memberId)
    .eq('pay_month', payMonth)
    .maybeSingle()
  if (error) console.error('[DB] fetchPayrollInvoice error:', error)
  return { data, error }
}

// 月単位で格納済み請求書の member_id を一覧取得（管理者の Payroll 一覧用）
export async function fetchPayrollInvoicesByMonth(payMonth) {
  if (!payMonth) return { data: [], error: new Error('missing payMonth') }
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('payroll_invoices')
    .select('member_id, file_name, uploaded_at')
    .eq('org_id', orgId)
    .eq('pay_month', payMonth)
  if (error) console.error('[DB] fetchPayrollInvoicesByMonth error:', error)
  return { data: data || [], error }
}

export async function getPayrollInvoiceUrl(storagePath, expiresIn = 600, downloadName) {
  if (!storagePath) return { url: null, error: new Error('no path') }
  // downloadName を渡すと Supabase が Content-Disposition で
  // 指定ファイル名でダウンロードさせる（?download=... クエリ）
  const options = downloadName ? { download: downloadName } : undefined
  const { data, error } = await supabase.storage
    .from(PAYROLL_INVOICE_BUCKET)
    .createSignedUrl(storagePath, expiresIn, options)
  if (error) console.error('[DB] getPayrollInvoiceUrl error:', error)
  return { url: data?.signedUrl || null, error }
}

// ── 請求書プロフィール（振込先・住所などメンバー単位の常駐情報） ──
export async function fetchMemberInvoiceProfile(memberId) {
  if (!memberId) return { data: null, error: new Error('missing memberId') }
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('member_invoice_profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('member_id', memberId)
    .maybeSingle()
  if (error) console.error('[DB] fetchMemberInvoiceProfile error:', error)
  return { data, error }
}

export async function upsertMemberInvoiceProfile(memberId, patch) {
  if (!memberId) return { data: null, error: new Error('missing memberId') }
  const orgId = getOrgId()
  const row = {
    member_id: memberId,
    org_id: orgId,
    postal_code: patch.postalCode ?? '',
    address: patch.address ?? '',
    phone: patch.phone ?? '',
    email: patch.email ?? '',
    tax_invoice_number: patch.taxInvoiceNumber ?? '',
    bank_name: patch.bankName ?? '',
    branch_name: patch.branchName ?? '',
    account_type: patch.accountType || '普通',
    account_number: patch.accountNumber ?? '',
    account_holder_kana: patch.accountHolderKana ?? '',
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('member_invoice_profiles')
    .upsert(row, { onConflict: 'member_id' })
    .select()
    .single()
  if (error) console.error('[DB] upsertMemberInvoiceProfile error:', error)
  return { data, error }
}

// ── メンバー × 月 単位の任意調整項目（特別ボーナス/控除） ──
// 既存 payroll_adjustments は org 全体の月次ディスカウントで別物
export async function fetchMemberPayrollAdjustments(memberId, payMonth) {
  if (!memberId || !payMonth) return { data: [], error: new Error('missing args') }
  const orgId = getOrgId()
  const { data, error } = await supabase
    .from('payroll_member_adjustments')
    .select('*')
    .eq('org_id', orgId)
    .eq('member_id', memberId)
    .eq('pay_month', payMonth)
    .order('created_at', { ascending: true })
  if (error) console.error('[DB] fetchMemberPayrollAdjustments error:', error)
  return { data: data || [], error }
}

export async function insertMemberPayrollAdjustment({ memberId, payMonth, label, amount, note }) {
  if (!memberId || !payMonth) return { data: null, error: new Error('missing args') }
  const orgId = getOrgId()
  const { data: { user } = {} } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('payroll_member_adjustments')
    .insert({
      org_id: orgId,
      member_id: memberId,
      pay_month: payMonth,
      label: label || '',
      amount: parseInt(amount) || 0,
      note: note || '',
      created_by: user?.id || null,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertMemberPayrollAdjustment error:', error)
  return { data, error }
}

export async function updateMemberPayrollAdjustment(id, patch) {
  if (!id) return { data: null, error: new Error('missing id') }
  const row = { updated_at: new Date().toISOString() }
  if (patch.label !== undefined) row.label = patch.label || ''
  if (patch.amount !== undefined) row.amount = parseInt(patch.amount) || 0
  if (patch.note !== undefined) row.note = patch.note || ''
  const { data, error } = await supabase
    .from('payroll_member_adjustments')
    .update(row)
    .eq('id', id)
    .select()
    .single()
  if (error) console.error('[DB] updateMemberPayrollAdjustment error:', error)
  return { data, error }
}

export async function deleteMemberPayrollAdjustment(id) {
  if (!id) return { error: new Error('missing id') }
  const { error } = await supabase
    .from('payroll_member_adjustments')
    .delete()
    .eq('id', id)
  if (error) console.error('[DB] deleteMemberPayrollAdjustment error:', error)
  return { error }
}

export async function deletePayrollInvoice(memberId, payMonth) {
  if (!memberId || !payMonth) return { error: new Error('missing args') }
  const orgId = getOrgId()
  const { data: row } = await supabase
    .from('payroll_invoices')
    .select('storage_path')
    .eq('org_id', orgId)
    .eq('member_id', memberId)
    .eq('pay_month', payMonth)
    .maybeSingle()
  if (row?.storage_path) {
    await supabase.storage.from(PAYROLL_INVOICE_BUCKET).remove([row.storage_path])
  }
  const { error } = await supabase
    .from('payroll_invoices')
    .delete()
    .eq('org_id', orgId)
    .eq('member_id', memberId)
    .eq('pay_month', payMonth)
  if (error) console.error('[DB] deletePayrollInvoice error:', error)
  return { error }
}

// ============================================================
// 事業俯瞰「リスト分析」セクション
// ============================================================

/** アクティブな全リストの進捗・停滞度・ドリルダウン件数を一括取得 */
export async function fetchListAnalysisSummary() {
  const orgId = getOrgId()
  if (!orgId) return { data: [], error: null }
  const { data, error } = await supabase.rpc('list_analysis_summary', { p_org_id: orgId })
  if (error) console.error('[DB] fetchListAnalysisSummary error:', error)
  return { data: data || [], error }
}

/**
 * 事業俯瞰リスト分析: リスト状況フォローアップメールを Claude (Haiku 4.5) で生成。
 * 篠宮の文体ガイドとリスト数字を Edge Function に渡し、件名と本文を受け取る。
 *
 * @param {Object} payload
 * @param {Object} payload.listContext   リストの各種数字
 * @param {Array}  payload.recipients    [{ name, email }] 宛先
 * @param {Array}  payload.ccRecipients  [{ name, email }] CC (空配列可)
 * @param {string} payload.userIntent    篠宮の自然言語指示
 * @returns {Promise<{ subject: string, body: string, error?: any }>}
 */
export async function invokeGenListFollowupEmail(payload) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return { subject: '', body: '', error: new Error('not authenticated') }
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gen-list-followup-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[invokeGenListFollowupEmail] HTTP', res.status, json)
      return { subject: '', body: '', error: new Error(json.error || `HTTP ${res.status}`) }
    }
    return { subject: json.subject || '', body: json.body || '' }
  } catch (e) {
    console.error('[invokeGenListFollowupEmail] error:', e)
    return { subject: '', body: '', error: e }
  }
}

// ============================================================
// CRM クライアント詳細「面談記録」CRUD + AI 解析呼び出し
// ============================================================

/** あるクライアントの面談記録を一覧取得 (sort_order 昇順、未設定は meeting_at で fallback) */
export async function fetchClientMeetings(clientId) {
  if (!clientId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('client_meetings')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('meeting_at', { ascending: true })
  if (error) console.error('[DB] fetchClientMeetings error:', error)
  return { data: data || [], error }
}

/** 全クライアントの「最終面談日」(client_meetings.meeting_at の最大値) を一括取得 */
export async function fetchLastMeetingByClient() {
  const orgId = getOrgId()
  if (!orgId) return { data: {}, error: null }
  const { data, error } = await supabase
    .from('client_meetings')
    .select('client_id, meeting_at')
    .eq('org_id', orgId)
  if (error) { console.error('[DB] fetchLastMeetingByClient error:', error); return { data: {}, error } }
  const map = {}
  ;(data || []).forEach(r => {
    if (!r.client_id || !r.meeting_at) return
    if (!map[r.client_id] || r.meeting_at > map[r.client_id]) {
      map[r.client_id] = r.meeting_at
    }
  })
  return { data: map, error: null }
}

/** 面談記録の表示順を一括更新 (ドラッグ並び替え) */
export async function reorderClientMeetings(orderedIds) {
  if (!orderedIds || orderedIds.length === 0) return { error: null }
  // 1000 刻みで再採番 (将来的に間に挿入する余地を残す)
  const ops = orderedIds.map((id, idx) =>
    supabase.from('client_meetings').update({ sort_order: (idx + 1) * 1000 }).eq('id', id)
  )
  const results = await Promise.all(ops)
  const err = results.find(r => r.error)?.error || null
  if (err) console.error('[DB] reorderClientMeetings error:', err)
  return { error: err }
}

/** 面談記録を新規作成 */
export async function insertClientMeeting({ clientId, title, meetingAt, summary = '', nextAction = '', createdBy = null }) {
  const orgId = getOrgId()
  if (!orgId || !clientId) return { data: null, error: new Error('missing args') }
  const { data, error } = await supabase
    .from('client_meetings')
    .insert({
      org_id: orgId, client_id: clientId,
      title: title || '面談',
      meeting_at: meetingAt || new Date().toISOString(),
      summary, next_action: nextAction, created_by: createdBy,
    })
    .select()
    .single()
  if (error) console.error('[DB] insertClientMeeting error:', error)
  return { data, error }
}

/** 面談記録の更新 (タイトル/日時/概要/Next Action/録音URL等の任意フィールド) */
export async function updateClientMeeting(meetingId, patch) {
  if (!meetingId) return { error: new Error('missing meetingId') }
  const allowed = ['title', 'meeting_at', 'recording_url', 'summary', 'next_action', 'transcript', 'sort_order']
  const update = {}
  for (const k of allowed) if (k in patch) update[k] = patch[k]
  const { error } = await supabase
    .from('client_meetings')
    .update(update)
    .eq('id', meetingId)
  if (error) console.error('[DB] updateClientMeeting error:', error)
  return { error }
}

/** 面談記録の削除 */
export async function deleteClientMeeting(meetingId) {
  if (!meetingId) return { error: new Error('missing meetingId') }
  const { error } = await supabase
    .from('client_meetings')
    .delete()
    .eq('id', meetingId)
  if (error) console.error('[DB] deleteClientMeeting error:', error)
  return { error }
}

/**
 * 面談録音を Supabase Storage にアップロードして public URL を返す。
 * パス: meetings/{client_id}/{meeting_id}/{timestamp}_{filename}
 */
export async function uploadMeetingRecording({ clientId, meetingId, file }) {
  if (!clientId || !meetingId || !file) return { url: null, error: new Error('missing args') }
  const ts = Date.now()
  const safeName = (file.name || 'rec').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `meetings/${clientId}/${meetingId}/${ts}_${safeName}`
  const { error: upErr } = await supabase.storage
    .from('recordings')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (upErr) {
    console.error('[Storage] uploadMeetingRecording error:', upErr)
    return { url: null, error: upErr }
  }
  const { data: pub } = supabase.storage.from('recordings').getPublicUrl(path)
  return { url: pub?.publicUrl || null, error: null }
}

/** AI 解析を起動 (fire-and-forget、フロントは summary をポーリングして完了検知) */
export async function invokeSummarizeMeetingRecording({ meetingId, recordingUrl }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return { error: new Error('not authenticated') }
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-meeting-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ meeting_id: meetingId, recording_url: recordingUrl }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { error: new Error(json.error || `HTTP ${res.status}`) }
    return { ok: true }
  } catch (e) {
    console.error('[invokeSummarizeMeetingRecording] error:', e)
    return { error: e }
  }
}

/** 事業俯瞰「クライアントフォロー」: 支援中以外のクライアント集計を取得 */
export async function fetchClientFollowSummary() {
  const orgId = getOrgId()
  if (!orgId) return { data: [], error: null }
  const { data, error } = await supabase.rpc('client_follow_summary', { p_org_id: orgId })
  if (error) console.error('[DB] fetchClientFollowSummary error:', error)
  return { data: data || [], error }
}

/** 事業俯瞰リスト分析の ToDo メモを保存 (リスト単位の Next Action) */
export async function updateListTodoMemo(listId, todoMemo) {
  const orgId = getOrgId()
  if (!orgId || !listId) return { error: new Error('missing args') }
  const { error } = await supabase
    .from('call_lists')
    .update({ todo_memo: todoMemo || '' })
    .eq('id', listId)
    .eq('org_id', orgId)
  if (error) console.error('[DB] updateListTodoMemo error:', error)
  return { error }
}

/**
 * リスト × 状態 で該当企業の一覧を取得 (件数バッジクリック時のドリルダウン)
 * @param {string} listId
 * @param {'rescheduling'|'keyman_recall'|'keyman_reject_high_med'} kind
 */
export async function fetchListDrillDown(listId, kind) {
  const orgId = getOrgId()
  if (!orgId || !listId || !kind) return { data: [], error: null }
  const { data, error } = await supabase.rpc('list_drill_down', {
    p_org_id: orgId,
    p_list_id: listId,
    p_kind: kind,
  })
  if (error) console.error('[DB] fetchListDrillDown error:', error)
  return { data: data || [], error }
}
