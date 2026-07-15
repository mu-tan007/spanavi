// スパキャリ運営側の細かな権限判定ヘルパー。
// 画面をまたいで同じ判定を使い回すためにここに集約する。

// 「動画議事録を（必須ゲート無視で）スキップして完了」を押せる人。
// むー様指示 2026-07-09: この操作は誤操作の影響が大きいため、篠宮・小山のみに絞る。
// 他のトレーナー権限ユーザーにはボタン自体を出さない。
export const SPACAREER_SKIP_COMPLETE_EMAILS = [
  'shinomiya@ma-sp.co', // 篠宮（全体管理者）
  'koyama@ma-sp.co',    // 小山（スパキャリ事業責任者）
];

export function canSkipSessionComplete(email) {
  return SPACAREER_SKIP_COMPLETE_EMAILS.includes(String(email || '').trim().toLowerCase());
}

// コース・プラン（強化⇄応用）の変更を実行できる人。
// むー様指示 2026-07-10: コース/プラン変更は篠宮・小山のみに限定。他トレーナーは変更不可。
// サーバー側でも fn_spacareer_set_course が同じ2名のメールで弾く（二重ガード）。
export const SPACAREER_COURSE_CHANGE_EMAILS = [
  'shinomiya@ma-sp.co', // 篠宮（全体管理者）
  'koyama@ma-sp.co',    // 小山（スパキャリ事業責任者）
];

export function canChangeCourse(email) {
  return SPACAREER_COURSE_CHANGE_EMAILS.includes(String(email || '').trim().toLowerCase());
}

// 顧客のアーカイブ（論理削除・非表示）／復元を実行できる人。
// むー様指示 2026-07-15: 顧客削除は誤操作の影響が極めて大きいため、篠宮・小山のみに絞る。
// サーバー側でも fn_spacareer_archive_customer / fn_spacareer_unarchive_customer が
// 同じ2名のメールで弾く（二重ガード）。
export const SPACAREER_ARCHIVE_CUSTOMER_EMAILS = [
  'shinomiya@ma-sp.co', // 篠宮（全体管理者）
  'koyama@ma-sp.co',    // 小山（スパキャリ事業責任者）
];

export function canArchiveCustomer(email) {
  return SPACAREER_ARCHIVE_CUSTOMER_EMAILS.includes(String(email || '').trim().toLowerCase());
}
