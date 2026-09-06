import { beforeEach, describe, expect, it, vi } from 'vitest';
const { from, tableRows, requests, failures } = vi.hoisted(() => ({ from: vi.fn(), tableRows: {}, requests: [], failures: {} }));
vi.mock('./supabase', () => ({ supabase: { from } }));
vi.mock('./orgContext', () => ({ getOrgId: () => 'our-org' }));
import { fetchContactAppointments } from './appointmentCalendar';

beforeEach(() => {
  requests.length = 0;
  Object.keys(failures).forEach(key => delete failures[key]);
  tableRows.client_contacts = [{ id: 'takano', name: '高野 柊平' }, { id: 'arai', name: '新井 将也' }];
  tableRows.call_lists = [{ id: 'list1', contact_ids: ['takano'] }, { id: 'list2', contact_ids: ['takano'] }, { id: 'list3', contact_ids: ['arai'] }];
  tableRows.appointments = [];
  from.mockImplementation(table => {
    const request = { table, filters: [] }; requests.push(request);
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn((key, value) => { request.filters.push([key, value]); return query; }),
      or: vi.fn(value => { request.or = value; return query; }), order: vi.fn().mockReturnThis(),
      range: vi.fn(async (start, end) => ({ data: tableRows[table].slice(start, end + 1), error: failures[table] || null })),
    };
    return query;
  });
});

const options = { clientId: 'fullerene', contactId: 'takano', start: '2026-09-01', next: '2026-10-01' };
const appointment = (id, listId = 'list1') => ({ id, list_id: listId, meeting_date: '2026-09-09T00:00:00Z', meeting_time: '14:00', company_name: '企業', status: 'アポ取得' });

describe('担当者カレンダー取得', () => {
  it('同じ担当の別リストを含め、他担当・日付変更で月外になった予定を除く', async () => {
    tableRows.appointments = [appointment('a'), appointment('b', 'list2'), appointment('c', 'list3'), { ...appointment('d'), status: 'リスケ中', rescheduled_at: '2026-10-01T10:00:00+09:00' }];
    expect((await fetchContactAppointments(options)).map(row => row.id)).toEqual(['a', 'b']);
    for (const request of requests) expect(request.filters).toEqual(expect.arrayContaining([['org_id', 'our-org'], ['client_id', 'fullerene']]));
    expect(requests.find(request => request.table === 'appointments').or).toContain('rescheduled_at.gte.2026-09-01T00:00:00Z,rescheduled_at.lt.2026-10-01T00:00:00Z');
  });
  it('ページ上限を超えても全件読む', async () => {
    tableRows.appointments = Array.from({ length: 501 }, (_, i) => appointment(String(i)));
    expect(await fetchContactAppointments(options)).toHaveLength(501);
  });
  it('保存後の再取得で新規追加・日時変更・キャンセル・削除を反映する', async () => {
    expect(await fetchContactAppointments(options)).toEqual([]);
    tableRows.appointments = [appointment('a')];
    expect(await fetchContactAppointments(options)).toHaveLength(1);
    tableRows.appointments[0].meeting_time = '15:15';
    expect((await fetchContactAppointments(options))[0].time).toBe('15:15');
    tableRows.appointments[0].status = 'キャンセル';
    expect(await fetchContactAppointments(options)).toEqual([]);
    tableRows.appointments = [];
    expect(await fetchContactAppointments(options)).toEqual([]);
  });
  it('取得失敗を予定なしとして返さない', async () => {
    failures.appointments = new Error('offline');
    await expect(fetchContactAppointments(options)).rejects.toThrow('offline');
    failures.call_lists = new Error('lists unavailable');
    await expect(fetchContactAppointments(options)).rejects.toThrow('lists unavailable');
  });
  it('対象担当者が取得できなければエラーにする', async () => {
    tableRows.client_contacts = [];
    await expect(fetchContactAppointments(options)).rejects.toThrow('担当者情報');
  });
});
