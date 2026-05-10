-- clients テーブルの insert / update / delete 時に
-- 該当する cap_ma_agencies.linked_client_id を再計算する trigger。
--
-- - INSERT / UPDATE: NEW.name を正規化して同じ正規化結果を持つ cap_ma_agencies を探し、
--                    linked_client_id を NEW.id にセット (古い別 client が握っていれば剥がす)。
-- - DELETE / UPDATE で client.name が変わって対象外になる場合: 旧 client_id を握っていた
--                    cap_ma_agencies の linked_client_id を null に戻す。
-- - 対象 engagement: seller_sourcing のみ (PE/事業会社の clients は他 engagement なので素通り)。

set local search_path = public, extensions;

create or replace function _firms_relink_for_client(p_client_id uuid)
returns void
language plpgsql
as $$
declare
  c_row clients%rowtype;
  c_eng_slug text;
  c_norm text;
begin
  select * into c_row from clients where id = p_client_id;
  if not found then
    -- client が既に削除されていた場合はリンクを剥がすだけ
    update cap_ma_agencies set linked_client_id = null where linked_client_id = p_client_id;
    return;
  end if;

  select e.slug into c_eng_slug from engagements e where e.id = c_row.engagement_id;

  -- まず古いリンク (このクライアントが他で握っていたもの) を剥がす
  update cap_ma_agencies set linked_client_id = null where linked_client_id = c_row.id;

  -- seller_sourcing 配下でなければここで終わり (リンク復活させない)
  if c_eng_slug is distinct from 'seller_sourcing' then return; end if;
  if c_row.name is null then return; end if;

  c_norm := normalize_company_name(c_row.name);
  if length(c_norm) = 0 then return; end if;

  -- 該当する Firms 行 (まだ linked_client_id が null のもの) を見つけて紐付け
  -- 同名の機関が複数あった場合は最初の1件 (id 順)。
  with target as (
    select id from cap_ma_agencies
    where normalize_company_name(name) = c_norm
      and linked_client_id is null
    order by id
    limit 1
  )
  update cap_ma_agencies cm
  set linked_client_id = c_row.id
  from target t
  where cm.id = t.id;
end;
$$;

create or replace function _firms_relink_trigger_fn()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update cap_ma_agencies set linked_client_id = null where linked_client_id = old.id;
    return old;
  end if;

  -- INSERT / UPDATE: name か engagement_id が変わったら再計算
  if tg_op = 'INSERT'
     or new.name is distinct from old.name
     or new.engagement_id is distinct from old.engagement_id
  then
    perform _firms_relink_for_client(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_firms_relink on clients;
create trigger trg_firms_relink
  after insert or update or delete on clients
  for each row execute function _firms_relink_trigger_fn();
