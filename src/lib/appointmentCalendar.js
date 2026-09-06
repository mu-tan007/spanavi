import { supabase } from './supabase';
import { getOrgId } from './orgContext';
import { calendarAppointment, calendarListContactIds } from '../utils/appointmentCalendar';

async function allPages(queryPage) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryPage(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

// 利用者本人のセッションとRLSで読む。管理者用キーや全社アポの初期取得には依存しない。
export async function fetchContactCalendarScope({ clientId, contactId }) {
  if (!clientId || !contactId) throw new Error('担当者を特定できませんでした');
  const orgId = getOrgId();
  const [contacts, lists] = await Promise.all([
    allPages((from, to) => supabase.from('client_contacts').select('id,name').eq('org_id', orgId).eq('client_id', clientId).order('id').range(from, to)),
    allPages((from, to) => supabase.from('call_lists').select('id,contact_id,contact_ids,manager_name').eq('org_id', orgId).eq('client_id', clientId).order('id').range(from, to)),
  ]);
  if (!contacts.some(contact => contact.id === contactId)) throw new Error('担当者情報を取得できませんでした');
  return { clientId, orgId, listContacts: new Map(lists.map(list => [list.id, calendarListContactIds(list, contacts)])), contactId };
}

export async function fetchContactAppointments({ clientId, contactId, start, next }) {
  const { orgId, listContacts } = await fetchContactCalendarScope({ clientId, contactId });
  const startAt = `${start}T00:00:00+09:00`;
  const endAt = `${next}T00:00:00+09:00`;
  const rows = await allPages((from, to) => supabase.from('appointments')
    .select('id,company_name,list_id,meeting_date,meeting_time,meeting_location,is_online,status,rescheduled_at,report_data,appo_report')
    .eq('org_id', orgId).eq('client_id', clientId)
    // rescheduled_atは事前確認画面のローカル入力がUTCの文字列として保存されている。
    // 表示と同じ月境界にし、月末夜のリスケ先を取りこぼさない。
    .or(`and(meeting_date.gte.${startAt},meeting_date.lt.${endAt}),and(rescheduled_at.gte.${start}T00:00:00Z,rescheduled_at.lt.${next}T00:00:00Z)`)
    .order('id').range(from, to));
  return rows.filter(row => listContacts.get(row.list_id)?.includes(contactId))
    .map(row => {
      const appointment = calendarAppointment(row);
      return appointment ? { ...appointment, shared: listContacts.get(row.list_id).length > 1 } : null;
    })
    .filter(row => row && row.date >= start && row.date < next)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99') || a.id.localeCompare(b.id));
}
