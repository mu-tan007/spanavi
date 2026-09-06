import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/appointmentCalendar', () => ({ fetchContactAppointments: vi.fn(), fetchContactCalendarScope: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { channel: vi.fn(), removeChannel: vi.fn() } }));
import { fetchContactAppointments, fetchContactCalendarScope } from '../../lib/appointmentCalendar';
import { supabase } from '../../lib/supabase';
import { notifyAppointmentsChanged } from '../../lib/appointmentEvents';
import AppointmentCalendarPanel from './AppointmentCalendarPanel';
import MultiCalendarPanel from './MultiCalendarPanel';

let renderer;
let databaseListeners;
let connectionListener;
const contact = { id: 'takano', name: '高野 柊平' };
const saved = { id: 'appo1', date: '2026-09-09', time: '14:15', company: '検証用訪問先', area: '東京都', location: '東京都新宿区', status: 'アポ取得', online: false, listId: 'takano-list' };
const rawSaved = { id: saved.id, client_id: 'fullerene', list_id: 'takano-list', company_name: saved.company, meeting_date: '2026-09-09T00:00:00Z', meeting_time: saved.time, meeting_location: saved.location, is_online: false, status: saved.status };
const contents = () => JSON.stringify(renderer.toJSON());
const button = label => renderer.root.findAllByType('button').find(node => node.props['aria-label'] === label || node.children.includes(label));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T01:00:00Z'));
  const win = Object.assign(new EventTarget(), {
    innerWidth: 1280, location: { search: '' }, setInterval, clearInterval,
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  fetchContactAppointments.mockReset().mockResolvedValue([]);
  fetchContactCalendarScope.mockReset().mockResolvedValue({ clientId: 'fullerene', contactId: 'takano', orgId: 'our-org', listContacts: new Map([['takano-list', ['takano']], ['arai-list', ['arai']]]) });
  databaseListeners = {};
  supabase.removeChannel.mockReset();
  supabase.channel.mockReset().mockImplementation(() => {
    const channel = {
      on: vi.fn((type, filter, callback) => { databaseListeners[filter.event] = callback; return channel; }),
      subscribe: vi.fn(callback => { connectionListener = callback; return channel; }),
    };
    return channel;
  });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  renderer = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount() {
  await act(async () => { renderer = create(<AppointmentCalendarPanel clientId="fullerene" contact={contact} />); });
}

describe('架電画面の当社登録アポカレンダー', () => {
  it('アポデータを親から渡さなくても保存通知で読み直し、日時と訪問先を表示する', async () => {
    await mount();
    expect(contents()).toContain('0件の面談予定');
    fetchContactAppointments.mockResolvedValue([saved]);
    await act(async () => { notifyAppointmentsChanged({ id: saved.id, operation: 'insert', new: rawSaved }); });
    expect(contents()).toContain('14:15');
    await act(async () => { button('2026-09-09 1件 14:15 東京都 検証用訪問先').props.onClick(); });
    expect(contents()).toContain('東京都新宿区');
    expect(contents()).toContain('検証用訪問先');
    expect(fetchContactAppointments).toHaveBeenCalledTimes(2);
  });
  it('月送り・任意の日付指定・今日への復帰で対象期間が変わる', async () => {
    await mount();
    await act(async () => { button('翌月').props.onClick(); });
    expect(fetchContactAppointments).toHaveBeenLastCalledWith(expect.objectContaining({ start: '2026-10-01', next: '2026-11-01' }));
    const input = renderer.root.findAllByType('input').find(node => node.props.type === 'date');
    await act(async () => { input.props.onChange({ target: { value: '2025-12-31' } }); });
    expect(fetchContactAppointments).toHaveBeenLastCalledWith(expect.objectContaining({ start: '2025-12-01', next: '2026-01-01' }));
    await act(async () => { button('今日').props.onClick(); });
    expect(contents()).toContain('2026/09/06');
  });
  it('取得失敗は明示し、更新ボタンで復旧できる', async () => {
    fetchContactAppointments.mockRejectedValue(new Error('offline'));
    await mount();
    expect(contents()).toContain('予定を取得できませんでした');
    expect(contents()).not.toContain('この日の当社登録アポはありません');
    fetchContactAppointments.mockResolvedValue([]);
    await act(async () => { button('更新').props.onClick(); });
    expect(contents()).toContain('この日の当社登録アポはありません');
  });
  it('遅れて届いた前の担当者の予定を新担当者の欄へ出さない', async () => {
    let resolveOld;
    fetchContactAppointments.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await mount();
    await act(async () => { renderer.update(<AppointmentCalendarPanel clientId="fullerene" contact={{ id: 'arai', name: '新井 将也' }} />); });
    await act(async () => { resolveOld([saved]); });
    expect(contents()).not.toContain('検証用訪問先');
    expect(contents()).toContain('新井 将也');
  });
  it('時間経過や別タブ・別アプリからの復帰では再取得しない', async () => {
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(300000); });
    await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchContactAppointments).toHaveBeenCalledTimes(1);
  });
  it('他担当者・他クライアント・月外・予定に無関係な変更では再取得しない', async () => {
    fetchContactAppointments.mockResolvedValue([saved]);
    await mount();
    await act(async () => {
      notifyAppointmentsChanged({ operation: 'insert', new: { ...rawSaved, id: 'other', list_id: 'arai-list' } });
      databaseListeners.INSERT({ eventType: 'INSERT', new: { ...rawSaved, id: 'other', client_id: 'other-client' } });
      databaseListeners.INSERT({ eventType: 'INSERT', new: { ...rawSaved, id: 'other', meeting_date: '2026-10-01' } });
      databaseListeners.UPDATE({ eventType: 'UPDATE', new: { ...rawSaved, sales_amount: 12345, report_supplement: '補足だけ変更' }, old: { id: saved.id } });
      databaseListeners.DELETE({ eventType: 'DELETE', old: { id: 'someone-else' } });
    });
    expect(fetchContactAppointments).toHaveBeenCalledTimes(1);
  });
  it('別ユーザーの高野さんのアポ保存を通知で反映する', async () => {
    await mount();
    fetchContactAppointments.mockResolvedValue([saved]);
    await act(async () => { databaseListeners.INSERT({ eventType: 'INSERT', new: rawSaved }); });
    expect(contents()).toContain('14:15');
    expect(fetchContactAppointments).toHaveBeenCalledTimes(2);
  });
  it('高野さんのリスケ・キャンセル・削除で再取得する', async () => {
    fetchContactAppointments.mockResolvedValue([saved]);
    await mount();
    await act(async () => { databaseListeners.UPDATE({ eventType: 'UPDATE', new: { ...rawSaved, meeting_date: '2026-10-09' }, old: { id: saved.id } }); });
    await act(async () => { databaseListeners.UPDATE({ eventType: 'UPDATE', new: { ...rawSaved, status: 'キャンセル' }, old: { id: saved.id } }); });
    fetchContactAppointments.mockResolvedValue([]);
    await act(async () => { databaseListeners.DELETE({ eventType: 'DELETE', old: { id: saved.id } }); });
    expect(fetchContactAppointments).toHaveBeenCalledTimes(4);
    expect(contents()).not.toContain('検証用訪問先');
  });
  it('再取得の間も予定を消さず、失敗時には前回表示と明示する', async () => {
    fetchContactAppointments.mockResolvedValue([saved]);
    await mount();
    let fail;
    fetchContactAppointments.mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; }));
    await act(async () => { databaseListeners.UPDATE({ eventType: 'UPDATE', new: { ...rawSaved, meeting_time: '16:00' }, old: { id: saved.id } }); });
    expect(contents()).toContain('14:15');
    expect(contents()).not.toContain('面談予定を読み込み中');
    await act(async () => { fail(new Error('offline')); });
    expect(contents()).toContain('14:15');
    expect(contents()).toContain('前回取得した予定を表示しています');
  });
  it('接続切断を知らせ、再接続時に取りこぼしを照合する', async () => {
    fetchContactAppointments.mockResolvedValue([saved]);
    await mount();
    await act(async () => { connectionListener('CHANNEL_ERROR'); });
    expect(contents()).toContain('自動反映に接続できません');
    expect(contents()).toContain('14:15');
    await act(async () => { connectionListener('SUBSCRIBED'); });
    expect(fetchContactAppointments).toHaveBeenCalledTimes(2);
    expect(contents()).not.toContain('自動反映に接続できません');
  });
  it('高野さんの未連携表示を予定表へ置き換え、他担当者のSpirリンクを維持する', async () => {
    const props = { showRegisteredAppointments: true, contacts: [contact, { id: 'arai', name: '新井 将也', schedulingUrl: 'https://app.spirinc.com/test' }], fallbackClient: { _supaId: 'fullerene' } };
    await act(async () => { renderer = create(<MultiCalendarPanel {...props} />); });
    expect(renderer.root.findAllByProps({ 'aria-label': '高野 柊平さんの当社登録アポ' })).toHaveLength(1);
    expect(contents()).not.toContain('カレンダー未連携です');
    await act(async () => { button('新井').props.onClick(); });
    expect(renderer.root.findAllByType('a').some(node => node.props.href === 'https://app.spirinc.com/test')).toBe(true);
    expect(renderer.root.findAllByProps({ 'aria-label': '高野 柊平さんの当社登録アポ' })).toHaveLength(0);
  });
});
