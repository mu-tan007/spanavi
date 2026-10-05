import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { ExcludeReasonPicker, EXCLUDE_SCOPES } from './excludeReasonPicker';

// テスト環境に DOM が無いので、キー入力を受ける window だけ用意する
const realWindow = globalThis.window;
beforeEach(() => { globalThis.window = new EventTarget(); });
afterEach(() => { globalThis.window = realWindow; });

const pressKey = (key) => {
  const ev = new Event('keydown', { cancelable: true });
  ev.key = key;
  act(() => { window.dispatchEvent(ev); });
  return ev;
};

describe('除外の理由の選択', () => {
  it('3つの理由が並び、押した理由が返る', () => {
    const onPick = vi.fn();
    let r;
    act(() => { r = create(<ExcludeReasonPicker onPick={onPick} />); });
    const text = JSON.stringify(r.toJSON());
    for (const s of EXCLUDE_SCOPES) expect(text).toContain(s.label);
    const buttons = r.root.findAll(n => n.type === 'button');
    expect(buttons).toHaveLength(EXCLUDE_SCOPES.length + 1); // 3つの理由＋キャンセル
    act(() => { buttons[1].props.onClick(); });
    expect(onPick).toHaveBeenCalledWith('client');
  });

  it('数字キー 1/2/3 で選べ、Esc は取り消し（null）', () => {
    const onPick = vi.fn();
    act(() => { create(<ExcludeReasonPicker onPick={onPick} />); });
    pressKey('1');
    pressKey('3');
    pressKey('Escape');
    expect(onPick.mock.calls.map(c => c[0])).toEqual(['company', 'duplicate', null]);
  });

  it('関係ないキーは素通りさせる（架電ページの他の操作を止めない）', () => {
    const onPick = vi.fn();
    act(() => { create(<ExcludeReasonPicker onPick={onPick} />); });
    const ev = pressKey('a');
    expect(onPick).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('会社の事情だけが他のリストへ伝わる種類（company）', () => {
    expect(EXCLUDE_SCOPES.map(s => s.value)).toEqual(['company', 'client', 'duplicate']);
  });
});
