-- 買収タブ：段階をむー様の進み方にそろえる（2026-10-06）
--   受領 → NN済（ノンネームシート受領済み）→ IM済 → トップ面談済 → LOI済 → DD中 → SPA済 → CL
--   値：received → nonname → im_received → top_meeting → loi_submitted → dd → definitive_agreement → closed_won
--   終了：declined_by_us（見送り）／lost（不成約）／name_clear_denied（ネームクリア不可）
--   NDA・QA中・基本合意は段階に置かない。既存の行は次のように読み替える
--     nda → nonname（NDAはノンネームを受けたあとに結ぶ）
--     qa  → IMを受けている案件（企業名がある／IMの書類がある）は im_received、ノンネームのままなら nonname
--     basic_agreement → loi_submitted
set lock_timeout = '5s';
alter table public.acq_deal_stage_events drop constraint if exists acq_deal_stage_events_stage_check;

update public.acq_deal_stage_events set stage = 'nonname' where stage = 'nda';
update public.acq_deal_stage_events e set stage = case
    when exists (select 1 from public.acq_deals d where d.id = e.deal_id and d.name is not null)
      or exists (select 1 from public.acq_documents x where x.deal_id = e.deal_id and x.doc_type = 'im')
    then 'im_received' else 'nonname' end
 where stage = 'qa';
update public.acq_deal_stage_events set stage = 'loi_submitted' where stage = 'basic_agreement';
update public.acq_deal_stage_events set stage = 'nonname' where stage = 'candidate';

-- ノンネームの書類があるのに NN済 を通っていない案件は、受領日で NN済 を足す
insert into public.acq_deal_stage_events (org_id, deal_id, stage, occurred_on, note)
select d.org_id, d.id, 'nonname', coalesce(d.received_on, (now() at time zone 'Asia/Tokyo')::date), 'ノンネームの書類あり（段階の整理で追加）'
  from public.acq_deals d
 where exists (select 1 from public.acq_documents x where x.deal_id = d.id and x.doc_type = 'nonname')
   and not exists (select 1 from public.acq_deal_stage_events e where e.deal_id = d.id and e.stage <> 'received');

alter table public.acq_deal_stage_events add constraint acq_deal_stage_events_stage_check check (stage in (
  'received', 'nonname', 'im_received', 'top_meeting', 'loi_submitted', 'dd', 'definitive_agreement', 'closed_won',
  'declined_by_us', 'lost', 'name_clear_denied'));
