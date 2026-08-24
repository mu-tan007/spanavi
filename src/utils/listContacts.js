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

// 社名だけからクライアント（clientData の1件）を引く。
//
// 同名クライアントが複数登録されている場合、素の .find() は並び順で先に来た方
// （＝担当者もカレンダーIDも報酬設定も持たない抜け殻レコード）を掴むことがある。
// 実務データは「支援中」のレコードに寄っているので、同名が複数あるときは支援中を優先する。
// ID が手元にある場合は必ず resolveClient を使うこと。これは ID が取れない画面用の次善策。
export function findClientByName(clientData, company) {
  const safeClients = Array.isArray(clientData) ? clientData : [];
  if (!company) return undefined;
  const matches = safeClients.filter(c => c.company === company);
  if (matches.length <= 1) return matches[0];
  return matches.find(c => c.status === '支援中') || matches[0];
}

// clients.id（あれば）優先でクライアントを解決する。社名一致は ID を持たない旧データ用のフォールバック。
export function resolveClient(clientData, { clientId, company } = {}) {
  const safeClients = Array.isArray(clientData) ? clientData : [];
  if (clientId) {
    const byId = safeClients.find(c => c._supaId === clientId);
    if (byId) return byId;
  }
  return findClientByName(safeClients, company);
}

// 架電リストから、そのリストのクライアントを解決する。
export function resolveListClient(list, clientData) {
  return resolveClient(clientData, { clientId: list?.client_id, company: list?.company });
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
