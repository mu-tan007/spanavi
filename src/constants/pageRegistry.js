// 事業slug → ページキー一覧。
// 権限管理（member_page_permissions）と useAccessControl はこの定義をマスタとして使う。
// サイドバー実装と同期して保つこと。
//
// engagement_slug:
//   masp             — MASP（全社・仮想 engagement）
//   seller_sourcing  — ソーシング（SpanaviApp.jsx の navGroups）
//   spartia_career   — スパキャリ（SpacareerAdminSidebar / 受講生は SpacareerClientApp）
//
// page_key は SpanaviApp.jsx 内で `currentTab === <key>` 判定に使われている文字列と一致させる。
// 事業の追加・削除は engagements テーブル側で行い、UIは engagements.status='active' と
// この定数の交差で動的に表示する（PermissionSettings 等を参照）。

export const PAGE_REGISTRY = {
  masp: [
    { key: 'database', label: '企業DB' },
    { key: 'firms', label: 'M&A支援機関' },
    { key: 'all_members', label: 'メンバー' },
  ],
  seller_sourcing: [
    { key: 'dashboard', label: 'ダッシュボード', group: 'OVERVIEW' },
    { key: 'lists', label: '架電リスト', group: 'CALLING' },
    { key: 'search', label: '企業・録音検索', group: 'CALLING' },
    { key: 'live', label: 'ライブ稼働状況', group: 'CALLING' },
    { key: 'recall', label: '再架電', group: 'CALLING' },
    { key: 'incoming', label: '着信対応', group: 'CALLING' },
    { key: 'appo', label: 'アポ一覧', group: 'PIPELINE' },
    { key: 'precheck', label: '事前確認', group: 'PIPELINE' },
    { key: 'deals', label: '案件', group: 'PIPELINE' },
    { key: 'stats', label: 'アナリティクス', group: 'INSIGHTS' },
    { key: 'library', label: 'ライブラリ', group: 'INSIGHTS' },
    { key: 'edu_roleplay', label: 'ロープレ', group: 'INSIGHTS' },
    { key: 'members', label: 'メンバー', group: 'ADMIN' },
    { key: 'crm', label: 'CRM', group: 'ADMIN' },
    { key: 'payroll', label: '報酬', group: 'ADMIN' },
    { key: 'shift', label: 'シフト', group: 'ADMIN' },
  ],
  spartia_career: [
    { key: 'customers', label: '顧客一覧', group: 'CUSTOMERS' },
    { key: 'sessions', label: 'セッション管理', group: 'OPERATIONS' },
    { key: 'homework', label: '事前課題管理', group: 'OPERATIONS' },
    { key: 'social_style', label: 'ソーシャルスタイル診断', group: 'DIAGNOSIS' },
    { key: 'ai_courses', label: 'AI講座管理', group: 'CONTENT' },
    { key: 'templates', label: 'テンプレート管理', group: 'CONTENT' },
    { key: 'analytics', label: '分析レポート', group: 'ANALYTICS' },
    { key: 'settings', label: '設定', group: 'SETTINGS' },
  ],
};

// 事業slug → デフォルト表示名（DBに engagements.name が無い場合のフォールバック）。
// DB engagements が取得できる場合は eng.name を優先すること。
export const ENGAGEMENT_LABELS = {
  masp: 'MASP（全社）',
  seller_sourcing: 'ソーシング',
  spartia_career: 'スパキャリ',
};

export const ALL_ENGAGEMENT_SLUGS = Object.keys(PAGE_REGISTRY);

export function getPagesForEngagement(slug) {
  return PAGE_REGISTRY[slug] || [];
}
