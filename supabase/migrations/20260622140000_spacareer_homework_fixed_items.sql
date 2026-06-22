-- スパキャリ: 事後課題の「固定課題マスター」
--
-- 第2〜8回の事後課題は「全員共通の固定課題」＋「議事録等を踏まえたAI変動課題」を
-- 組み合わせて必ず30問にする。本テーブルは回ごとの固定課題（全員共通）を保持する。
-- 受講生は直接読まない（課題生成時にトレーナー/管理者セッションが読む）。

set local search_path = public, extensions;

create table if not exists public.spacareer_homework_fixed_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  session_no    smallint not null,
  position      smallint not null,
  section       text,
  question_text text not null,
  question_hint text,
  is_required   boolean not null default true,
  item_type     text not null default 'text',
  template_url  text,
  template_name text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, session_no, position)
);

create index if not exists idx_spacareer_hw_fixed_session
  on public.spacareer_homework_fixed_items (org_id, session_no, position);

alter table public.spacareer_homework_fixed_items enable row level security;

-- 認証済みは閲覧可（課題生成時にトレーナー/管理者が読む）
drop policy if exists spacareer_hw_fixed_select on public.spacareer_homework_fixed_items;
create policy spacareer_hw_fixed_select on public.spacareer_homework_fixed_items
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- 編集は管理者のみ
drop policy if exists spacareer_hw_fixed_admin_write on public.spacareer_homework_fixed_items;
create policy spacareer_hw_fixed_admin_write on public.spacareer_homework_fixed_items
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- 第2回 固定課題（9問）を seed
insert into public.spacareer_homework_fixed_items
  (org_id, session_no, position, section, question_text, question_hint, is_required, item_type)
select o.org_id, 2, v.position, v.section, v.question_text, v.question_hint, true, 'text'
from (select distinct org_id from public.spacareer_customers) o
cross join (values
  (1, '実践アクション',
   'クラウドワークスで高単価案件（2万円以上）に10件応募してください。応募した案件名と結果（返信の有無など）を記載してください。',
   '案件のジャンルや、その案件を選んだ理由も書くと振り返りに役立ちます。'),
  (2, '実践アクション',
   'クラウドワークスのプロフィール文章を作成し、Slackでトレーナーに送付して添削（フィードバック）をもらってください。送付した旨と、添削で得た気づきを記載してください。',
   '送付前の自分のプロフィール文もここに貼っておきましょう。'),
  (3, '実践アクション',
   'BizonとYentaのアプリを導入し、初期設定（プロフィール登録等）を完了してください。完了した旨と、設定したプロフィールの要点を記載してください。',
   'どんな相手とつながりたいかを意識して設定しましょう。'),
  (4, 'アウトプット（直案件DB開放まで）',
   '「信頼性の担保」について、自分なりに具体的にテキストでアウトプットしてください。',
   '相手に信頼してもらうために何を示すか、を具体的に書いてください。'),
  (5, 'アウトプット（直案件DB開放まで）',
   '「商談スキルの要素」について、自分なりに具体的にテキストでアウトプットしてください。',
   '商談で何が決め手になるか、要素分解してみましょう。'),
  (6, 'アウトプット（直案件DB開放まで）',
   '特定の「痛み」を知る要素について、自分なりに具体的にテキストでアウトプットしてください。',
   '顧客の痛みをどう見つけるか、という観点で書いてください。'),
  (7, 'リサーチ＆ツール作成',
   'AI・Google検索・Bizon・Yenta・クラウドワークスの案件応募などを通じて、特定企業がどんな「痛み」に向き合って価値提供しているかをリサーチし、その内容を200文字程度で記載してください。',
   '企業名・業界・痛みの具体を明確にしてください。'),
  (8, 'リサーチ＆ツール作成',
   '特定の業界・企業の「痛み」を補うツールを作成してください。Claude Codeなどで作成し、Vercel・NetlifyにデプロイしたURLを記載（添付）してください。',
   'デプロイ済みのURLを必ず貼ってください。'),
  (9, 'リサーチ＆ツール作成',
   '作成したツールについて、Slackのチャットでトレーナーに壁打ち（フィードバック）をもらってください。実施した旨と、得たフィードバックを記載してください。',
   'もらったフィードバックを踏まえた次の改善案も書けると良いです。')
) as v(position, section, question_text, question_hint)
on conflict (org_id, session_no, position) do nothing;
