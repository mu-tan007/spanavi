set local search_path = public, extensions;

-- キーマン携帯番号を call_list_items に追加。
-- 既存 sub_phone_number は「本社以外の支店/営業所」用として温存し、
-- キーマン(担当者)の携帯番号は新カラム keyman_mobile に格納する。
alter table call_list_items add column if not exists keyman_mobile text;

create index if not exists call_list_items_keyman_mobile_idx
  on call_list_items (keyman_mobile)
  where keyman_mobile is not null;

create index if not exists call_list_items_sub_phone_number_idx
  on call_list_items (sub_phone_number)
  where sub_phone_number is not null;

comment on column call_list_items.keyman_mobile is 'キーマン(担当者)の携帯番号。会社番号(phone)とは別に発信/着信マッチングに使う';
comment on column call_list_items.sub_phone_number is '本社以外の支店/営業所など別事業所の電話番号';
