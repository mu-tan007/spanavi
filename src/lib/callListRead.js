import { normalizeAddressMatchFilter } from '../utils/companyAddressMatch.js';

const PAGE_SIZE = 1000;
const CONCURRENCY = 4;

// All pages must succeed before the result can be used as a complete call queue.
// Count the first page and fetch the remaining pages with bounded concurrency.
export async function fetchCallPages(queryPage, { firstPageSize = PAGE_SIZE, onProgress } = {}) {
  const first = await queryPage(0, firstPageSize - 1, true);
  if (first.error) return { data: [], error: first.error };
  const data = [...(first.data || [])];
  const incomplete = () => ({ data: [], error: new Error('読み込み中に企業一覧が変わりました。再読み込みしてください。') });
  if (first.count != null && data.length !== Math.min(firstPageSize, first.count)) return incomplete();
  onProgress?.({ data: [...data], count: first.count });
  if (data.length < firstPageSize || data.length === first.count) return { data, error: null };
  if (first.count == null) {
    // Preserve completeness if an API does not provide Content-Range.
    for (let from = firstPageSize; ; from += PAGE_SIZE) {
      const page = await queryPage(from, from + PAGE_SIZE - 1, false);
      if (page.error) return { data: [], error: page.error };
      data.push(...(page.data || []));
      onProgress?.({ data: [...data], count: null });
      if ((page.data || []).length < PAGE_SIZE) return { data, error: null };
    }
  }
  for (let from = firstPageSize; from < first.count; from += PAGE_SIZE * CONCURRENCY) {
    const requests = [];
    for (let offset = from; offset < Math.min(first.count, from + PAGE_SIZE * CONCURRENCY); offset += PAGE_SIZE) {
      requests.push(queryPage(offset, offset + PAGE_SIZE - 1, false));
    }
    const pages = await Promise.all(requests);
    const failed = pages.find(page => page.error);
    if (failed) return { data: [], error: failed.error };
    for (let n = 0; n < pages.length; n++) {
      const page = pages[n];
      if ((page.data || []).length !== Math.min(PAGE_SIZE, first.count - from - n * PAGE_SIZE)) return incomplete();
      data.push(...page.data);
    }
    onProgress?.({ data: [...data], count: first.count });
  }
  return { data, error: null };
}

export function queryCallItems(client, listId, opts = {}) {
  const { startNo = null, endNo = null, signal } = opts;
  return fetchCallPages((from, to, count) => {
    let query = client.from('call_list_items').select('*', count ? { count: 'exact' } : {})
      .eq('list_id', listId);
    if (startNo != null) query = query.gte('no', startNo);
    if (endNo != null) query = query.lte('no', endNo);
    query = query.order('no').range(from, to);
    return signal ? query.abortSignal(signal) : query;
  });
}

export async function queryCallFlowData(client, listId, opts = {}) {
  const recordPages = new Map();
  const result = await fetchCallPages(async (from, to, includeCount) => {
    let query = client.rpc('call_list_filtered_data', {
      p_list_id: listId,
      p_address_match: normalizeAddressMatchFilter(opts.addressMatch),
      p_start_no: opts.startNo ?? null,
      p_end_no: opts.endNo ?? null,
      p_offset: from,
      p_limit: to - from + 1,
      p_include_count: includeCount,
    });
    if (opts.signal) query = query.abortSignal(opts.signal);
    const page = await query;
    if (page.error) return page;
    if (!Array.isArray(page.data?.items) || !Array.isArray(page.data?.records)
      || (includeCount && !Number.isInteger(page.data?.count))) {
      return { data: null, error: new Error('企業一覧の取得結果が不完全です') };
    }
    recordPages.set(from, page.data.records);
    return { data: page.data.items, count: page.data.count, error: null };
  }, {
    // Displayed rows already have their complete histories. Queue readiness
    // still requires every remaining page to succeed.
    firstPageSize: opts.onProgress ? 50 : PAGE_SIZE,
    onProgress: opts.onProgress ? ({ data, count }) => opts.onProgress({
      items: data, count,
      records: [...recordPages.keys()].sort((a, b) => a - b).flatMap(from => recordPages.get(from)),
    }) : undefined,
  });
  if (result.error) return { data: null, error: result.error };
  const records = [...recordPages.keys()].sort((a, b) => a - b).flatMap(from => recordPages.get(from));
  return { data: { items: result.data, records }, error: null };
}
