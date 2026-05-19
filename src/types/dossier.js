/**
 * @file company_dossiers.content / sources JSONB の型定義（JSDoc typedef）
 *   フロント・Edge Function 双方で本ファイルを参照することで、
 *   構造変更時の影響範囲を一望できるようにする。
 */

/**
 * @typedef {Object} DossierHistoryEntry
 * @property {string} year   - 年（例 "1985", "2020/4" 等の任意フォーマット可）
 * @property {string} event  - 出来事
 */

/**
 * @typedef {Object} DossierLeadershipEntry
 * @property {string} role   - 役職（代表取締役、CTO、CFO 等）
 * @property {string} name   - 氏名
 */

/**
 * @typedef {Object} DossierFinancials
 * @property {string} [revenue]      - 売上高（例 "5.0億円", "12.3億円(2025年3月期)"）
 * @property {string} [employees]    - 従業員数（例 "120名"）
 * @property {string} [established]  - 設立（例 "1985年4月"）
 * @property {string} [capital]      - 資本金（例 "5,000万円"）
 */

/**
 * @typedef {Object} DossierPressRelease
 * @property {string} date     - 発表日（YYYY-MM-DD 推奨）
 * @property {string} title    - タイトル
 * @property {string} [url]    - 元URL
 * @property {string} summary  - 要約（1-2文）
 */

/**
 * @typedef {Object} DossierNewsItem
 * @property {string} date     - 報道日（YYYY-MM-DD 推奨）
 * @property {string} title    - 見出し
 * @property {string} [url]    - 元URL
 * @property {string} summary  - 要約
 * @property {string} [source] - 媒体名
 */

/**
 * @typedef {Object} DossierContent
 * @property {string}                  [overview]          - 会社概要（数段落）
 * @property {string[]}                [business_segments] - 事業セグメント
 * @property {DossierHistoryEntry[]}   [history]           - 沿革
 * @property {DossierLeadershipEntry[]}[leadership]        - 経営陣
 * @property {DossierFinancials}       [financials]        - 財務サマリー
 * @property {DossierPressRelease[]}   [press_releases]    - 直近プレスリリース
 * @property {DossierNewsItem[]}       [news]              - 直近ニュース
 * @property {string[]}                [key_topics]        - M&A 関連トピック
 * @property {string}                  [mna_relevance]     - M&A 関連性所感
 */

/**
 * @typedef {('hp'|'web_search')} DossierSourceType
 */

/**
 * @typedef {('high'|'medium'|'low')} DossierIdentityMatch
 */

/**
 * @typedef {Object} DossierSource
 * @property {DossierSourceType}     type           - 情報源タイプ
 * @property {string}                url            - 取得元URL
 * @property {string}                fetched_at     - ISO timestamp
 * @property {DossierIdentityMatch}  identity_match - 同定強度（社名・代表者名・住所3点照合）
 * @property {string}                [note]         - 補足（取得失敗理由、引用範囲等）
 */

/**
 * @typedef {('queued'|'running'|'succeeded'|'partial'|'failed')} DossierGenerationStatus
 */

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

export const DOSSIER_SECTION_KEYS = [
  'overview',
  'business_segments',
  'history',
  'leadership',
  'financials',
  'press_releases',
  'news',
  'key_topics',
  'mna_relevance',
];

export const DOSSIER_SECTION_LABELS = {
  overview:          '会社概要',
  business_segments: '事業セグメント',
  history:           '沿革',
  leadership:        '経営陣',
  financials:        '財務サマリー',
  press_releases:    '直近プレスリリース',
  news:              '直近ニュース',
  key_topics:        'M&A関連トピック',
  mna_relevance:     'M&A関連性所感',
};
