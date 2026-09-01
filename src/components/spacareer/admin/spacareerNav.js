// スパキャリ運営ダッシュボードのメニュー定義（唯一の正）。
//
// デスクトップのサイドバー(SpacareerAdminSidebar)とスマホのメニュー(MobileSidebarOverlay)の
// 両方がここを読む。片方だけに項目を足すと、もう片方から辿れないページが生まれるため
// 追加・削除は必ずこのファイルで行うこと。
// 仕様書: tasks/spacareer-spec.md §3.2 B. 運営ダッシュボード

export const SPACAREER_ACTIVE_IDS = new Set([
  'customers',
  'recruiting',
  'sessions',
  'trainer_schedule',
  'session_records',
  'trainer_rewards',
  'homework',
  'social_style',
  'ai_courses',
  'templates',
  'analytics',
  'revenue',
  'crowdworks_scout',
]);

export const SPACAREER_ADMIN_SECTIONS = [
  { label: 'CUSTOMERS', items: [
    { id: 'customers', label: '顧客一覧' },
  ]},
  { label: 'RECRUITING', items: [
    { id: 'recruiting', label: '採用管理' },
  ]},
  { label: 'OPERATIONS', items: [
    { id: 'sessions', label: 'セッション管理' },
    { id: 'trainer_schedule', label: 'トレーナー別予定' },
    { id: 'homework', label: '事後課題管理' },
  ]},
  { label: 'DIAGNOSIS', items: [
    { id: 'social_style', label: 'ソーシャルスタイル診断' },
  ]},
  { label: 'CONTENT', items: [
    { id: 'ai_courses', label: 'AI講座管理' },
    { id: 'templates', label: 'テンプレート管理' },
  ]},
  { label: 'ANALYTICS', items: [
    { id: 'session_records', label: 'セッション記録' },
    { id: 'trainer_rewards', label: 'トレーナー報酬' },
    { id: 'analytics', label: '分析レポート' },
    { id: 'revenue', label: '売上管理' },
    { id: 'crowdworks_scout', label: '自動送信システム' },
  ]},
  // 「設定」は全社管理 → 対象事業=スパキャリ へ移行（admin限定）。
];

/** 権限で絞り込んだセクション一覧を返す（空のセクションは落とす） */
export function visibleSpacareerSections(canViewPage) {
  return SPACAREER_ADMIN_SECTIONS
    .map(s => ({
      ...s,
      items: s.items.filter(it => !SPACAREER_ACTIVE_IDS.has(it.id) || canViewPage('spartia_career', it.id)),
    }))
    .filter(s => s.items.length > 0);
}
