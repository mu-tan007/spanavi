// Check specific CEO-home/identifier headers before generic address/CEO headers.
export function specificCompanyImportField(header) {
  const h = String(header || '').normalize('NFKC').replace(/\s+/g, '');
  if (/^(代表者(?:自宅住所|現住所|住所詳細|住所|居住地)|社長(?:自宅住所|住所)|自宅住所)/.test(h)
    || /^(representative_(?:home_)?address|president_address)$/i.test(h)) return 'representative_address';
  if (/^(法人番号|corporate_number|corporatenumber)$/i.test(h)) return 'corporate_number';
  if (/^(代表者年齢|年齢)/.test(h)) return 'representative_age';
  if (/代表者.*(?:生年|誕生|カナ|ふりがな)/.test(h)) return '';
  return null;
}

export function companyImportFullAddress(row) {
  const address = String(row.full_address || row.address || '').trim();
  if (/^(北海道|東京都|京都府|大阪府|.{2,3}県)/.test(address)) return address;
  const city = String(row.city || '').trim();
  return String(row.prefecture || '').trim() + (city && !address.startsWith(city) ? city : '') + address;
}
