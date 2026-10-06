-- 文字起こしした録音の秒数（transcribe-call-batch が保存。録音分析用 2026-10-06）
alter table public.call_records add column if not exists transcript_seconds integer;
comment on column public.call_records.transcript_seconds is '文字起こしした録音の秒数（transcribe-call-batch が保存）';
