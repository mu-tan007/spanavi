// アポの面談時刻の選択肢（9:00〜20:00・15分刻み）。
// 30分刻みだと 13:15 のような時刻を選べず、近い 13:00 で登録されてカレンダーとずれていた。
export const MEET_TIME_OPTIONS = Array.from({ length: 45 }, (_, i) => {
  const total = 540 + i * 15;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
});
