import { describe, it, expect } from 'vitest';
import { fetchCallPages, queryCallItems, queryCallFlowRecords } from './callListRead';

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

  it('企業と架電履歴の両方に同じ住所条件・番号範囲を適用する', async () => {
    const calls = [];
    const client = { from(table) {
      const query = { then(resolve) { resolve({ data: [] }); } };
      for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range', 'abortSignal']) {
        query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
      }
      return query;
    } };
    const opts = { addressMatch: 'same', startNo: 10, endNo: 200 };
    await Promise.all([queryCallItems(client, 'list', opts), queryCallFlowRecords(client, 'list', opts)]);
    expect(calls).toContainEqual(['call_list_items', 'eq', 'company_address_match', 'same']);
    expect(calls).toContainEqual(['call_records', 'eq', 'call_list_items.company_address_match', 'same']);
    expect(calls).toContainEqual(['call_records', 'gte', 'call_list_items.no', 10]);
    expect(calls).toContainEqual(['call_records', 'lte', 'call_list_items.no', 200]);
    expect(calls).toContainEqual(['call_records', 'select', '*,call_list_items!inner()', { count: 'exact' }]);
  });
});
