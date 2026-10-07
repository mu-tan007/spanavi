// 入社手続き（2026-10-07）。Edge Function onboarding-join の呼び出し
import { supabase } from './supabase';

export async function callOnboarding(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('onboarding-join', { body: { action, ...body } });
  if (error) {
    let msg = error.message || '通信に失敗しました';
    try { msg = (await error.context?.json())?.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}

// 打ち間違いの多い形（「.@」「..」）も弾く。サーバーと同じ条件
export function emailLooksOk(e) {
  const v = String(e || '').trim();
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v) && !/\.@|\.\.|^\./.test(v);
}

export const joinUrl = (token) => `${window.location.origin}/join/${token}`;
