// アポ単価（税込・円）。アポ報告の「当社売上」の初期値と同じ決め方（2026-10-09 架電ページの「アポ単価」に使う）
// リストの単価の上書きが最優先 → クライアントの報酬体系（固定／売上高・純利益の段階）
import { resolveListClient } from './listContacts';
import { applyTaxIfPretax, hasListUnitPrice } from './money';

export function appoUnitPrice({ list, clientData = [], rewardMaster = [], revenue = null, netIncome = null }) {
  if (hasListUnitPrice(list?.appoUnitPrice)) return applyTaxIfPretax(Number(list.appoUnitPrice), '税別');
  const rewardType = resolveListClient(list, clientData)?.rewardType || '';
  const rows = (rewardMaster || []).filter(r => r.id === rewardType);
  if (!rows.length) return null;
  const tax = p => applyTaxIfPretax(p, rows[0].tax);
  if (rows[0].basis === '-') return tax(rows[0].price);
  const v = rows[0].basis === '売上高' ? revenue : netIncome;
  if (v == null || v === '') return null;
  const yen = Number(v) * 1000;
  const m = rows.find(r => yen >= r.lo && yen < r.hi);
  return m ? tax(m.price) : null;
}

// 165000 → 「16.5万円」
export const manYen = v => (v == null ? '—' : `${(v / 10000).toFixed(1).replace(/\.0$/, '')}万円`);
