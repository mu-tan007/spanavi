// ============================================================
// 架電ステータス定数（全コンポーネント共通・唯一のデフォルト定義）
// org_settings の call_statuses が未設定の場合のフォールバック
// ============================================================
// 注: 旧 'absent'/'ceo_recall'/'ceo_decline' は 2026-05-15 に
//     'keyman_absent'/'keyman_recall'/'keyman_decline' へリネーム済み。
//     旧フラグ ceo_connect も keyman_connect へ統一。
//     既存 call_records 履歴は migration で書き換え済み。
export const CALL_RESULTS = [
  { id: 'missed',           label: '不通',             excluded: false, color: '#6B7280', bg: '#6B728018', desc: '電話がつながらなかった',           keyman_connect: false },
  { id: 'keyman_absent',    label: 'キーマン不在',     excluded: false, color: '#6B7280', bg: '#6B728018', desc: 'キーマンが不在',                   keyman_connect: false },
  { id: 'reception_block',  label: '受付ブロック',     excluded: false, color: '#6B7280', bg: '#6B728018', desc: '受付に断られた',                   keyman_connect: false },
  { id: 'reception_recall', label: '受付再コール',     excluded: false, color: '#2563EB', bg: '#2563EB18', desc: '後日電話してほしいと言われた',     keyman_connect: false },
  { id: 'keyman_recall',    label: 'キーマン再コール', excluded: false, color: '#2563EB', bg: '#2563EB18', desc: 'キーマンから再度電話の指示',       keyman_connect: true  },
  { id: 'appointment',      label: 'アポ獲得',         excluded: true,  color: '#0D2247', bg: '#0D224710', desc: 'アポイント取得成功',               keyman_connect: true  },
  { id: 'keyman_decline',   label: 'キーマン断り',     excluded: false, color: '#6B7280', bg: '#6B728018', desc: 'キーマン本人から断られた',         keyman_connect: true  },
  { id: 'inquiry_form',     label: '問い合わせフォーム', excluded: false, color: '#2563EB', bg: '#2563EB18', desc: '問い合わせフォーム経由で打診',    keyman_connect: false },
  { id: 'excluded',         label: '除外',             excluded: true,  color: '#e53835', bg: '#e5383510', desc: '対象外・架電不要',                 keyman_connect: false },
];
