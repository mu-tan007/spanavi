import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/appointmentCalendar', () => ({ fetchContactAppointments: vi.fn() }));
import { fetchContactAppointments } from '../../lib/appointmentCalendar';
import { notifyAppointmentsChanged } from '../../lib/appointmentEvents';
import AppointmentCalendarPanel from './AppointmentCalendarPanel';
import MultiCalendarPanel from './MultiCalendarPanel';

let renderer;
const contact = { id: 'takano', name: '高野 柊平' };
const saved = { id: 'appo1', date: '2026-09-09', time: '14:15', company: '検証用訪問先', area: '東京都', location: '東京都新宿区', status: 'アポ取得' };
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
    await act(async () => { notifyAppointmentsChanged({ id: saved.id, operation: 'insert' }); });
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
  it('表示中は定期更新し、別タブから戻ったときにも読み直す', async () => {
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(fetchContactAppointments).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(fetchContactAppointments).toHaveBeenCalledTimes(3);
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
