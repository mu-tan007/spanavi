// list.manager のような複合担当者表記から、対応する client_contacts を解決するヘルパー。
//
// list.contactIds が指定済みなら ID 一致を全件返す。
// 不足分は list.manager を区切り文字（or / 、/ / / , / ・ / 全/半角空白）で
// トークン化し、各トークンに対し ct.name.includes(token) でマッチさせる。
// "宮本 or 本城 or 米倉" のような複合値でも 3 名分の contact を返せる。

const SPLIT_REGEX = /\s*(?:\bor\b|\bOR\b|、|,|\/|・|｜|\|)\s*|\s+/g;

function tokenize(managerStr) {
  if (!managerStr) return [];
  return managerStr
    .split(SPLIT_REGEX)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^(?:or|OR)$/.test(s));
}

export function resolveListContacts(list, contacts) {
  const safeContacts = Array.isArray(contacts) ? contacts : [];
  const seen = new Set();
  const out = [];
  const push = (ct) => {
    if (!ct || seen.has(ct.id)) return;
    seen.add(ct.id);
    out.push(ct);
  };

  // 1) contactIds 直接マッチ
  (list?.contactIds || []).forEach(cid => {
    const ct = safeContacts.find(c => c.id === cid);
    if (ct) push(ct);
  });

  // 2) manager 文字列をトークン化して name で部分一致
  const tokens = tokenize(list?.manager);
  tokens.forEach(token => {
    safeContacts.forEach(ct => {
      if (ct?.name && ct.name.includes(token)) push(ct);
    });
  });

  return out;
}
