import { supabase } from './supabase';

async function rpc(name, args = {}, signal) {
  let query = supabase.rpc(name, args);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export const fetchCompanyImportConfig = signal => rpc('company_import_config', {}, signal);
export const saveCompanyImportField = field => rpc('save_company_import_field', {
  p_key: field.key, p_label: field.label, p_type: field.type, p_aliases: field.aliases,
  p_active: field.active, p_version: field.version || 0,
});
export const saveCompanyImportTemplate = template => rpc('save_company_import_template', {
  p_id: template.id, p_provider: template.provider, p_name: template.name, p_settings: template.settings,
  p_active: template.active, p_version: template.version || 0,
});
export const fetchCompanyImportJob = id => rpc('get_company_import_job', { p_id: id });
export const fetchCompanyImportSources = (companyId, signal) => rpc('get_company_import_sources', { p_company_id: companyId }, signal);
export async function companyImportFingerprint(listId, metadata, rows) {
  const bytes = new TextEncoder().encode(JSON.stringify([listId || null, metadata, rows]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
// A stable fingerprint resumes the same import after a lost response/reload.
// Rows and company/list writes commit together on the server, 25 rows at a time.
export async function executeCompanyImport({ listId, metadata, rows, fingerprint, onProgress, signal }) {
  let job = await rpc('begin_company_import', { p_id: crypto.randomUUID(), p_list_id: listId || null,
    p_metadata: metadata, p_total: rows.length, p_fingerprint: fingerprint }, signal);
  onProgress?.(job);
  for (let from = job.processed; from < rows.length; from += 25) {
    if (signal?.aborted) throw new Error('取込を中断しました。同じファイルから再開できます。');
    // The server requires contiguous rows and commits a whole chunk together.
    // Its processed count is therefore a safe resume position, including rejects.
    job = await rpc('append_company_import', { p_id: job.id, p_rows: rows.slice(from, from + 25) }, signal);
    onProgress?.(job);
  }
  job = await fetchCompanyImportJob(job.id);
  if (job.processed !== rows.length) throw new Error('取込結果が未確定です。同じファイルから再開してください。');
  return job;
}
