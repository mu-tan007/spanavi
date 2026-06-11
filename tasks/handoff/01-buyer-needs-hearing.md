# タスク01: 買い手マッチング ニーズヒアリング機能

> **【2026-06-11 実装完了 / 本番デプロイ済み — commit f706e2d】**
> ただし当初の §2「org単位の共有プール」設計は、むー様の確定指示で**リスト駆動・クライアント単位**へ方針転換した。最終仕様は以下（§2-4の旧記述より優先）:
> - 識別: 架電リストの engagement が **slug='matching'（買い手マッチング, カテゴリM&A）** のときだけ機能が有効
> - 架電画面(CallFlowView): 上記リストのときだけ「買収ニーズを記録」ボタン＋7項目モーダル。保存時 client_id = 架電リストのクライアントを自動紐付け
> - ポータル: 買い手マッチングの架電リストを持つクライアントだけ「ニーズヒアリング」タブを自動表示（手動フラグ is_buyer_matching は不使用）。中身は **client_id 一致の自分宛のみ**（RLS bnh_portal_select をクライアント単位に変更）
> - DB: buyer_needs_hearings に client_id 列追加済み。migration 20260610140000 / 20260611100000
> - LST等「売り手ソーシング＋買い手マッチング両方」のクライアントは、従来3タブ＋ニーズヒアリングの4タブが共存。中身は混ざらない
> 残: むー様による実画面での保存→ポータル表示の最終確認のみ。

> 着手前に同フォルダの `README.md`（共通前提・鉄則・デザインルール・むー様への接し方）を必ず読むこと。

---

## 0. 目的（むー様の言語化そのまま）

買い手マッチングでは、アポの成否と無関係に「アプローチ先企業がどんな会社を買収したいか
（＝買収ニーズ）」を聞くこと自体が、各クライアントから求められる実績。集めた買いニーズは、
買い手マッチング契約クライアントのポータルに**どんどん共有・蓄積**されていく。

## 1. 業務フロー（むー様と確定済み）

- 買い手マッチング = 売り案件を持っている状態で「買ってくれる人いませんか？」と営業。
  架電先は買い手企業 / それを担当するM&A仲介・FA・ファンド。
- 架電の流れの中で買収ニーズを聞く。**アポが取れなくても、ニーズが聞けたらそれが実績**。
- 集めた買いニーズは「特定の1社のため」ではなく、**買い手マッチング契約クライアント全員が
  ポータルで見られる共有プール**として蓄積する（毎回クライアントを選ばない）。

## 2. 確定仕様（変更しないこと）

- ニーズヒアリングは **アポと完全に別物の独立した記録**（アポのstatusに混ぜない＝売上/報酬計算に干渉させない）
- **架電画面に「買収ニーズを記録」ボタン** → 7項目フォームで記入・保存（将来: 録音からAI自動生成）
- **org単位の共有プール**に蓄積
- ポータルでは「**買い手マッチング契約**」フラグ(`clients.is_buyer_matching`)がONのクライアントにだけ
  「ニーズヒアリング」タブで表示。フラグは**むー様が手動でON**にする
- なぜ独立テーブルか: 営業代行は商材/業務種別が「売り手ソーシング1画面」に間借りしていて構造が
  入り組んでいる。その中に組み込むと将来の整理に巻き込まれる。独立させて切り離す＝負債を増やさない。

## 3. 買収ニーズ7項目（全て自由記述テキスト）

| キー | 表示名 |
|---|---|
| industry | 業種 |
| area | エリア |
| revenue | 売上 |
| operating_profit | 営業利益 |
| budget | 予算 |
| purpose | 目的 |
| memo | メモ |

（M&Aの条件は「5億〜30億」「EBITDA1億以上」等、幅・但し書きが多いため数値でなくテキスト）

## 4. 実装手順（この順で1つずつ。各ステップ後に実物確認）

### Step 1: DB（migration を MCP `apply_migration` で本番適用 ＋ `supabase/migrations/` にファイルも置く）

```sql
set local search_path = public, extensions;

create table if not exists public.buyer_needs_hearings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  company_name     text not null,            -- アプローチ先（誰にヒアリングしたか）
  industry         text, area text, revenue text, operating_profit text,
  budget           text, purpose text, memo text,   -- 買収ニーズ7項目
  getter_name      text,                     -- ヒアリングした担当者名
  hearing_date     date default current_date,
  list_id          uuid, item_id uuid, recording_url text, created_by uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists buyer_needs_hearings_org_idx
  on public.buyer_needs_hearings(org_id, created_at desc);
alter table public.buyer_needs_hearings enable row level security;

-- 社内メンバー: 自org内で全操作
create policy "bnh_internal_all" on public.buyer_needs_hearings
  for all using (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

-- ポータル: 買い手マッチング契約クライアントが自org分を閲覧
create policy "bnh_portal_select" on public.buyer_needs_hearings
  for select using (exists (
    select 1 from public.clients c
    where c.auth_user_id = auth.uid() and c.is_buyer_matching = true
      and c.org_id = buyer_needs_hearings.org_id
  ));

-- 契約フラグ（ポータル表示の可否を手動制御）
alter table public.clients add column if not exists is_buyer_matching boolean not null default false;
```

**確認**: `select count(*) from information_schema.tables where table_name='buyer_needs_hearings';` が1、
`...columns where table_name='clients' and column_name='is_buyer_matching';` が1。

### Step 2: lib関数（`src/lib/supabaseWrite.js` の末尾付近に追加）

```js
export async function insertBuyerNeedsHearing(payload) {
  const orgId = getOrgId()
  const { data, error } = await supabase.from('buyer_needs_hearings').insert({
    org_id: orgId,
    company_name: payload.company_name,
    industry: payload.industry || null, area: payload.area || null,
    revenue: payload.revenue || null, operating_profit: payload.operating_profit || null,
    budget: payload.budget || null, purpose: payload.purpose || null, memo: payload.memo || null,
    getter_name: payload.getter_name || null,
    hearing_date: payload.hearing_date || new Date().toISOString().slice(0,10),
    list_id: payload.list_id || null, item_id: payload.item_id || null,
  }).select().single()
  if (error) console.error('[DB] insertBuyerNeedsHearing error:', error)
  return { data, error }
}

export async function fetchBuyerNeedsHearings({ limit = 300 } = {}) {
  const orgId = getOrgId()
  const { data, error } = await supabase.from('buyer_needs_hearings')
    .select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit)
  if (error) console.error('[DB] fetchBuyerNeedsHearings error:', error)
  return { data: data || [], error }
}
// 必要に応じて updateBuyerNeedsHearing(id, patch) / deleteBuyerNeedsHearing(id) も同様に追加
```

### Step 3: 入力UI（架電画面 `src/components/views/CallFlowView.jsx`・2800行前後の巨大ファイル）

- ⚠️ **必ず Grep→Read で実物を確認してから Edit**（記憶の行番号を信用しない）。
- PC版の架電結果ボタン群は、インラインの `statuses` 配列を `.map` して `handleResult(st.label)` を
  呼ぶグリッド。**そのグリッドの直後**に「買収ニーズを記録」ボタン（`<Button>` 使用、絵文字なし）を置く。
  押すと買収ニーズ入力モーダルを開く（state `needsModal` に選択中の企業 `selectedRow` を入れる）。
- モバイル版にも同等の結果ボタン箇所があるので、必要なら同様に。
- **NeedsHearingModal**（7項目フォーム）を作る。共通UI（`<Input>` 等、textareaはネイティブ可だが
  border/color/fontはトークン化）。保存で:
  `insertBuyerNeedsHearing({ company_name: needsModal.company, item_id: needsModal.id,
    list_id: list?._supaId, getter_name: currentUser, industry, area, revenue, operating_profit,
    budget, purpose, memo })` → 成功で閉じる。
- CallFlowView の主な参照: `selectedRow.company`(企業名), `selectedRow.id`(item_id), `list`(props), `currentUser`(props)。

### Step 4: ポータル表示（`src/components/client/ClientPortalDashboard.jsx`・既読済み588行）

- 現状はアポ一覧のみ（appointments を client_id で取得 → AppoCard → AppoDetailModal）。
- 上部に**タブUI**（「アポイント」/「ニーズヒアリング」）を追加。
- 「ニーズヒアリング」選択時:
  `supabase.from('buyer_needs_hearings').select('*').eq('org_id', orgId).order('created_at',{ascending:false})`
  （RLSが契約クライアント分に自動制限する）。7項目を見やすく表示（入力があるものだけ）。
- デザインは既存の StatCard / AppoCard / DetailRow を踏襲。

### Step 5: クライアント契約トグル（CRM/クライアント編集画面）

- `src/components/views/CRMView.jsx` か `contacts/ClientDetailPage.jsx` に、`clients.is_buyer_matching`
  の on/off トグルを追加（`<Badge>`/`<Button>`）。保存は updateClient 系。
- これがないと、むー様がどのクライアントにポータル表示するか選べない。

### Step 6: 社内一覧（任意・後回し可）

- `fetchBuyerNeedsHearings()` で取得し、営業代行サイドバー（`src/constants/navigation.js` の
  `seller_sourcing`）に項目追加 or アポ管理近辺に表示。DataTable推奨。

### Step 7: 仕上げ

- `npm run build` 通過 → commit & push → `git --no-pager log --oneline -3` で実物確認。

## 5. 完了の定義

- 架電画面で買収ニーズ7項目を入力・保存できる
- 契約フラグONのクライアントのポータルに「ニーズヒアリング」タブが出て、蓄積された買いニーズが見える
- 売上/報酬計算に一切影響していない（アポのstatusを汚していない）

## 6. むー様への確認用メモ

- 実画面での保存→ポータル表示の最終確認はむー様にお願いする。
- 「買い手マッチング契約」を入れるクライアント（最初は「株式会社NOAH」が買い手マッチング実績あり）を
  むー様に聞いてフラグONにする。

## 7. 着手時の現状確認（重要）

このタスクは過去に「実装済み」と誤報告されたが**実際は未着手**。着手時に念のため:
- `select count(*) from information_schema.tables where table_name='buyer_needs_hearings';` → 0 のはず（0なら未着手＝Step1から）
- もし1なら既に一部できているので、何が残っているか差分を確認してから進める。
