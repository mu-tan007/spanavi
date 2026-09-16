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
export const fetchCompanyImportJob = (id, signal) => rpc('get_company_import_job', { p_id: id }, signal);
export const fetchCompanyImportSources = (companyId, signal) => rpc('get_company_import_sources', { p_company_id: companyId }, signal);
export async function companyImportFingerprint(listId, metadata, rows) {
  const bytes = new TextEncoder().encode(JSON.stringify([listId || null, metadata, rows]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
// Statement timeout, deadlock, lost connection: the chunk rolled back whole, so the
// same rows can be sent again. A busy database must not end a several-thousand-row import.
const TRANSIENT_CODES = ['57014', '57P01', '55P03', '40001', '40P01', '53300', '53400', '08000', '08003', '08006', '08P01'];
const TRANSIENT_TEXT = /statement timeout|deadlock|lock timeout|connection|network|failed to fetch|terminating|shutting down|too many clients|server closed/i;
export const isTransientImportError = error => !!error && (TRANSIENT_CODES.includes(error.code)
  || TRANSIENT_TEXT.test(`${error.message || ''} ${error.details || ''}`));
export const CHUNK_ROWS = 25, CHUNK_ROWS_MIN = 5, CHUNK_RETRIES = 5;
const pause = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  const stop = () => { clearTimeout(timer); reject(new Error('取込を中断しました。同じファイルから再開できます。')); };
  if (signal?.aborted) return stop();
  signal?.addEventListener('abort', stop, { once: true });
});
// A stable fingerprint resumes the same import after a lost response/reload.
// Rows and company/list writes commit together on the server, 25 rows at a time.
export async function executeCompanyImport({ listId, metadata, rows, fingerprint, onProgress, signal, retryDelayMs = 500 }) {
  let job = await rpc('begin_company_import', { p_id: crypto.randomUUID(), p_list_id: listId || null,
    p_metadata: metadata, p_total: rows.length, p_fingerprint: fingerprint }, signal);
  onProgress?.(job);
  // The server requires contiguous rows and commits a whole chunk together.
  // Its processed count is therefore a safe resume position, including rejects.
  let from = job.processed, size = CHUNK_ROWS, attempt = 0;
  while (from < rows.length) {
    if (signal?.aborted) throw new Error('取込を中断しました。同じファイルから再開できます。');
    try {
      job = await rpc('append_company_import', { p_id: job.id, p_rows: rows.slice(from, from + size) }, signal);
      if (job.processed <= from) throw new Error('取込が進みませんでした。同じファイルから再開してください。');
      from = job.processed; attempt = 0; size = Math.min(CHUNK_ROWS, size * 2);
      onProgress?.(job);
    } catch (e) {
      if (signal?.aborted || !isTransientImportError(e) || ++attempt > CHUNK_RETRIES) {
        throw isTransientImportError(e)
          ? new Error(`データベースが混み合って取込を続けられませんでした。${from.toLocaleString()}行目までは登録済みです。しばらく待ってから「取込を再開」してください。`)
          : e;
      }
      // Halve the chunk so a slow moment has less to finish inside one statement.
      size = Math.max(CHUNK_ROWS_MIN, Math.floor(size / 2));
      await pause(Math.min(16 * retryDelayMs, retryDelayMs * 2 ** attempt), signal);
      // Re-read the committed position; resending rows the server already stored is safe.
      try { job = await fetchCompanyImportJob(job.id, signal); from = job.processed; onProgress?.(job); } catch { /* keep the current position */ }
    }
  }
  job = await fetchCompanyImportJob(job.id, signal);
  if (job.processed !== rows.length) throw new Error('取込結果が未確定です。同じファイルから再開してください。');
  return job;
}
