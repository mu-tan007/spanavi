// ============================================================
// スパキャリ Zoom URL 連携
// 仕様書 §9.3 Zoom URL
// ----------------------------------------------------------------
// 当初は手入力で全顧客共通の固定URL（org_settings に保存）。
// 将来 TimeRex API 連携で自動生成。
// ============================================================
import { supabase } from '../../supabase';
import { getOrgId } from '../../orgContext';

const SETTING_KEY = 'spacareer_zoom_url';

/**
 * 全顧客共通の固定 Zoom URL を取得。
 * org_settings → 環境変数の順で fallback。
 */
export async function getSpacareerZoomUrl(): Promise<string | null> {
  const { data, error } = await supabase
    .from('org_settings')
    .select('setting_value')
    .eq('org_id', getOrgId())
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();
  if (!error && data?.setting_value) return data.setting_value;

  // フォールバック: Vite env var
  const fallback = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SPACAREER_ZOOM_URL;
  return fallback || null;
}

/**
 * 運営が手入力で固定 Zoom URL を保存。
 */
export async function saveSpacareerZoomUrl(url: string): Promise<{ error: unknown }> {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return { error: 'empty url' };
  const { error } = await supabase
    .from('org_settings')
    .upsert(
      {
        org_id: getOrgId(),
        setting_key: SETTING_KEY,
        setting_value: trimmed,
      },
      { onConflict: 'org_id,setting_key' },
    );
  if (error) console.error('[DB] saveSpacareerZoomUrl error:', error);
  return { error };
}
