import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ZoomGuardNotice, { zoomGuardHiddenKey } from './ZoomGuardNotice';

const text = (node) => (typeof node === 'string' ? node : (node?.children || []).map(text).join(''));
const button = (r, label) => r.root.findAll((n) => n.type === 'button' && text(n) === label)[0];

let store;
function setPc(userAgent) {
  vi.stubGlobal('navigator', { userAgent, platform: '' });
}

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) });
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('起動時の案内：Zoomの画面よけ', () => {
  it('Windows のPCでは中央に出て、閉じると消える（覚えない＝次の起動でまた出る）', () => {
    setPc('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141');
    let r;
    act(() => { r = create(<ZoomGuardNotice userId="u1" />); });
    expect(text(r.toJSON())).toContain('Zoomの画面よけの設定方法はこちら');
    act(() => { button(r, '閉じる').props.onClick(); });
    expect(r.toJSON()).toBeNull();
    expect(store.get(zoomGuardHiddenKey('u1'))).toBeUndefined();
    act(() => { r = create(<ZoomGuardNotice userId="u1" />); });
    expect(r.toJSON()).not.toBeNull();
  });

  it('「今後表示しない」を付けて閉じると、その人はこのPCでは出ない（ほかの人には出る）', () => {
    setPc('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    let r;
    act(() => { r = create(<ZoomGuardNotice userId="u1" />); });
    const box = r.root.find((n) => n.type === 'input' && n.props.type === 'checkbox');
    act(() => { box.props.onChange({ target: { checked: true } }); });
    act(() => { button(r, '閉じる').props.onClick(); });
    expect(store.get(zoomGuardHiddenKey('u1'))).toBe('1');
    act(() => { r = create(<ZoomGuardNotice userId="u1" />); });
    expect(r.toJSON()).toBeNull();
    act(() => { r = create(<ZoomGuardNotice userId="u2" />); });
    expect(r.toJSON()).not.toBeNull();
  });

  it('「設定方法を見る」でマイページの入れ方へ送る', () => {
    setPc('Mozilla/5.0 (Windows NT 10.0)');
    const onOpenGuide = vi.fn();
    let r;
    act(() => { r = create(<ZoomGuardNotice userId="u1" onOpenGuide={onOpenGuide} />); });
    act(() => { button(r, '設定方法を見る').props.onClick(); });
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
    expect(r.toJSON()).toBeNull();
  });

  it('Mac・スマホには出さない（画面よけは Windows だけ）', () => {
    for (const ua of ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)']) {
      setPc(ua);
      let r;
      act(() => { r = create(<ZoomGuardNotice userId="u1" />); });
      expect(r.toJSON()).toBeNull();
    }
  });
});
