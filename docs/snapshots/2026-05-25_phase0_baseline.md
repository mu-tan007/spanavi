# Phase 0 Baseline Snapshot — 2026-05-25 23:19 JST

商材・支援タイプ整備プロジェクト着手直前の状態記録。何かあった時の参照用。

## DB 規模（参考）

| 指標 | 件数 |
|---|---|
| clients | 162 |
| appointments | 237 |
| client_engagement_reward_settings | 62 |

## products（事業）

| name | slug | is_active |
|---|---|---|
| 営業代行 | sales_agency | ✓ |
| スパキャリ | spartia_career_biz | ✓ |
| Spartia Recruitment | spartia_recruitment_biz | ✗ |
| Spanavi | spanavi_biz | ✗ |
| Spartia Capital | spartia_capital_biz | ✗ |

## business_categories（商材） — 営業代行配下

| name | slug | display_order |
|---|---|---|
| M&A | m_and_a | 1 |
| SaaS | saas | 2 |
| IFA | ifa | 3 |

→ **「人材」がない**。Phase 1-A で追加予定。

## engagements（業務種別） — 営業代行配下

| 商材 | name | slug | type | status |
|---|---|---|---|---|
| M&A | 売り手ソーシング | seller_sourcing | seller_sourcing | active |
| M&A | 買い手マッチング | matching | matching | active |
| M&A | クライアント開拓 | client_acquisition | client_acquisition | active |
| SaaS | リード獲得 | seller_sourcing_saas | seller_sourcing | active |
| SaaS | 買い手マッチング | matching_saas | matching | **archived** |
| SaaS | クライアント開拓 | client_acquisition_saas | client_acquisition | active |
| IFA | 売り手ソーシング | seller_sourcing_ifa | seller_sourcing | **active**（要 archive） |
| IFA | 買い手マッチング | matching_ifa | matching | **archived** |
| IFA | クライアント開拓 | client_acquisition_ifa | client_acquisition | active |

→ **IFA / 人材に「リード獲得」がない**。Phase 1-A で追加予定。
→ IFA の「売り手ソーシング」(active) は M&A から無思考でコピーされた残骸。要 archive。

## appointment_report_templates — 営業代行配下（13 件）

scope_level='engagement' のもの 12 件 + client 単位 override 1 件:

| 商材 | 紐付き engagement | template name | scope_level |
|---|---|---|---|
| M&A | 売り手ソーシング | ブティックス株式会社 売り手ソーシング | **client**（ブティックス専用） |
| M&A | 売り手ソーシング | 売り手ソーシング 標準 | engagement |
| M&A | 買い手マッチング | M&A 買い手マッチング アポ取得報告 | engagement |
| M&A | 買い手マッチング | M&A 買い手マッチング 買収ニーズヒアリング | engagement |
| M&A | クライアント開拓 | M&A クライアント開拓 アポ取得報告 | engagement |
| SaaS | リード獲得 | 売り手ソーシング 標準 ← M&A 用が流用されている | engagement |
| SaaS | 買い手マッチング(archived) | M&A 買い手マッチング アポ取得報告 | engagement |
| SaaS | 買い手マッチング(archived) | M&A 買い手マッチング 買収ニーズヒアリング | engagement |
| SaaS | クライアント開拓 | M&A クライアント開拓 アポ取得報告 | engagement |
| IFA | 売り手ソーシング | 売り手ソーシング 標準 | engagement |
| IFA | 買い手マッチング(archived) | M&A 買い手マッチング アポ取得報告 | engagement |
| IFA | 買い手マッチング(archived) | M&A 買い手マッチング 買収ニーズヒアリング | engagement |
| IFA | クライアント開拓 | M&A クライアント開拓 アポ取得報告 | engagement |

→ SaaS リード獲得が M&A 用テンプレを流用している。Phase 1-A で SaaS 専用テンプレ作成予定。

## CRM クライアント状況（Phase 1-A 検証関連 3 社）

| 会社 | id | status | industry | next_contact_at |
|---|---|---|---|---|
| イエロ株式会社 | e9794708-… | 準備中 | SaaS | - |
| 株式会社ジャパゲート | e8455e9d-… | 面談予定 | 人材 | 2026-05-27 |
| 株式会社がんば | 69fd6233-… | 面談予定 | **（空欄、Phase 1-A で「人材」に補正）** | 2026-05-28 |

## Phase 0 セーフティ確認

- [ ] Supabase on-demand backup 取得（むー様）
- [x] 構造 snapshot 保存（このファイル）
- [ ] 動作確認 4 項目（むー様）

## ロールバック方針

Phase 1-A のロールバック SQL は `docs/snapshots/2026-05-25_phase1a_rollback.sql` に Phase 1-A 実行時に併せて作成する。
