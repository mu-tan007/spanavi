/**
 * @file company_dossiers.content / sources JSONB の型定義（JSDoc typedef）
 *   フロント・Edge Function 双方で本ファイルを参照することで、
 *   構造変更時の影響範囲を一望できるようにする。
 *
 * 2026-05-20 改訂: 7 セクション構成へ刷新
 *   1. executive_summary  - 1-3 文の超短文サマリー
 *   2. basic_info         - 社内DB（company_master）+ 沿革を統合した基本情報
 *   3. business           - 事業セグメント別の説明
 *   4. strengths          - 特徴や強み（差別化要素）
 *   5. market_trend       - 業界全体の市場動向（M&A 文脈の解釈）
 *   6. industry_ma_news   - 同業界の M&A 関連ニュース
 *   7. masp_memo          - アポ取得報告からの3項目（社長お人柄/面談経験/将来検討）
 */

// ─────────────────────────────────────────────────────────────
// 基本情報セクション内のサブ型
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DossierHistoryEntry
 * @property {string} year   - 年（例 "1985", "2020/4"）
 * @property {string} event  - 出来事
 */

/**
 * 基本情報（社内DB主、外部情報で補完）
 * @typedef {Object} DossierBasicInfo
 * @property {string} [industry_major]
 * @property {string} [industry_sub]
 * @property {string} [business_description]
 * @property {string} [prefecture]
 * @property {string} [city]
 * @property {string} [address]
 * @property {string} [representative]
 * @property {string|number} [representative_age]
 * @property {string|number} [established_year]
 * @property {string|number} [employee_count]
 * @property {number} [revenue_k]            - 売上高（千円）
 * @property {number} [ordinary_income_k]    - 経常利益（千円）
 * @property {number} [net_income_k]         - 当期純利益（千円）
 * @property {number} [capital_k]            - 資本金（千円）
 * @property {string} [phone]
 * @property {string} [officers]             - 役員（フリーテキスト）
 * @property {string} [shareholders]         - 株主構成
 * @property {string} [clients]              - 主要取引先
 * @property {string} [suppliers]            - 仕入先
 * @property {string} [remarks]              - 備考
 * @property {DossierHistoryEntry[]} [history] - 沿革
 */

// ─────────────────────────────────────────────────────────────
// 市場動向・ニュース系
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DossierMaNewsItem
 * @property {string}  date          - 発表/報道日（YYYY-MM-DD 推奨）
 * @property {string}  title         - タイトル
 * @property {string}  [url]         - 元URL
 * @property {string}  summary       - 1-2文要約
 * @property {string}  [source]      - 媒体名 / 当事者
 * @property {string}  [deal_type]   - 'M&A' | 'TOB' | '資本業務提携' | '事業譲渡' | 等
 */

// ─────────────────────────────────────────────────────────────
// MASP メモ（アポ取得報告から自動抽出 + 手動編集可）
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DossierMaspMemo
 * @property {string} [personality]      - 社長のお人柄（appo_report の「先方のお人柄→」から抽出）
 * @property {string} [meeting_exp]      - M&A 面談経験の有無（appo_report の「面談経験の有無→」）
 * @property {string} [future_consider]  - 将来的な M&A 検討可否（appo_report の「将来的な検討可否→」）
 * @property {string} [other]            - その他の所感（手動編集可）
 */

// ─────────────────────────────────────────────────────────────
// メインコンテンツ
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DossierContent
 * @property {string}                [executive_summary]
 * @property {DossierBasicInfo}      [basic_info]
 * @property {string[]}              [business]            - 事業セグメント説明（箇条書き）
 * @property {string[]}              [strengths]           - 特徴・強み（箇条書き）
 * @property {string}                [market_trend]        - 業界の市場動向（文章）
 * @property {DossierMaNewsItem[]}   [industry_ma_news]    - 同業界M&Aニュース
 * @property {DossierMaspMemo}       [masp_memo]           - MASP内部メモ
 */

/** @typedef {('hp'|'web_search')} DossierSourceType */
/** @typedef {('high'|'medium'|'low')} DossierIdentityMatch */

/**
 * @typedef {Object} DossierSource
 * @property {DossierSourceType}     type
 * @property {string}                url
 * @property {string}                fetched_at
 * @property {DossierIdentityMatch}  identity_match
 * @property {string}                [note]
 */

/** @typedef {('queued'|'running'|'succeeded'|'partial'|'failed')} DossierGenerationStatus */

/**
 * @typedef {Object} CompanyDossier
 * @property {string}                  id
 * @property {string}                  org_id
 * @property {string}                  appointment_id
 * @property {string|null}             item_id
 * @property {string}                  target_company_name
 * @property {string|null}             target_representative
 * @property {string|null}             target_address
 * @property {DossierContent}          content
 * @property {string}                  free_notes
 * @property {DossierSource[]}         sources
 * @property {DossierGenerationStatus} generation_status
 * @property {string|null}             generation_error
 * @property {string|null}             generated_at
 * @property {string|null}             edited_at
 * @property {string|null}             edited_by
 * @property {string}                  created_at
 * @property {string}                  updated_at
 */

// ─────────────────────────────────────────────────────────────
// UI 表示順序・ラベル定義
// ─────────────────────────────────────────────────────────────

export const DOSSIER_SECTION_KEYS = [
  'basic_info',
  'history',
  'business',
  'strengths',
  'industry_ma_news',
  'masp_memo',
];

export const DOSSIER_SECTION_LABELS = {
  basic_info:        '基本情報',
  history:           '沿革',
  business:          '事業内容',
  strengths:         '特徴・強み',
  industry_ma_news:  'M&Aニュース',
  masp_memo:         'MASPメモ',
};

// 基本情報内の項目ラベル
export const BASIC_INFO_LABELS = {
  industry_major:       '業界（大分類）',
  industry_sub:         '業界（細分類）',
  business_description: '事業内容',
  prefecture:           '都道府県',
  city:                 '市区郡',
  address:              '住所',
  representative:       '代表者',
  representative_age:   '代表者年齢',
  established_year:     '設立年',
  employee_count:       '従業員数',
  revenue_k:            '売上高',
  ordinary_income_k:    '経常利益',
  net_income_k:         '当期純利益',
  capital_k:            '資本金',
  phone:                '電話番号',
  officers:             '役員',
  shareholders:         '株主構成',
  clients:              '主要取引先',
  suppliers:            '仕入先',
  remarks:              '備考',
};

// 基本情報内項目の表示順（短い項目→長文項目）。
// 住所は prefecture/city/address を「address」1項目に統合表示する
// （BasicInfoRender 側で full_address or 結合文字列を採用）
export const BASIC_INFO_ORDER = [
  'industry_major', 'industry_sub',
  'address',
  'representative', 'representative_age',
  'established_year', 'employee_count',
  'revenue_k', 'ordinary_income_k', 'net_income_k', 'capital_k',
  'phone',
  'business_description',
  'officers', 'shareholders', 'clients', 'suppliers',
  'remarks',
];

// MASP メモ内の項目ラベル（「その他所感」は UI には表示しない仕様）
export const MASP_MEMO_LABELS = {
  personality:     '社長のお人柄',
  meeting_exp:     'M&A面談経験の有無',
  future_consider: '将来的なM&A検討可否',
};

export const MASP_MEMO_ORDER = ['personality', 'meeting_exp', 'future_consider'];
