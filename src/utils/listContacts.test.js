import { describe, it, expect } from 'vitest';
import { findClientByName, resolveClient, resolveListClient } from './listContacts';

// 株式会社SECURITY BRIDGE が clients に2件登録されている状態を再現する。
// 実務データ（担当者・架電リスト・報酬設定）は「支援中」の方だけが持っている。
const CLIENTS = [
  { _supaId: 'shell', company: '株式会社SECURITY BRIDGE', status: '保留' },
  { _supaId: 'real', company: '株式会社SECURITY BRIDGE', status: '支援中' },
  { _supaId: 'other', company: '株式会社ほか', status: '支援中' },
];

describe('resolveClient', () => {
  it('client_id があれば社名より優先する', () => {
    expect(resolveClient(CLIENTS, { clientId: 'real', company: '株式会社SECURITY BRIDGE' })._supaId).toBe('real');
    expect(resolveClient(CLIENTS, { clientId: 'shell', company: '株式会社SECURITY BRIDGE' })._supaId).toBe('shell');
  });

  it('client_id が無い旧データは社名で引く', () => {
    expect(resolveClient(CLIENTS, { company: '株式会社ほか' })._supaId).toBe('other');
  });

  it('存在しない client_id は社名フォールバックに落ちる', () => {
    expect(resolveClient(CLIENTS, { clientId: 'deleted', company: '株式会社SECURITY BRIDGE' })._supaId).toBe('real');
  });

  it('該当なしは undefined', () => {
    expect(resolveClient(CLIENTS, { company: '無い会社' })).toBeUndefined();
    expect(resolveClient(CLIENTS, {})).toBeUndefined();
    expect(resolveClient(null, { company: '株式会社ほか' })).toBeUndefined();
  });
});

describe('findClientByName', () => {
  it('同名が複数あるときは支援中を選ぶ（抜け殻レコードを掴まない）', () => {
    expect(findClientByName(CLIENTS, '株式会社SECURITY BRIDGE')._supaId).toBe('real');
  });

  it('同名が1件だけならステータスに関係なくそれを返す', () => {
    expect(findClientByName([CLIENTS[0]], '株式会社SECURITY BRIDGE')._supaId).toBe('shell');
  });

  it('同名が複数で支援中が無ければ先頭を返す', () => {
    const paused = [
      { _supaId: 'a', company: 'X社', status: '保留' },
      { _supaId: 'b', company: 'X社', status: '終了' },
    ];
    expect(findClientByName(paused, 'X社')._supaId).toBe('a');
  });
});

describe('resolveListClient', () => {
  it('架電リストは list.client_id を優先する', () => {
    const list = { client_id: 'real', company: '株式会社SECURITY BRIDGE' };
    expect(resolveListClient(list, CLIENTS)._supaId).toBe('real');
  });
});
