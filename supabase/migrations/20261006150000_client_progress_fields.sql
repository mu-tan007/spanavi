-- 顧客管理の一覧に「段階・最後のやり取り・次の一手」を出すための欄（2026-10-06）
-- 状態（status）はこれまでどおり。段階（stage）は状態の中をもう一段細かく分ける
alter table public.clients
  add column if not exists service text,               -- 売り手ソーシング / 買い手マッチング / IFA向け / その他
  add column if not exists stage text,                 -- 未接触 / 初回接触済 / 初回面談予定 / 初回面談済・検討中 / 提案・見積済 / 契約済・未開始 / 架電中 / 一時停止（先方都合） / 停止 / 失注
  add column if not exists last_contact_at date,
  add column if not exists last_contact_channel text,  -- メール / Slack / 電話 / 面談 / XのDM / LINE / Chatwork / Facebook など
  add column if not exists last_contact_from text,     -- 先方 / 弊社
  add column if not exists last_contact_summary text,
  add column if not exists next_action text,
  add column if not exists next_action_owner text,     -- むー様 / インターン / 先方 / Claude
  add column if not exists next_action_due date,
  add column if not exists blocker text;               -- 止まっている理由

comment on column public.clients.stage is '状態の中の段階。一覧の絞り込みに使う';
comment on column public.clients.blocker is '止まっている理由（一覧の次の一手の下に出す）';
