import { describe, it, expect } from 'vitest';
import { fetchCallPages, queryCallFlowData } from './callListRead';

describe('大規模架電リストを欠落させずに取得', () => {
  it('先頭ページを含む全ページを最大4並列で、元の順序どおり結合する', async () => {
    let active = 0, max = 0;
    const rows = Array.from({ length: 9203 }, (_, id) => ({ id }));
    const result = await fetchCallPages(async (from, to, count) => {
      active++; max = Math.max(max, active);
      await new Promise(resolve => setTimeout(resolve, from === 1000 ? 5 : 0));
      active--;
      return { data: rows.slice(from, to + 1), count: count ? rows.length : null };
    });
    expect(result.data).toEqual(rows);
    expect(max).toBe(4);
  });

  it('途中のページが失敗したとき部分的な企業リストを返さない', async () => {
    const result = await fetchCallPages(async from => from === 1000
      ? { error: { message: 'timeout' } }
      : { data: Array.from({ length: 1000 }, (_, id) => ({ id: from + id })), count: 3000 });
    expect(result.data).toEqual([]);
    expect(result.error.message).toBe('timeout');
  });

  it('件数ヘッダーがなくても1000件で切り捨てない', async () => {
    const rows = Array.from({ length: 2400 }, (_, id) => ({ id }));
    const result = await fetchCallPages(async (from, to) => ({ data: rows.slice(from, to + 1) }));
    expect(result.data).toEqual(rows);
  });

  it('企業と架電履歴を住所条件・番号範囲で絞った一つのスナップショットとして取得する', async () => {
    const calls = [];
    const data = { items: [{ id: 'a' }], records: [{ item_id: 'a' }], count: 1 };
    const client = { rpc(name, args) {
      calls.push([name, args]);
      return Promise.resolve({ data, error: null });
    } };
    const opts = { addressMatch: 'same', startNo: 10, endNo: 200 };
    expect((await queryCallFlowData(client, 'list', opts)).data).toEqual({ items: data.items, records: data.records });
    expect(calls).toEqual([['call_list_filtered_data', { p_list_id: 'list', p_address_match: 'same', p_start_no: 10, p_end_no: 200, p_offset: 0, p_limit: 1000, p_include_count: true }]]);
  });

  it('履歴の欠けた応答を空の架電履歴として扱わない', async () => {
    const result = await queryCallFlowData({ rpc: async () => ({ data: { items: [] } }) }, 'list');
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('1000件を超える企業と各社の複数回の履歴を最後まで保持する', async () => {
    const items = Array.from({ length: 2051 }, (_, id) => ({ id }));
    const client = { rpc: async (_, args) => {
      const page = items.slice(args.p_offset, args.p_offset + args.p_limit);
      return { data: { items: page, records: page.flatMap(i => [{ item_id: i.id, round: 1 }, { item_id: i.id, round: 2 }]), count: args.p_include_count ? items.length : null } };
    } };
    const result = await queryCallFlowData(client, 'list');
    expect(result.data.items).toEqual(items);
    expect(result.data.records).toHaveLength(4102);
    expect(result.data.records.at(-1)).toEqual({ item_id: 2050, round: 2 });
  });

  it('残りが待機中でも先頭50社とその履歴を表示し、全件取得は完了扱いにしない', async () => {
    const items = Array.from({ length: 2103 }, (_, id) => ({ id }));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const progress = [];
    let finished = false;
    const result = queryCallFlowData({ rpc: async (_, args) => {
      if (args.p_offset) await gate;
      const rows = items.slice(args.p_offset, args.p_offset + args.p_limit);
      return { data: { items: rows, records: rows.map(row => ({ item_id: row.id, status: '除外' })), count: args.p_include_count ? items.length : null } };
    } }, 'list', { onProgress: data => progress.push(data) }).then(data => { finished = true; return data; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(finished).toBe(false);
    expect(progress).toHaveLength(1);
    expect(progress[0].items).toHaveLength(50);
    expect(progress[0].records).toHaveLength(50);
    expect(progress[0].count).toBe(2103);
    release();
    expect((await result).data.items).toEqual(items);
    expect(progress.at(-1).records).toHaveLength(2103);
  });

  it('先頭を表示した後に失敗しても、部分取得を架電用の成功結果にしない', async () => {
    const progress = [];
    const result = await queryCallFlowData({ rpc: async (_, args) => args.p_offset
      ? { error: new Error('timeout') }
      : { data: { items: Array.from({ length: 50 }, (_, id) => ({ id })), records: [], count: 3000 } },
    }, 'list', { onProgress: data => progress.push(data) });
    expect(progress[0].items).toHaveLength(50);
    expect(result.data).toBeNull();
    expect(result.error.message).toBe('timeout');
  });

  it('全件取得中の行欠落を検知し、不完全なキューを返さない', async () => {
    const result = await fetchCallPages(async from => ({ data: Array.from({ length: from ? 49 : 50 }, (_, id) => ({ id: from + id })), count: from ? null : 100 }), { firstPageSize: 50 });
    expect(result.error).toBeTruthy();
    expect(result.data).toEqual([]);
  });
});
