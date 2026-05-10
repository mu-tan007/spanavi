// 事業slug → ページキー一覧。
// 権限管理（member_page_permissions）と useAccessControl はこの定義をマスタとして使う。
// サイドバー実装と同期して保つこと。
//
// engagement_slug:
//   masp             — MASP（全社・仮想 engagement）
//   seller_sourcing  — ソーシング（SpanaviApp.jsx の navGroups）
//   spartia_career   — スパキャリ（SpartiaCareerSidebar）
//
// page_key は SpanaviApp.jsx 内で `currentTab === <key>` 判定に使われている文字列と一致させる。
// 事業の追加・削除は engagements テーブル側で行い、UIは engagements.status='active' と
// この定数の交差で動的に表示する（PermissionSettings 等を参照）。

export const PAGE_REGISTRY = {
  masp: [
    { key: 'database', label: 'Database' },
    { key: 'firms', label: 'Firms' },
    { key: 'all_members', label: 'Members' },
  ],
  seller_sourcing: [
    { key: 'dashboard', label: 'Dashboard', group: 'OVERVIEW' },
    { key: 'lists', label: 'Lists', group: 'CALLING' },
    { key: 'search', label: 'Search', group: 'CALLING' },
    { key: 'live', label: 'Live Status', group: 'CALLING' },
    { key: 'recall', label: 'Recall', group: 'CALLING' },
    { key: 'incoming', label: 'Incoming Call', group: 'CALLING' },
    { key: 'appo', label: 'Appointments', group: 'PIPELINE' },
    { key: 'precheck', label: 'Pre-Check', group: 'PIPELINE' },
    { key: 'deals', label: 'Deals', group: 'PIPELINE' },
    { key: 'stats', label: 'Analytics', group: 'INSIGHTS' },
    { key: 'library', label: 'Library', group: 'INSIGHTS' },
    { key: 'edu_roleplay', label: 'Role Play', group: 'INSIGHTS' },
    { key: 'members', label: 'Members', group: 'ADMIN' },
    { key: 'crm', label: 'CRM', group: 'ADMIN' },
    { key: 'payroll', label: 'Payroll', group: 'ADMIN' },
    { key: 'shift', label: 'Shifts', group: 'ADMIN' },
  ],
  spartia_career: [
    { key: 'applications', label: '応募管理' },
    { key: 'deals_career', label: 'Deals' },
    { key: 'members_career', label: 'Members' },
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
