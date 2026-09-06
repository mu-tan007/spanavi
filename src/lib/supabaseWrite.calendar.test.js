import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { from, notify, payroll, state, requests } = vi.hoisted(() => ({
  from: vi.fn(), notify: vi.fn(), payroll: vi.fn(), state: {}, requests: [],
}));
vi.mock('./supabase', () => ({ supabase: { from, auth: {}, functions: { invoke: vi.fn() } } }));
vi.mock('./orgContext', () => ({ getOrgId: () => 'our-org' }));
vi.mock('../hooks/useCallStatuses', () => ({ statusIdToLabel: value => value }));
vi.mock('./payrollAutoSync', () => ({ enqueuePayrollSyncForMeetingDates: payroll }));
vi.mock('./appointmentEvents', () => ({ notifyAppointmentsChanged: notify }));

import { deleteAppointment, insertAppointment, updateAppointment, updateAppointmentReport, updatePreCheckResult } from './supabaseWrite';

const engagementId = '12345678-1234-1234-1234-123456789abc';
const appointment = {
  id: 'appointment-1', org_id: 'our-org', client_id: 'fullerene', list_id: 'takano-list',
  meeting_date: '2026-09-10', meeting_time: '14:00', meeting_location: '東京都千代田区',
  is_online: false, status: 'アポ取得', rescheduled_at: null, company_name: 'テスト企業',
  report_data: { address: '東京都千代田区' }, appo_report: '訪問予定',
};
const edit = { company: 'テスト企業', meetDate: '2026-10-10', status: 'アポ取得' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  requests.length = 0;
  Object.assign(state, { before: { ...appointment }, result: { ...appointment, meeting_date: edit.meetDate }, readError: null, writeError: null });
  from.mockImplementation(table => {
    const request = { table, operation: 'read', select: '*', filters: [] };
    requests.push(request);
    const resolve = single => {
      const write = request.operation !== 'read';
      const error = table === 'appointments' ? (write ? state.writeError : state.readError) : null;
      let row = table === 'appointments' ? (write ? state.result : state.before)
        : table === 'call_lists' ? { client_id: 'fullerene', engagement_id: engagementId } : null;
      if (row && request.select !== '*') {
        row = Object.fromEntries(request.select.split(',').map(field => field.trim()).map(field => [field, row[field]]));
      }
      return { data: error ? null : single ? row : row ? [row] : [], error };
    };
    const query = {
      select: vi.fn((fields = '*') => { request.select = fields; return query; }),
      eq: vi.fn((key, value) => { request.filters.push([key, value]); return query; }),
      update: vi.fn(payload => { request.operation = 'update'; request.payload = payload; return query; }),
      insert: vi.fn(payload => { request.operation = 'insert'; request.payload = payload; return query; }),
      delete: vi.fn(() => { request.operation = 'delete'; return query; }),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(async () => {
        const result = resolve(true);
        return result.data || result.error ? result : { data: null, error: new Error('No rows') };
      }),
      maybeSingle: vi.fn(async () => resolve(true)),
      then: (fulfilled, rejected) => Promise.resolve(resolve(false)).then(fulfilled, rejected),
    };
    return query;
  });
});

afterEach(() => vi.restoreAllMocks());

describe.each([
  ['アポ編集', () => updateAppointment(appointment.id, edit), 'update'],
  ['事前確認のリスケ・キャンセル', () => updatePreCheckResult(appointment.id, { status: 'キャンセル' }), 'update'],
  ['アポ削除', () => deleteAppointment(appointment.id), 'delete'],
])('%s のカレンダー保存通知', (_label, save, operation) => {
  it('DB保存が成功した行の変更前後を通知する', async () => {
    expect(await save()).toBeNull();
    expect(notify).toHaveBeenCalledExactlyOnceWith({
      id: appointment.id, operation, old: appointment, new: operation === 'delete' ? null : state.result,
    });
    const mutation = requests.find(request => request.operation === operation);
    expect(mutation.filters).toContainEqual(['id', appointment.id]);
    expect(payroll).toHaveBeenCalledTimes(1);
  });

  it('対象なし・RLSによる0行では通知も報酬再計算もしない', async () => {
    state.result = null;
    expect(await save()).toBeInstanceOf(Error);
    expect(notify).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
  });

  it('DB書き込みが失敗したら通知しない', async () => {
    state.writeError = new Error('write failed');
    expect(await save()).toBe(state.writeError);
    expect(notify).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
  });

  it('変更前の取得が失敗したら書き込みも通知もしない', async () => {
    state.readError = new Error('read failed');
    expect(await save()).toBe(state.readError);
    expect(requests.every(request => request.operation === 'read')).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
  });
});

describe('保存経路ごとの通知内容', () => {
  it('アポ編集はDBが確定した面談時刻を返し、旧月と新月の報酬再計算を維持する', async () => {
    state.result.meeting_time = '16:45';
    await updateAppointment(appointment.id, { ...edit, meetTime: '16:45' });
    expect(notify.mock.calls[0][0].new.meeting_time).toBe('16:45');
    expect(payroll).toHaveBeenCalledExactlyOnceWith(appointment.meeting_date, edit.meetDate);
  });

  it('事前確認からのリスケを確定後の日時・ステータスで通知する', async () => {
    const rescheduledAt = '2026-10-11T13:30:00+09:00';
    state.result = { ...appointment, status: 'リスケ中', rescheduled_at: rescheduledAt };
    await updatePreCheckResult(appointment.id, { status: 'リスケ中', rescheduledAt });
    expect(notify.mock.calls[0][0].new).toMatchObject({ status: 'リスケ中', rescheduled_at: rescheduledAt });
    expect(payroll).toHaveBeenCalledExactlyOnceWith(appointment.meeting_date);
  });

  it('報告のスタイル・補足だけを変更してもカレンダー通知しない', async () => {
    expect(await updateAppointmentReport(appointment.id, { style: 'Slack', supplement: '補足' })).toEqual({ error: null });
    expect(requests[0].payload).toEqual({ report_style: 'Slack', report_supplement: '補足' });
    expect(notify).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
  });

  it.each([false, true])('アポ取得報告の保存は必要な列だけを通知する（上書き: %s）', async existing => {
    state.before = existing ? { ...appointment, item_id: 'item-1', sales_amount: 10000 } : null;
    state.result = { ...appointment, meeting_date: edit.meetDate, sales_amount: 10000, intern_reward: 1000, recording_url: 'private-url' };
    const { result, error } = await insertAppointment({
      company: appointment.company_name, list_id: appointment.list_id,
      getDate: '2026-09-01', meetDate: edit.meetDate, getter: 'テスト担当',
    }, engagementId);
    expect(error).toBeNull();
    expect(result).toBe(state.result);
    expect(notify).toHaveBeenCalledExactlyOnceWith({
      id: appointment.id, operation: existing ? 'update' : 'insert',
      old: existing ? appointment : null, new: { ...appointment, meeting_date: edit.meetDate },
    });
    expect(payroll).toHaveBeenCalledExactlyOnceWith(existing ? appointment.meeting_date : null, edit.meetDate);
  });

  it('アポ取得報告が保存できなかった場合は通知しない', async () => {
    state.before = null;
    state.writeError = new Error('insert failed');
    const { error } = await insertAppointment({ company: 'テスト企業' }, engagementId);
    expect(error).toBe(state.writeError);
    expect(notify).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
  });
});
