-- Slackに上がった架電録音の文字起こし（録音分析用・service roleのみ 2026-10-06）
create table if not exists public.slack_recording_transcripts (
  file_id text primary key,
  channel text not null,
  file_name text,
  posted_at timestamptz,
  message_text text,
  transcript text,
  seconds integer,
  created_at timestamptz not null default now()
);
alter table public.slack_recording_transcripts enable row level security;
comment on table public.slack_recording_transcripts is 'Slackに上がった架電録音の文字起こし（録音分析用・service roleのみ）';
