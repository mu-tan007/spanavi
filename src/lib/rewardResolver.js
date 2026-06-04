import { supabase } from './supabase';

// (client_id, engagement_id) ごとの報酬体系設定からアクティブな reward_type を決める。
// setting: client_engagement_reward_settings の1行
//   { reward_type, intro_count, intro_reward_type } を最低限持つ
// pastDoneCount: 同一 (client_id, engagement_id) で status='面談済' となったアポ件数
// 初回 intro_count 件は intro_reward_type、それ以降は reward_type。
export function resolveActiveRewardType(setting, pastDoneCount) {
  if (!setting) return null;
  const intro = Number(setting.intro_count) || 0;
  if (intro > 0 && setting.intro_reward_type && (pastDoneCount ?? 0) < intro) {
    return setting.intro_reward_type;
  }
  return setting.reward_type || null;
}

// 同一 (client_id, engagement_id) で status='面談済' のアポ件数を返す。
// 取れなかったときは 0 を返す (intro 期間扱いで保守的に低い側に倒す)。
export async function fetchPastDoneCount(clientId, engagementId) {
  if (!clientId || !engagementId) return 0;
  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('engagement_id', engagementId)
    .eq('status', '面談済');
  if (error) {
    console.warn('[rewardResolver] fetchPastDoneCount error:', error);
    return 0;
  }
  return count || 0;
}
