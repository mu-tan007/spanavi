import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Spanavi 統合後は Spanavi 本体の認証をそのまま使う。
// tenant_id / role は廃止 (multi-tenant を止めて MASP 単一テナント化)。
export function useAuth() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!cancelled) setUser(user || null);
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { user, tenantId: null, role: null };
}
