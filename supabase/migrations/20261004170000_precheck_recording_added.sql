-- 録音を待たずに報告の下書きを先に作り、録音が見つかったら書き足す（2026-10-04 篠宮）
set lock_timeout = '5s';
alter table public.precheck_events add column if not exists recording_added text;
comment on column public.precheck_events.recording_added is '報告の下書きへの録音リンク：pending（見つかったら書き足す）／done（入れた）／skip（入れない・下書きが送信済み）';
