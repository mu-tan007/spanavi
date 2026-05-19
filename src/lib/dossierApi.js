// Company Dossier API クライアント。Edge Function generate-company-dossier
// （別エージェントが並行開発中）へのラッパー。本実装が揃うまでは no-op スタブ。
import { supabase } from './supabase';

export async function invokeGenerateCompanyDossier(payload) {
  try {
    const { data, error } = await supabase.functions.invoke('generate-company-dossier', {
      body: payload,
    });
    if (error) {
      // 未デプロイの状況では invoke が失敗するが、上位の呼び出し側は .catch() で
      // 拾うか fire-and-forget するため、ここでは warn だけ出して握りつぶす。
      console.warn('[dossierApi] generate-company-dossier invoke error:', error.message || error);
      return { data: null, error };
    }
    return { data, error: null };
  } catch (e) {
    console.warn('[dossierApi] invoke failed (function may not be deployed yet):', e?.message || e);
    return { data: null, error: e };
  }
}
