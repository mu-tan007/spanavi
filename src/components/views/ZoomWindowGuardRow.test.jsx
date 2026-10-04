import React from 'react';
import fs from 'node:fs';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import ZoomWindowGuardRow from './ZoomWindowGuardRow';

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const buttonByText = (root, label) => root.findAll((n) => n.type === 'button' && text(n) === label)[0];

describe('マイページ：Zoomの画面よけ', () => {
  it('入れ方は押すまで閉じていて、押すと手順と注意が出る', () => {
    let r;
    act(() => { r = create(<ZoomWindowGuardRow />); });
    expect(text(r.toJSON())).toContain('Zoomの画面よけ（Windows）');
    expect(r.root.findAll((n) => n.type === 'ol')).toHaveLength(0);
    act(() => { buttonByText(r.root, '入れ方').props.onClick(); });
    const body = text(r.toJSON());
    expect(body).toContain('AutoHotkey v2（無料）');
    expect(body).toContain('shell:startup');
    expect(body).toContain('着信の知らせとミーティングの画面はしまいません。');
    expect(body).toContain('Macでは動きません。');
    expect(buttonByText(r.root, '入れ方を閉じる')).toBeTruthy();
  });

  it('マイページを開いたまま案内から来ても、入れ方が開く', () => {
    let r;
    act(() => { r = create(<ZoomWindowGuardRow />); });
    expect(r.root.findAll((n) => n.type === 'ol')).toHaveLength(0);
    act(() => { r.update(<ZoomWindowGuardRow openOnMount />); });
    expect(r.root.findAll((n) => n.type === 'ol')).toHaveLength(1);
  });

  it('配布ファイルが置いてあり、UTF-8（BOM付き）・LF のまま・名前の版と中身の版が一致する', () => {
    const src = fs.readFileSync(new URL('./ZoomWindowGuardRow.jsx', import.meta.url), 'utf8');
    const file = /const GUARD_FILE = '\/downloads\/(zoom-window-guard-(\d+\.\d+\.\d+)\.ahk)'/.exec(src);
    expect(file).toBeTruthy();
    const bytes = fs.readFileSync(new URL(`../../../public/downloads/${file[1]}`, import.meta.url));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.includes(13)).toBe(false);
    expect(bytes.toString('utf8')).toContain(`global guardVersion := "${file[2]}"`);
  });
});
