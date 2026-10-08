import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HangupKeyCoach, { createManualHangupCounter, hangupKeys, isHangupKey, DIAL_EVENT } from './HangupKeyCoach';

const text = (node) => (typeof node === 'string' ? node : (node?.children || []).map(text).join(''));

let store;
let listeners;
beforeEach(() => {
  store = new Map();
  listeners = {};
  vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) });
  vi.stubGlobal('window', {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: () => {},
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

// 発信 → at秒後に離れる → awaySec秒後に戻る、を1回分
function manualHangup(counter, clock, { at = 10, awaySec = 5 } = {}) {
  counter.dial();
  clock.t += at * 1000;
  counter.away();
  clock.t += awaySec * 1000;
  return counter.back();
}

describe('切電のキーの案内：手で切った回数', () => {
  it('発信から4秒以降に離れて2秒以上戻らなかったら1回と数え、3回目で出す（1日1回まで）', () => {
    const clock = { t: 1_000_000 };
    const c = createManualHangupCounter('u1', () => clock.t);
    expect(manualHangup(c, clock)).toBe(false);
    expect(manualHangup(c, clock)).toBe(false);
    expect(manualHangup(c, clock)).toBe(true);
    expect(manualHangup(c, clock)).toBe(false);
    expect(store.get(hangupKeys('u1').count)).toBe('4');
  });

  it('発信の直後（画面よけが戻す）・すぐ戻った・3分後・発信していないときは数えない', () => {
    const clock = { t: 1_000_000 };
    const c = createManualHangupCounter('u1', () => clock.t);
    manualHangup(c, clock, { at: 1 });
    manualHangup(c, clock, { awaySec: 1 });
    manualHangup(c, clock, { at: 200 });
    c.away(); clock.t += 5000; c.back();   // 同じ発信で2回目は数えない
    expect(store.get(hangupKeys('u1').count)).toBeUndefined();
  });

  it('「今後表示しない」を選んだ人には出さない', () => {
    store.set(hangupKeys('u1').hidden, '1');
    const clock = { t: 1_000_000 };
    const c = createManualHangupCounter('u1', () => clock.t);
    expect([1, 2, 3].map(() => manualHangup(c, clock))).toEqual([false, false, false]);
  });
});

describe('切電のキーの案内：画面', () => {
  it('Ctrl+Shift+E が Spanavi に届いたら「届いていません」と設定の手順を出す', () => {
    let r;
    act(() => { r = create(<HangupKeyCoach userId="u1" />); });
    expect(r.toJSON()).toBeNull();
    const e = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, code: 'KeyE', key: 'E', preventDefault: vi.fn() };
    act(() => { listeners.keydown(e); });
    const body = text(r.toJSON());
    expect(e.preventDefault).toHaveBeenCalled();
    expect(body).toContain('切電のキーがZoomに届いていません');
    expect(body).toContain('「グローバル」にチェック');
  });

  it('ほかのキーでは出さず、発信の合図を受け取る', () => {
    expect(isHangupKey({ ctrlKey: true, shiftKey: false, code: 'KeyE', key: 'e' })).toBe(false);
    expect(isHangupKey({ ctrlKey: true, shiftKey: true, metaKey: true, code: 'KeyE', key: 'E' })).toBe(false);
    act(() => { create(<HangupKeyCoach userId="u1" />); });
    expect(typeof listeners[DIAL_EVENT]).toBe('function');
  });
});
