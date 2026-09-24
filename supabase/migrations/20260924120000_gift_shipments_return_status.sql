-- ギフトDMの返送・受取拒否を持つ列。到着の集計から外し、画面では到着欄にバッジで出す。
-- 本番へは apply_migration で適用済み（2026-09-24）。
set lock_timeout = '3s';
alter table public.gift_shipments
  add column if not exists return_status text check (return_status in ('受取拒否','返送')),
  add column if not exists return_noted_on date;
comment on column public.gift_shipments.return_status is '受取拒否＝配送業者経由で倉庫へ戻る／返送＝受取企業から返送すると連絡があった';
comment on column public.gift_shipments.return_noted_on is '返送・受取拒否を把握した日';
-- gift_shipment_stats の末尾に s.return_status, s.return_noted_on を追加（他の列は変更なし）
