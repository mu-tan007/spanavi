-- クライアント単位で「アポ取得時に事前確認をスキップ」する設定を追加する。
--
-- 背景:
--   これまで appointments.status を「事前確認済」で作るのは
--   call_lists.is_prospecting = true（クライアント開拓リスト）のときだけだった。
--   売り手ソーシングでも事前確認を行わないクライアントがあるため、
--   クライアント単位のスイッチで同じ扱いにできるようにする。
--
-- 影響:
--   事前確認ページ (PreCheckView) は status = 'アポ取得' のアポだけを対象にしているので、
--   ON にしたクライアントのアポは事前確認ページに出てこなくなる。
--   報酬・売上集計は「アポ取得 / 事前確認済 / 面談済」を等しく対象にしているため影響なし。

-- 本番のDDLは待ち行列を作らないよう lock_timeout を必ず付ける
set lock_timeout = '3s';

alter table public.clients
  add column if not exists skip_pre_check boolean not null default false;

comment on column public.clients.skip_pre_check is
  'true の場合、アポ取得時に appointments.status を「アポ取得」ではなく「事前確認済」で登録する（事前確認を行わないクライアント）';

-- 株式会社SECURITY BRIDGE は事前確認を行わない運用。
-- 同名クライアントが2件登録されていて両方現役のため、名前一致で両方 ON にする。
update public.clients
   set skip_pre_check = true
 where name = '株式会社SECURITY BRIDGE';
