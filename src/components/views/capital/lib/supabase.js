// Spanavi フル統合後は Spanavi 本体の supabase client をそのまま使う。
// cap_* プレフィックスのテーブルは Spanavi プロジェクト内にあり、RLS は authenticated-only。
export { supabase } from '../../../../lib/supabase';
