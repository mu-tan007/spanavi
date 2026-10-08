import React from 'react';
import fs from 'node:fs';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import ZoomWindowGuardMacRow, { GUARD_SCRIPT, installCommand } from './ZoomWindowGuardMacRow';

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const buttonByText = (root, label) => root.findAll((n) => n.type === 'button' && text(n) === label)[0];
const readPublic = (path) => fs.readFileSync(new URL(`../../../public${path}`, import.meta.url));

describe('マイページ：Zoomの画面よけ（Mac）', () => {
  it('入れ方は押すまで閉じていて、押すと手順と入れる1行が出る', () => {
    let r;
    act(() => { r = create(<ZoomWindowGuardMacRow />); });
    expect(text(r.toJSON())).toContain('Zoomの画面よけ（Mac）');
    expect(r.root.findAll((n) => n.type === 'ol')).toHaveLength(0);
    act(() => { buttonByText(r.root, '入れ方').props.onClick(); });
    const body = text(r.toJSON());
    expect(body).toContain('アクセシビリティ');
    expect(body).toContain(`${GUARD_SCRIPT} | bash`);
    expect(body).toContain('着信の知らせとミーティングの画面はしまいません。');
  });

  it('入れる1行は spanavi.jp の配布スクリプトを bash に渡す', () => {
    expect(installCommand('https://spanavi.jp')).toBe('curl -fsSL https://spanavi.jp/downloads/zoom-window-guard-mac.sh | bash');
  });

  it('配布スクリプトと本体が置いてあり、LF のまま・BOM 無し・版がそろっている', () => {
    const sh = readPublic(GUARD_SCRIPT);
    expect(sh.includes(13)).toBe(false);
    expect([...sh.subarray(0, 2)]).toEqual([0x23, 0x21]);   // #!
    const version = /VERSION="(\d+\.\d+\.\d+)"/.exec(sh.toString('utf8'))[1];
    expect(sh.toString('utf8')).toContain('BASE="https://spanavi.jp/downloads"');
    const lua = readPublic(`/downloads/zoom-window-guard-mac-${version}.lua`);
    expect(lua.includes(13)).toBe(false);
    expect([...lua.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(lua.toString('utf8')).toContain(`local VERSION = "${version}"`);
  });
});
