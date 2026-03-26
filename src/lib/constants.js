// Spanavi カラーパレット（ブルーテーマ）
export const C = {
  navy: '#032D60',        // ダークネイビー（ナビ背景）
  navyLight: '#0176D3',   // プライマリブルー
  navyMid: '#014486',     // ミドルブルー
  dark: '#021B40',        // 最深部ネイビー
  gold: '#C8A84B',        // ゴールド（ブランドアクセント）
  goldLight: '#D4BB6A',
  white: '#ffffff',
  offWhite: '#F3F2F2',    // ページ背景
  textMain: '#ffffff',    // 暗背景上のテキスト
  textMid: '#A8C4E0',     // 暗背景上のサブテキスト
  textLight: '#706E6B',   // 明背景上のサブテキスト
  green: '#2E844A',
  greenLight: '#4CAF70',
  red: '#EA001E',
  redLight: '#FF4D4D',
  orange: '#FFB75D',
  blue: '#0176D3',        // プライマリブルー
  border: '#1A4E8A',      // 暗背景上のボーダー
  borderLight: '#2A6CC4', // 暗背景上の明ボーダー
}

// 架電結果ステータス（callResults.js が唯一の定義元）
export { CALL_RESULTS as CALL_STATUSES } from '../constants/callResults'

// ユーザーロール
export const USER_ROLES = {
  admin: '管理者',
  manager: 'マネージャー',
  caller: 'アポインター',
}

// ユーザーティア
export const USER_TIERS = {
  trainee: 'Trainee',
  spartan: 'Spartan',
  hyper_spartan: 'Hyper Spartan',
  super_spartan: 'Super Spartan',
}
