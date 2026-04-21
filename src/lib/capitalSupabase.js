// Spartia Capital (旧 Caesar) 専用 Supabase クライアント
// Caesar 独立プロジェクト (qhrcvzhshqoteepqewir) に接続する。
// Spanavi 本体の supabase (baiiznjzvzhxwwqzsozn) とは別物。
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_CAPITAL_SUPABASE_URL
  || 'https://qhrcvzhshqoteepqewir.supabase.co';
const anonKey = import.meta.env.VITE_CAPITAL_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFocmN2emhzaHFvdGVlcHFld2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNDY2NzQsImV4cCI6MjA5MTYyMjY3NH0.E0v3VnlggOJ3jbOLO_uNLH7jLl8cRfPspdk9aAxg_6o';

export const capitalSupabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'sb-qhrcvzhshqoteepqewir-auth-token',
  },
  global: {
    headers: { 'x-client-info': 'spanavi-capital' },
  },
});
