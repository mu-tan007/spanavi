import { supabase } from './supabase';

async function rpc(name, args = {}, signal) {
  let query = supabase.rpc(name, args);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export const fetchCompanyProfileStats = signal => rpc('company_profile_stats', {}, signal);
export const searchCompanyProfiles = (filters, signal) => rpc('search_company_profiles', {
  p_query: filters.query || '', p_stage: filters.stage || '', p_home: filters.home || '',
  p_registry: filters.registry || '', p_scope: filters.scope || '', p_industry: filters.industry || '',
  p_offset: (filters.page || 0) * 50, p_limit: 50,
}, signal);
export const fetchCompanyProfile = (target, signal, historyOffset = 0) => rpc('get_company_profile', {
  p_company_id: target.companyId || null, p_master_id: target.masterId || null, p_item_id: target.itemId || null,
  p_history_offset: historyOffset,
}, signal);
export const saveCompanyProfile = (companyId, version, changes) => rpc('update_company_profile', {
  p_company_id: companyId, p_version: version, p_changes: changes,
});
export const resolveCompanyReview = (reviewId, note) => rpc('resolve_company_profile_review', { p_review_id: reviewId, p_note: note });
export const mergeCompanyReview = (reviewId, companyId, note) => rpc('merge_company_profile_review', { p_review_id: reviewId, p_keep_company_id: companyId, p_note: note });
