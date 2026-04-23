import { supabase } from './supabase';

// Supabase PostgREST には db-max-rows (既定 1000) の制約があり、
// .range(0, 99999) を指定しても 1 レスポンスでそれ以上は返ってこない。
// 本ヘルパーは .range() を連続発行して全行を取得する。
//
// 使い方:
//   const rows = await fetchAllRpc('sourcing_list_approach_detail',
//     { p_list_id: id, p_org_id: orgId });
//
// chunkSize は 1000 (max_rows と一致させる想定)。1 ページの応答件数が
// chunkSize 未満になった時点で打ち切り。
export async function fetchAllRpc(name, args, chunkSize = 1000) {
  const all = [];
  let from = 0;
  // 安全上限 (想定外の無限ループ防止)
  for (let i = 0; i < 200; i++) {
    const to = from + chunkSize - 1;
    const { data, error } = await supabase.rpc(name, args).range(from, to);
    if (error) return { data: null, error };
    const batch = data || [];
    all.push(...batch);
    if (batch.length < chunkSize) break;
    from += chunkSize;
  }
  return { data: all, error: null };
}

// 同じパターンの from('table').select(...).[filters...] 版。
// queryBuilder は fn(baseQuery) → baseQuery を返すように渡す。
export async function fetchAllSelect(tableName, queryBuilder, chunkSize = 1000) {
  const all = [];
  let from = 0;
  for (let i = 0; i < 200; i++) {
    const to = from + chunkSize - 1;
    const base = supabase.from(tableName).select('*');
    const q = queryBuilder ? queryBuilder(base) : base;
    const { data, error } = await q.range(from, to);
    if (error) return { data: null, error };
    const batch = data || [];
    all.push(...batch);
    if (batch.length < chunkSize) break;
    from += chunkSize;
  }
  return { data: all, error: null };
}
