-- Fix: TEXT[] || TEXT が空配列時にmalformed array literalエラーになる問題
-- 原因: PostgreSQLが TEXT[] || TEXT を TEXT[] || TEXT[] と解釈しようとし、
--        'cm.revenue_k IS NOT NULL' をarray literalとしてparseしようとして失敗
-- 対策: array_append() を使用して明示的に要素追加

-- (本マイグレーションの内容はSupabase apply_migrationで直接適用済み)
-- search_company_master関数のv_rev_parts/v_ni_partsの連結をarray_appendに変更
