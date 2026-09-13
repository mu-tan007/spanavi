import { normalizeAddressMatchFilter } from '../utils/companyAddressMatch.js';

const PAGE_SIZE = 1000;
const CONCURRENCY = 4;

// All pages must succeed before the result can be used as a complete call queue.
// Count the first page and fetch the remaining pages with bounded concurrency.
export async function fetchCallPages(queryPage) {
  const first = await queryPage(0, PAGE_SIZE - 1, true);
  if (first.error) return { data: [], error: first.error };
  const data = [...(first.data || [])];
  if (data.length < PAGE_SIZE) return { data, error: null };
  if (first.count == null) {
    // Preserve completeness if an API does not provide Content-Range.
    for (let from = PAGE_SIZE; ; from += PAGE_SIZE) {
      const page = await queryPage(from, from + PAGE_SIZE - 1, false);
      if (page.error) return { data: [], error: page.error };
      data.push(...(page.data || []));
      if ((page.data || []).length < PAGE_SIZE) return { data, error: null };
    }
  }
  for (let from = PAGE_SIZE; from < first.count; from += PAGE_SIZE * CONCURRENCY) {
    const requests = [];
    for (let offset = from; offset < Math.min(first.count, from + PAGE_SIZE * CONCURRENCY); offset += PAGE_SIZE) {
      requests.push(queryPage(offset, offset + PAGE_SIZE - 1, false));
    }
    const pages = await Promise.all(requests);
    const failed = pages.find(page => page.error);
    if (failed) return { data: [], error: failed.error };
    for (const page of pages) data.push(...(page.data || []));
  }
  return { data, error: null };
}

export function queryCallItems(client, listId, opts = {}) {
  const { startNo = null, endNo = null, signal } = opts;
  const addressMatch = normalizeAddressMatchFilter(opts.addressMatch);
  return fetchCallPages((from, to, count) => {
    let query = client.from('call_list_items').select('*', count ? { count: 'exact' } : {})
      .eq('list_id', listId);
    if (startNo != null) query = query.gte('no', startNo);
    if (endNo != null) query = query.lte('no', endNo);
    if (addressMatch) query = query.eq('company_address_match', addressMatch);
    query = query.order('no').range(from, to);
    return signal ? query.abortSignal(signal) : query;
  });
}

export function queryCallFlowRecords(client, listId, opts = {}) {
  const { startNo = null, endNo = null, signal } = opts;
  const addressMatch = normalizeAddressMatchFilter(opts.addressMatch);
  const restricted = !!addressMatch || startNo != null || endNo != null;
  return fetchCallPages((from, to, count) => {
    // Empty embedding filters the related items without returning them twice.
    let query = client.from('call_records')
      .select(restricted ? '*,call_list_items!inner()' : '*', count ? { count: 'exact' } : {})
      .eq('list_id', listId);
    if (startNo != null) query = query.gte('call_list_items.no', startNo);
    if (endNo != null) query = query.lte('call_list_items.no', endNo);
    if (addressMatch) query = query.eq('call_list_items.company_address_match', addressMatch);
    query = query.order('round').order('id').range(from, to);
    return signal ? query.abortSignal(signal) : query;
  });
}
