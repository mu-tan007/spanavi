// =====================================================================
// dossierApi: 企業ドシエ用 Edge Function 呼出ラッパー + Supabase 直接アクセス
// =====================================================================
//   - invokeGenerateCompanyDossier: 生成 kickoff（fire-and-forget）
//   - invokeUpdateCompanyDossier:   MASP メンバー編集（admin access_token 必須）
//   - fetchDossierByAppointment:    appointment_id でドシエ取得
//   - subscribeDossierByAppointment: Realtime 監視（status 遷移検知用）
// =====================================================================

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * 企業ドシエ生成 kickoff（バックグラウンドで Edge Function が走る）
 * @param {{ appointment_id: string, org_id?: string, hp_url?: string }} payload
 */
export async function invokeGenerateCompanyDossier(payload) {
  try {
    const { data, error } = await supabase.functions.invoke('generate-company-dossier', {
      body: payload,
      headers: { Authorization: 'Bearer ' + ANON_KEY },
    });
    if (error) {
      console.warn('[dossierApi] generate-company-dossier invoke error:', error.message || error);
      return { data: null, error };
    }
    return { data, error: null };
  } catch (e) {
    console.warn('[dossierApi] invoke failed (function may not be deployed yet):', e?.message || e);
    return { data: null, error: e };
  }
}

/**
 * 企業ドシエ編集（MASP メンバー専用）。
 * 代理ログイン中はクライアントセッションの代わりに adminBackup.access_token を
 * Authorization ヘッダに明示的に載せて呼ぶ必要がある。
 *
 * @param {{ dossier_id: string, content?: object, free_notes?: string, regenerate?: boolean }} payload
 * @param {string} adminAccessToken adminBackup.access_token（必須）
 */
export async function invokeUpdateCompanyDossier(payload, adminAccessToken) {
  if (!adminAccessToken) {
    return { data: null, error: { message: 'admin access token is required' } };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/update-company-dossier`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminAccessToken}`,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('[Edge] update-company-dossier error:', res.status, data);
      return { data, error: { status: res.status, message: data?.error || res.statusText } };
    }
    return { data, error: null };
  } catch (e) {
    console.error('[Edge] update-company-dossier exception:', e);
    return { data: null, error: { message: e.message } };
  }
}

/**
 * appointment_id でドシエ 1 件取得
 */
export async function fetchDossierByAppointment(appointmentId) {
  const { data, error } = await supabase
    .from('company_dossiers')
    .select('*')
    .eq('appointment_id', appointmentId)
    .maybeSingle();
  if (error) console.error('[DB] fetchDossierByAppointment error:', error);
  return { data, error };
}

/**
 * 複数 appointment_id のドシエを一括取得 → {appointment_id: dossier} map
 */
export async function fetchDossiersByAppointmentIds(appointmentIds) {
  if (!appointmentIds || appointmentIds.length === 0) return { data: {}, error: null };
  const { data, error } = await supabase
    .from('company_dossiers')
    .select('*')
    .in('appointment_id', appointmentIds);
  if (error) {
    console.error('[DB] fetchDossiersByAppointmentIds error:', error);
    return { data: {}, error };
  }
  const map = {};
  for (const row of data || []) {
    map[row.appointment_id] = row;
  }
  return { data: map, error: null };
}

/**
 * appointment_id のドシエ更新を Realtime で監視
 * @param {string} appointmentId
 * @param {(dossier: object) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function subscribeDossierByAppointment(appointmentId, onChange) {
  const channel = supabase
    .channel(`company_dossier_${appointmentId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'company_dossiers',
        filter: `appointment_id=eq.${appointmentId}`,
      },
      (payload) => {
        if (payload.new) onChange(payload.new);
      },
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); } catch (_) { /* noop */ }
  };
}
