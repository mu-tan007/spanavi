-- メルマガに Reply-To(返信先) を追加
--
-- 送信元(from)は評判分離のため newsletter.ma-sp.co のままとし、
-- 返信を実インボックス(例 shinomiya@ma-sp.co)へ誘導するための reply_to 列。
-- send-campaign は reply_to があれば Resend payload に reply_to を付与する。

set local search_path = public, extensions;

alter table public.email_campaigns
  add column if not exists reply_to text;

comment on column public.email_campaigns.reply_to is
  'メルマガの返信先(Reply-To)。未設定なら from_email に返信が返る。送信ドメイン評判分離のため from は newsletter.ma-sp.co のまま、返信を実インボックス(例 shinomiya@ma-sp.co)へ誘導する用途。';
