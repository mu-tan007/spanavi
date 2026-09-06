import { describe, expect, it } from 'vitest';
import { calendarAppointment, calendarListContactIds, calendarMonth, jstDate, meetingTimestampTime, shiftCalendarMonth } from './appointmentCalendar';

const base = { id: 'a', company_name: '訪問先株式会社', list_id: 'list-a', meeting_date: '2026-09-09T00:00:00+00:00', meeting_time: '14:15', meeting_location: '〒160-0016 東京都新宿区信濃町', status: 'アポ取得' };

describe('当社登録アポの面談日時・訪問先', () => {
  it('端末のタイムゾーンに関係なく日本時間の日付で表示する', () => {
    expect(jstDate('2026-09-08T15:30:00Z')).toBe('2026-09-09');
    expect(jstDate('2026-09-09T00:30')).toBe('2026-09-09');
    expect(jstDate('2026-09-09')).toBe('2026-09-09');
  });
  it('30分刻み以外の開始時刻と、郵便番号付き住所の都道府県を残す', () => {
    expect(calendarAppointment(base)).toMatchObject({ date: '2026-09-09', time: '14:15', area: '東京都', location: base.meeting_location });
  });
  it('変更前の報告日ではなく、現在のDBの面談日・時刻を表示する', () => {
    expect(calendarAppointment({ ...base, report_data: { appoDate: '2026-08-01', appoTime: '09:00' } })).toMatchObject({ date: '2026-09-09', time: '14:15' });
  });
  it('別の日の古い報告時刻を補完せず時刻未登録にする', () => {
    expect(calendarAppointment({ ...base, meeting_time: null, report_data: { appoDate: '2026-08-01', appoTime: '09:00' } }).time).toBe('');
  });
  it('日付だけのUTC午前0時から09:00を捏造しない', () => {
    expect(calendarAppointment({ ...base, meeting_time: null }).time).toBe('');
    expect(meetingTimestampTime('2026-09-08T15:00:00Z')).toBe('');
    expect(meetingTimestampTime('2026-09-09T00:00:00+09:00')).toBe('');
    expect(meetingTimestampTime('2026-09-09T04:30:00Z')).toBe('13:30');
  });
  it('同じ面談日の旧報告から時刻・訪問先を補完できる', () => {
    expect(calendarAppointment({ ...base, meeting_time: null, meeting_location: null, appo_report: '面談日時：2026-09-09（水） 8:45〜\\n訪問先：大阪府大阪市北区' })).toMatchObject({ time: '08:45', area: '大阪府' });
  });
  it('実際の訪問先を使い、オンラインを訪問と表示しない', () => {
    expect(calendarAppointment({ ...base, is_online: true })).toMatchObject({ online: true, area: 'オンライン' });
    expect(calendarAppointment({ ...base, meeting_location: '本社' }).area).toBe('都道府県未登録');
  });
  it('報告内の明示的なオンラインにも対応する', () => {
    expect(calendarAppointment({ ...base, report_data: { meeting_format: 'オンライン' } }).area).toBe('オンライン');
    expect(calendarAppointment({ ...base, is_online: false, report_data: { meeting_format: 'オンライン' } }).area).toBe('東京都');
  });
  it('キャンセル・日付削除・未確定リスケを予定として復活させない', () => {
    expect(calendarAppointment({ ...base, status: 'キャンセル' })).toBeNull();
    expect(calendarAppointment({ ...base, meeting_date: null, report_data: { appoDate: '2026-09-09' } })).toBeNull();
    expect(calendarAppointment({ ...base, status: 'リスケ中' })).toBeNull();
  });
  it('確定したリスケ先の日時を使う', () => {
    expect(calendarAppointment({ ...base, status: 'リスケ中', rescheduled_at: '2026-10-01T10:45:00Z' })).toMatchObject({ date: '2026-10-01', time: '10:45', status: '日程変更' });
    expect(calendarAppointment({ ...base, status: 'リスケ中', rescheduled_at: '2026-09-30T23:30:00+00:00' })).toMatchObject({ date: '2026-09-30', time: '23:30' });
  });
  it('面談済の過去の記録も残す', () => {
    expect(calendarAppointment({ ...base, status: '面談済' }).status).toBe('面談済');
  });
});

describe('担当者の範囲', () => {
  const contacts = [{ id: 'takano', name: '高野 柊平' }, { id: 'arai', name: '新井 将也' }];
  it('担当IDが正なら、古い担当者名から他担当を混ぜない', () => {
    expect(calendarListContactIds({ contact_ids: ['arai'], manager_name: '高野' }, contacts)).toEqual(['arai']);
  });
  it('旧contact_idと姓だけの担当名を解決する', () => {
    expect(calendarListContactIds({ contact_id: 'takano' }, contacts)).toEqual(['takano']);
    expect(calendarListContactIds({ manager_name: '高野' }, contacts)).toEqual(['takano']);
    expect(calendarListContactIds({ manager_name: '高野　柊平' }, contacts)).toEqual(['takano']);
  });
  it('同姓が複数いるときは推測しない・同名の他社IDを混ぜない', () => {
    expect(calendarListContactIds({ manager_name: '高野' }, [...contacts, { id: 'other', name: '高野 次郎' }])).toEqual([]);
    expect(calendarListContactIds({ contact_ids: ['another-client-contact'], manager_name: '高野' }, contacts)).toEqual([]);
  });
  it('複数担当の案件を保持する', () => {
    expect(calendarListContactIds({ manager_name: '高野 or 新井' }, contacts)).toEqual(['takano', 'arai']);
  });
});

describe('月の移動', () => {
  it('年越し・閏年・月末を扱う', () => {
    expect(shiftCalendarMonth('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftCalendarMonth('2026-01-31', -1)).toBe('2025-12-01');
    expect(calendarMonth('2028-02-01').days).toHaveLength(29);
    expect(calendarMonth('2026-09-06')).toMatchObject({ start: '2026-09-01', next: '2026-10-01', offset: 2 });
  });
});
