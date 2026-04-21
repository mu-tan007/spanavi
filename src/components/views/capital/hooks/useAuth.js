import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Spanavi 統合時の最小 useAuth。Caesar Supabase の auth.getUser() を見て、
// そこからプロファイル (users.tenant_id / role) を引く。ログインしていない場合は null。
// Spanavi 本体の認証とは独立しているので、Capital 機能のフル利用には Caesar 側でのログインが別途必要。
export function useAuth() {
  const [user, setUser] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        setUser(user);
        const { data: profile } = await supabase
          .from('users')
          .select('tenant_id, role')
          .eq('id', user.id)
          .maybeSingle();
        if (!cancelled && profile) {
          setTenantId(profile.tenant_id);
          setRole(profile.role);
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { user, tenantId, role };
}
