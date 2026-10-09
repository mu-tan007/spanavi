// 電話番号を市外局番どおりにハイフンで区切る（2026-10-09 むー様「電話番号は必ずハイフン」）
import { AsYouType } from 'libphonenumber-js/min';

export function telFmt(raw) {
  const d = String(raw || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.length < 10) return d;
  const f = new AsYouType('JP').input(d);
  return f && /\d-\d/.test(f) ? f : d;
}
// 着信や検索で比べるときは数字だけにそろえる
export const telDigits = raw => String(raw || '').replace(/[^\d]/g, '');
