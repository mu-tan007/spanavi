// ============================================================
// スパキャリ セッションの並び順・表示ラベルを一元管理する。
// ----------------------------------------------------------------
// 応用コースは基本回（第1〜8回, part=1）に加えて「プラスアルファ」セッション
// （part=2）を 8 本持つ。プラスアルファは session_no を連番(1..8)＝α番号として
// 保持し、「第N回(2)」のような基本回への紐づけはしない。
//
// 表示順は「加入回 J（spacareer_customers.oyo_start_session_no）以降、各基本回の
// 直後にαを1本ずつ差し込み、第8回まで来たら残りのαを連番順で連続表示」。
// J 未満の過去回にはαを差し込まないため、途中加入でも「第1回(2)」等の空タブ
// （虫食い）が発生しない。
//   例) J=3: … 第2回, 第3回, α1, 第4回, α2, 第5回, α3, 第6回, α4, 第7回, α5, 第8回, α6, α7, α8
//   例) J=5: … 第4回, 第5回, α1, 第6回, α2, 第7回, α3, 第8回, α4, α5, α6, α7, α8
//   例) J=1: 第1回, α1, 第2回, α2, … 第8回, α8
// ============================================================

// oyo_start_session_no を 1..8 に丸める。未設定なら 1（＝最初から応用相当）。
function clampStart(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(8, Math.max(1, Math.trunc(n)));
}

// 並び替え用ランク。小さいほど前。
//  - 基本回(part1): session_no*100（キックオフ=0, 第1〜8回=100..800）
//  - α(part2, index=session_no): 差し込み先の基本回(paired=J+index-1)の直後 → paired*100+50。
//    paired が 8 を超える分は第8回より後ろに index 順で連続 → 850+index。
export function sessionRank(session, oyoStartNo) {
  const part = session.part || 1;
  const no = session.session_no;
  if (part === 1) return no * 100;
  const J = clampStart(oyoStartNo);
  const paired = J + no - 1;
  if (paired <= 8) return paired * 100 + 50;
  return 850 + no;
}

// 表示ラベル（「第N回」/「キックオフ」/「プラスアルファN」）
export function sessionLabel(session) {
  const part = session.part || 1;
  const no = session.session_no;
  if (part === 2) return `プラスアルファ${no}`;
  if (no === 0) return 'キックオフ';
  return `第${no}回`;
}

// ステッパーの円内に出す短いラベル
export function sessionShortLabel(session) {
  const part = session.part || 1;
  const no = session.session_no;
  if (part === 2) return `α${no}`;
  if (no === 0) return 'K';
  return String(no);
}

// 並び替え済み配列を返す（元配列は破壊しない）
export function orderSessions(sessions = [], oyoStartNo) {
  return [...sessions].sort((a, b) => sessionRank(a, oyoStartNo) - sessionRank(b, oyoStartNo));
}
