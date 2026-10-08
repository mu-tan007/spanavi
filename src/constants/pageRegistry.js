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
  // 2026-10-08 メニューの組み換えに合わせて並べ直し（group はサイドバーの区分名）。
  // 事前確認（precheck）が抜けていて、この画面で保存すると権限が消えていたので足した
  seller_sourcing: [
    { key: 'dashboard', label: 'ダッシュボード', group: 'Top' },
    { key: 'stats', label: 'アナリティクス', group: 'Top' },
    { key: 'lists', label: '架電リスト', group: 'Call' },
    { key: 'recall', label: '再架電', group: 'Call' },
    { key: 'search', label: '企業検索', group: 'Call' },
    { key: 'incoming', label: '着信対応', group: 'Call' },
    { key: 'scripts', label: 'スクリプト', group: 'Call' },
    { key: 'live', label: 'ライブ稼働状況', group: 'Call' },
    { key: 'appo', label: 'アポ一覧', group: 'SFA' },
    { key: 'precheck', label: '事前確認', group: 'SFA' },
    { key: 'deals', label: '案件', group: 'SFA' },
    { key: 'crm', label: '顧客管理', group: 'SFA' },
    { key: 'members', label: 'メンバー', group: 'Member' },
    { key: 'shift', label: 'シフト', group: 'Member' },
    { key: 'payroll', label: '報酬', group: 'Member' },
    { key: 'library', label: 'ライブラリー', group: 'Enablement' },
    { key: 'edu_roleplay', label: 'ロープレ（ライブラリーの中）', group: 'Enablement' },
    { key: 'ma_news', label: 'M&Aニュース', group: 'Enablement' },
  ],
  spartia_career: [
    { key: 'customers', label: '顧客一覧', group: 'CUSTOMERS' },
    { key: 'recruiting', label: '採用管理', group: 'RECRUITING' },
    { key: 'sessions', label: 'セッション管理', group: 'OPERATIONS' },
    { key: 'trainer_schedule', label: 'トレーナー別予定', group: 'OPERATIONS' },
    { key: 'homework', label: '事後課題管理', group: 'OPERATIONS' },
    { key: 'social_style', label: 'ソーシャルスタイル診断', group: 'DIAGNOSIS' },
    { key: 'ai_courses', label: 'AI講座管理', group: 'CONTENT' },
    { key: 'templates', label: 'テンプレート管理', group: 'CONTENT' },
    { key: 'session_records', label: 'セッション記録', group: 'ANALYTICS' },
    { key: 'trainer_rewards', label: 'トレーナー報酬', group: 'ANALYTICS' },
    { key: 'analytics', label: '分析レポート', group: 'ANALYTICS' },
    { key: 'revenue', label: '売上管理', group: 'ANALYTICS' }, // Stripe請求書ミラー。admin限定。
    { key: 'sales_funnel', label: '営業ファネル', group: 'ANALYTICS' }, // CW送信→Slack面談報告→成約の流れ。admin限定。
    { key: 'zoom_recordings', label: 'Zoom録画', group: 'ANALYTICS' }, // Zoomのクラウド録画をR2へ移したもの。admin限定。
    { key: 'crowdworks_scout', label: '自動送信システム', group: 'ANALYTICS' }, // CrowdWorksスカウトツールの稼働監視。admin限定。
    // 設定は「全社管理 → 対象事業=スパキャリ」へ移行済み（admin限定）。
  ],
};

// 事業slug → デフォルト表示名（DBに engagements.name が無い場合のフォールバック）。
// DB engagements が取得できる場合は eng.name を優先すること。
export const ENGAGEMENT_LABELS = {
  seller_sourcing: '売り手ソーシング',
  matching: '買い手マッチング',
  client_acquisition: 'クライアント開拓',
  spartia_career: 'スパキャリ',
  spartia_recruitment: 'Spartia Recruitment',
};

export const ALL_ENGAGEMENT_SLUGS = Object.keys(PAGE_REGISTRY);

export function getPagesForEngagement(slug) {
  return PAGE_REGISTRY[slug] || [];
}
