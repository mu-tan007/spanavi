-- ============================================================
-- call_sessions に org_id カラムを追加
-- RLSポリシー (20260326000001) が org_id でフィルタしているが
-- カラム自体が存在しなかったため全レコードが非表示になっていた
-- ============================================================

-- 1. org_id カラムを追加（NULL許容で開始）
alter table public.call_sessions
  add column if not exists org_id uuid;

-- 2. 既存レコードのバックフィル: caller_name → members.name → members.org_id
update public.call_sessions cs
set org_id = m.org_id
from public.members m
where cs.org_id is null
  and cs.caller_name = m.name;

-- 3. user_{id} 形式の caller_name にも対応
update public.call_sessions cs
set org_id = m.org_id
from public.members m
where cs.org_id is null
  and cs.caller_name like 'user_%'
  and m.id = replace(cs.caller_name, 'user_', '')::uuid;

-- 4. それでもNULLのレコードはデフォルト組織IDで埋める
update public.call_sessions
set org_id = 'a0000000-0000-0000-0000-000000000001'
where org_id is null;

-- 5. NOT NULL 制約を追加
alter table public.call_sessions
  alter column org_id set not null;
