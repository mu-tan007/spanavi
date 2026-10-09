import { supabase } from '../../../lib/supabase';

// 架電リストの「リスト」タブの数字（call_list_home）。トップと詳細モーダルで同じものを1分だけ使い回す
let cache = null;
export function fetchListHome({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 60000) return cache.p;
  const p = supabase.rpc('call_list_home').then(({ data, error }) => {
    if (error) { cache = null; return []; }
    return data || [];
  });
  cache = { at: Date.now(), p };
  return p;
}
