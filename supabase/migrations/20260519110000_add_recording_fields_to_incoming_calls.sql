set local search_path = public, extensions;

-- 着信録音の自動取り込みに必要なフィールド群を incoming_calls に追加。
-- Webhook で通話開始時に zoom_call_id を保存し、終了時に duration を記録。
-- 録音 URL は get-zoom-recording 経由で後から埋める。
alter table incoming_calls add column if not exists zoom_call_id text;
alter table incoming_calls add column if not exists recording_url text;
alter table incoming_calls add column if not exists duration_sec integer;
alter table incoming_calls add column if not exists answered_by_zoom_user_id text;
alter table incoming_calls add column if not exists ended_at timestamptz;

create index if not exists incoming_calls_zoom_call_id_idx
  on incoming_calls (zoom_call_id)
  where zoom_call_id is not null;

create index if not exists incoming_calls_caller_number_idx
  on incoming_calls (caller_number)
  where caller_number is not null;

comment on column incoming_calls.zoom_call_id is 'Zoom Phone call_id（webhook で受信開始時に保存、後の録音突合に使用）';
comment on column incoming_calls.recording_url is 'Zoom Phone Cloud Recording の download URL（通話終了後に get-zoom-recording 経由で保存）';
comment on column incoming_calls.duration_sec is '通話時間（秒）。通話終了 webhook で記録';
