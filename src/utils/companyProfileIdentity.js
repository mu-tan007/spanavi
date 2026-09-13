import { normalizeCompanyAddress, getCompanyAddressMatch } from './companyAddressMatch.js';

// Source workbooks use "〒123-4567_東京都...". Keep the original fact and strip
// only this postal-code separator for comparison; never infer a home prefecture.
export function normalizeSharedCompanyAddress(value) {
  if (typeof value !== 'string') return '';
  return normalizeCompanyAddress(value.normalize('NFKC').trim().replace(
    /^(?:〒\s*)?\d{3}[-‐‑‒–—―−ー]?\d{4}[\s_]*(?=(?:北海道|東京都|京都府|大阪府|.{2,3}県))/, '',
  ));
}

export function comparableSharedAddress(value) {
  const address = normalizeSharedCompanyAddress(value);
  return getCompanyAddressMatch({ address, representative_address: address }) === 'same' ? address : '';
}

export function companyLegalForm(value) {
  const name = String(value || '').normalize('NFKC');
  for (const [form, pattern] of [
    ['株式会社', /株式会社|\(株\)/], ['有限会社', /有限会社|\(有\)/],
    ['合同会社', /合同会社|\(同\)/], ['合資会社', /合資会社|\(資\)/], ['合名会社', /合名会社|\(名\)/],
    ['一般社団法人', /一般社団法人/], ['一般財団法人', /一般財団法人/],
    ['公益社団法人', /公益社団法人/], ['公益財団法人', /公益財団法人/],
    ['医療法人', /医療法人/], ['社会福祉法人', /社会福祉法人/], ['特定非営利活動法人', /特定非営利活動法人|NPO法人/i],
  ]) if (pattern.test(name)) return form;
  return '';
}

export const COMPANY_CRM_STAGES = ['未設定', '未接触', '接触中', '再連絡予定', '商談中', '取引あり', '対象外'];
export const COMPANY_REGISTRY_STATUSES = [
  { value: 'unknown', label: '未確認' }, { value: 'active', label: '存続確認済み' }, { value: 'closed', label: '登記閉鎖確認済み' },
];
