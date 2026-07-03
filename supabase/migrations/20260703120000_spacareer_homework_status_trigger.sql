-- ============================================================
-- スパキャリ 事後課題ステータスの自動再計算トリガー
-- ------------------------------------------------------------
-- 【背景 / バグ】
--  受講生が「回答を提出」を押すと、クライアントは
--    ①設問(spacareer_homework_items)の回答・提出時刻を更新
--    ②提出履歴(spacareer_homework_submissions)を1行 INSERT
--    ③課題ヘッダー(spacareer_homework)の status/submitted_at を更新
--  の3処理を行う。①②は受講生向け RLS があるため成功するが、
--  ③のヘッダー更新ポリシー(spacareer_homework_write)は admin/trainer のみ許可で
--  受講生を含まない。PostgREST の UPDATE は RLS で対象行が絞られると
--  「エラー無し・0行更新」で素通りするため、status が 'unsubmitted' のまま固定され、
--  「提出したのに未提出扱い」になっていた（全回・全受講生で発生）。
--
-- 【方針】
--  ヘッダーの status/submitted_at/first_completed_at を、設問(items)の実データから
--  SECURITY DEFINER トリガーで自動再計算する。これにより操作者(受講生/トレーナー/管理者)の
--  RLS 権限に依存せず常に整合する。クライアント側の③更新は残っていても無害（同値になる）。
--
-- 【ステータス定義】(既存クライアントの isAnswered / recompute と整合)
--  対象 = is_published=true の設問のみ。
--  「提出済み判定」は submitted_at IS NOT NULL の設問数で行う
--   （保存だけ=submitted_at 無し は提出に数えない＝「保存」と「提出」を区別）。
--    submitted=0                      -> 'unsubmitted'（未提出。保存のみもここ）
--    0 < submitted < 公開設問数        -> 'partial'    （部分提出）
--    submitted = 公開設問数            -> 'submitted'  （提出済み）
--  トレーナーが手動で 'completed'（レビュー完了）にした課題は尊重して触らない。
-- ============================================================

set local search_path = public, extensions;

-- 1課題ぶんのヘッダーステータスを実データから再計算する
create or replace function spacareer_recompute_homework_status(p_homework_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cur_status   text;
  v_first        timestamptz;
  v_total        int;
  v_submitted    int;
  v_max_sub      timestamptz;
  v_new_status   text;
begin
  select status, first_completed_at
    into v_cur_status, v_first
    from spacareer_homework
   where id = p_homework_id;
  if not found then
    return;
  end if;

  -- トレーナーが完了にしたものは自動再計算で巻き戻さない
  if v_cur_status = 'completed' then
    return;
  end if;

  select
    count(*) filter (where is_published),
    count(*) filter (where is_published and submitted_at is not null),
    max(submitted_at) filter (where is_published)
    into v_total, v_submitted, v_max_sub
    from spacareer_homework_items
   where homework_id = p_homework_id;

  if coalesce(v_submitted, 0) = 0 then
    v_new_status := 'unsubmitted';
  elsif v_submitted < coalesce(v_total, 0) then
    v_new_status := 'partial';
  else
    v_new_status := 'submitted';
  end if;

  update spacareer_homework
     set status = v_new_status,
         submitted_at = case when coalesce(v_submitted,0) > 0 then v_max_sub else null end,
         -- 初回100%達成日時は一度だけ記録（提出期限判定に使用）
         first_completed_at = case
           when v_new_status = 'submitted' and first_completed_at is null then v_max_sub
           else first_completed_at
         end,
         updated_at = now()
   where id = p_homework_id
     -- 冪等: 変化が無ければ書かない（不要な updated_at 更新とトリガー連鎖を防ぐ）
     and (status is distinct from v_new_status
          or submitted_at is distinct from (case when coalesce(v_submitted,0) > 0 then v_max_sub else null end)
          or (v_new_status = 'submitted' and first_completed_at is null));
end;
$$;

-- items の変更を親ヘッダーへ反映するトリガー関数
create or replace function spacareer_homework_items_status_trg()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform spacareer_recompute_homework_status(coalesce(new.homework_id, old.homework_id));
  return null; -- AFTER トリガーにつき戻り値は無視される
end;
$$;

drop trigger if exists trg_spacareer_homework_items_status on spacareer_homework_items;

-- 提出/回答/公開状態の変化時のみ発火（トレーナーコメント等の更新では発火させない）
create trigger trg_spacareer_homework_items_status
after insert
   or delete
   or update of submitted_at, answer_text, attached_files, is_published
on spacareer_homework_items
for each row
execute function spacareer_homework_items_status_trg();

-- ============================================================
-- 既存データのバックフィル（RLSバグで未反映だった全課題を再計算）
-- ============================================================
do $$
declare
  r record;
begin
  for r in select id from spacareer_homework loop
    perform spacareer_recompute_homework_status(r.id);
  end loop;
end $$;
