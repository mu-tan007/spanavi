set local search_path = public, extensions;

-- リスト単位のアポ単価上書き（税別円）。
-- NULL = 従来どおりクライアント×商材の報酬マスタを使用。
-- 同一クライアント・同一商材でもリストごとに単価が異なるケース
-- （例: セレストキャピタル IFA案件6万/セールスプロモーション案件8万）に対応する。
alter table public.call_lists add column if not exists appo_unit_price numeric;
