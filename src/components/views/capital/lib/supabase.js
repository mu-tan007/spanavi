// capital 配下は Caesar 専用 Supabase (qhrcvzhshqoteepqewir) に接続する。
// 既存 Caesar コードは `../lib/supabase` を期待しているので、
// Spanavi 側 capitalSupabase を `supabase` という名前で再輸出する。
export { capitalSupabase as supabase } from '../../../../lib/capitalSupabase';
