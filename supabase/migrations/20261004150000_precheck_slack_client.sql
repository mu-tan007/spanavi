-- Slack でやり取りするクライアントへの事前確認の報告を、むー様の名前でアポ取得報告のスレッドに返信する（2026-10-04）
set lock_timeout = '5s';

-- クライアントとやり取りしている Slack チャンネル（共有チャンネル）。社名で検索してアポ取得報告のスレッドを探す範囲
alter table public.clients add column if not exists slack_channel_ids text[] not null default '{}';
comment on column public.clients.slack_channel_ids is 'クライアントとの共有チャンネル（事前確認の報告をアポ取得報告のスレッドに返信する先）。社内用のチャンネルは入れない';

-- 返信先のスレッドとメンション（process-precheck-events が探して入れる。送信は send-precheck-slack）
alter table public.precheck_events add column if not exists slack_reply_channel text;
alter table public.precheck_events add column if not exists slack_reply_ts text;
alter table public.precheck_events add column if not exists slack_reply_mentions text;

update public.clients c set slack_channel_ids = v.ch::text[]
  from (values
    ('レバレジーズM&Aアドバイザリー株式会社', '{C0BTJUYPM5E,C0BMDNUHLEB,C0BMDNTTUFR}'),
    ('株式会社ＨＣフィナンシャルアドバイザー', '{C0AK2C2PGEQ}'),
    ('株式会社NOAH', '{C0AENFGU73J}'),
    ('株式会社バリューシフトパートナーズ', '{C0BGGMUH7JT}'),
    ('株式会社ウィルゲート', '{C0AFDSV1Z55}')
  ) as v(name, ch)
 where c.org_id = 'a0000000-0000-0000-0000-000000000001' and c.name = v.name;
