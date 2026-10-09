import { supabase } from '../../../lib/supabase';

// 架電リストの「リスト」タブの数字（call_list_home）。トップと詳細モーダルで同じものを1分だけ使い回す
let cache = null;
export function fetchListHome({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 60000) return cache.p;
  // ほかの重い処理と重なると時間切れになることがある（10/10 朝に0件で止まった）。2回まで間をあけてやり直す
  const once = () => supabase.rpc('call_list_home');
  const p = (async () => {
    for (let i = 0; i < 3; i++) {
      const { data, error } = await once();
      if (!error) return data || [];
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
    cache = null;
    return [];
  })();
  cache = { at: Date.now(), p };
  return p;
}
