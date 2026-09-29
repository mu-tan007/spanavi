import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
vi.mock('./ClientCalendarPanel', () => ({ default: () => null }));
vi.mock('./AppointmentCalendarPanel', () => ({ default: () => null }));
import ClientCalendarPanel from './ClientCalendarPanel';
import MultiCalendarPanel from './MultiCalendarPanel';

const client = { _supaId: 'univis', googleCalendarId: 't.funayama@univis.co.jp' };
const funayama = { id: 'funayama', name: '舟山 拓見', googleCalendarId: 't.funayama@univis.co.jp' };
const hayashi = { id: 'hayashi', name: '林 泰之', googleCalendarId: '' };

function render(contacts) {
  let renderer;
  act(() => { renderer = create(<MultiCalendarPanel contacts={contacts} fallbackClient={client} />); });
  return renderer;
}
const shownCalendar = renderer => renderer.root.findByType(ClientCalendarPanel).props.clientCalendarId;
const text = renderer => JSON.stringify(renderer.toJSON());

describe('MultiCalendarPanel', () => {
  it('複数担当者の会社で本人のカレンダーが未登録なら、会社単位（別の担当者）のカレンダーを代わりに出さない', () => {
    const renderer = render([funayama, hayashi]);
    expect(shownCalendar(renderer)).toBe('t.funayama@univis.co.jp');
    expect(text(renderer)).not.toContain('カレンダー未登録');

    act(() => { renderer.root.findAllByType('button').find(b => b.children.includes('林')).props.onClick(); });
    expect(shownCalendar(renderer)).toBe('');
    expect(text(renderer)).toContain('林様のカレンダー未登録');
  });

  it('担当者が1人だけなら、従来どおり会社単位のカレンダーを使う', () => {
    const renderer = render([hayashi]);
    expect(shownCalendar(renderer)).toBe('t.funayama@univis.co.jp');
  });

  it('担当者のカレンダーには本人のリストのアポだけを重ねる（担当者を引けないアポは全員に出す）', () => {
    const kawamotoAppo = { meetDate: '2026-10-09', meetTime: '10:00', contactIds: ['kawamoto'] };
    const hayashiAppo = { meetDate: '2026-10-08', meetTime: '10:00', contactIds: ['hayashi'] };
    const unknownAppo = { meetDate: '2026-10-07', meetTime: '10:00', contactIds: [] };
    const appos = [kawamotoAppo, hayashiAppo, unknownAppo];
    const shownAppos = renderer => renderer.root.findByType(ClientCalendarPanel).props.existingAppointments;

    let single;
    act(() => { single = create(<MultiCalendarPanel contacts={[hayashi]} fallbackClient={client} existingAppointments={appos} />); });
    expect(shownAppos(single)).toEqual([hayashiAppo, unknownAppo]);

    let multi;
    act(() => { multi = create(<MultiCalendarPanel contacts={[funayama, hayashi]} fallbackClient={client} existingAppointments={appos} />); });
    expect(shownAppos(multi)).toEqual([unknownAppo]);
    act(() => { multi.root.findAllByType('button').find(b => b.children.includes('林')).props.onClick(); });
    expect(shownAppos(multi)).toEqual([hayashiAppo, unknownAppo]);
  });
});
