-- 新規リスト取り込み時に「過去に別リストで除外済みの企業」を自動で除外する
--
-- 背景:
--   クライアントから受領するリストには、既に別リストで「除外」（クレーム懸念・廃番）に
--   なっている企業が重複して含まれることが多い。そういう企業に再架電させる無駄を防ぐため、
--   取り込み直後に同一企業を突き合わせて自動的に「除外」ステータスへ落とす。
--
-- 突き合わせキー（むー様指示 2026-07-22）:
--   「企業名」かつ「電話番号」の両方が一致した場合のみ除外する。
--   同名でも実体が別会社のケースがあるため、電話番号一致を必須にして誤爆を防ぐ。
--   企業名は spanavi_norm_company() で正規化し、
--   「株式会社○○」＝「(株)○○」＝「（株）○○」＝「㈱○○」＝「○○株式会社」を同一視する。
--   対象は「除外」ステータスのみ（「3回連続不通」「アポ獲得」は対象外）。
--
-- 除外の書き込みは既存アーキテクチャに準拠:
--   call_records に status='除外' の1件を挿入 → 既存トリガーが call_list_items.call_status と
--   mv_excluded_items を自動同期。加えて is_excluded / exclude_reason を明示更新し、
--   3つの除外表現（call_records / call_list_items / mv_excluded_items）を全て揃える。

set local search_path = public, extensions;

-- ── 企業名正規化 ─────────────────────────────────────────────
-- NFKC 正規化で全角/半角・㈱→(株) などを吸収 → 法人格表記と空白・記号を除去。
-- 前株/後株どちらでも同じ結果になるよう、法人格語は位置に依らず削除する。
create or replace function public.spanavi_norm_company(p text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(normalize(coalesce(p, ''), NFKC)),
        -- 法人格の表記（NFKC後は () 半角・全角語に統一されている前提）を除去
        '株式会社|\(株\)|有限会社|\(有\)|合同会社|\(同\)|合資会社|\(資\)|合名会社|\(名\)|一般社団法人|一般財団法人|公益社団法人|公益財団法人|医療法人社団|医療法人|社会福祉法人|特定非営利活動法人|npo法人',
        '',
        'g'
      ),
      -- 空白・記号を除去（両側同じ処理なので突き合わせに影響しない）
      '[[:space:]()・･,、.．。/／\-‐~＆&''"`|]',
      '',
      'g'
    ),
    ''
  );
$$;

comment on function public.spanavi_norm_company(text) is
  '企業名の突き合わせ用正規化（NFKC＋法人格語/空白/記号除去）。株式会社○○=(株)○○=㈱○○=○○株式会社を同一視。';

-- ── 取り込み時 自動除外 RPC ──────────────────────────────────
-- p_list_id: 取り込み直後の対象リスト。返り値: 自動除外した件数。
create or replace function public.auto_exclude_known_excluded(p_list_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org   uuid;
  v_count integer := 0;
begin
  select org_id into v_org from public.call_lists where id = p_list_id;
  if v_org is null then
    return 0;
  end if;

  -- 呼び出しユーザーは対象リストと同じ org に属していること（横断操作の防止）
  if v_org is distinct from public.get_user_org_id() then
    raise exception 'auto_exclude_known_excluded: not authorized for this org';
  end if;

  -- 他リストで「除外」済みの (正規化企業名, 電話番号) を集約（由来リスト名も保持）
  -- マッチした本リストの行を一時表に確定
  create temporary table _auto_excl_matched on commit drop as
  with excluded_src as (
    select nc, np, min(src_list_name) as src_list_name
    from (
      select public.spanavi_norm_company(e.company) as nc,
             regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') as np,
             cl.name as src_list_name
      from public.call_list_items e
      join public.call_lists cl on cl.id = e.list_id
      where e.org_id = v_org
        and e.list_id <> p_list_id
        and e.call_status = '除外'
    ) q
    where q.nc is not null
      and length(q.np) >= 10   -- 桁数が足りない電話は突き合わせに使わない（誤爆防止）
    group by nc, np
  )
  select i.id, i.org_id, i.list_id, s.src_list_name
  from public.call_list_items i
  join excluded_src s
    on public.spanavi_norm_company(i.company) = s.nc
   and regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g') = s.np
  where i.list_id = p_list_id
    and coalesce(i.is_excluded, false) = false
    and coalesce(i.call_status, '') <> '除外';

  select count(*) into v_count from _auto_excl_matched;
  if v_count = 0 then
    return 0;
  end if;

  -- 除外レコードを1件挿入（トリガーが call_status / mv_excluded_items を同期）
  insert into public.call_records (org_id, item_id, list_id, round, status, memo, called_at, getter_name)
  select org_id, id, list_id, 1, '除外',
         '他リスト「' || coalesce(src_list_name, '?') || '」で除外済みのため取り込み時に自動除外',
         now(), '自動除外'
  from _auto_excl_matched;

  -- is_excluded / exclude_reason はアプリ算出フラグなので明示的に揃える
  update public.call_list_items i
  set is_excluded    = true,
      call_status    = '除外',
      exclude_reason = '他リスト「' || coalesce(m.src_list_name, '?') || '」で除外済み（取り込み時自動除外）'
  from _auto_excl_matched m
  where i.id = m.id;

  return v_count;
end;
$$;

comment on function public.auto_exclude_known_excluded(uuid) is
  '新規リスト取り込み後、他リストで除外済みの同一企業（企業名かつ電話番号一致）を自動除外し件数を返す。';

grant execute on function public.spanavi_norm_company(text) to authenticated, service_role;
grant execute on function public.auto_exclude_known_excluded(uuid) to authenticated, service_role;
