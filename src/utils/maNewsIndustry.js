// M&Aニュースの「架電中のリストと同じ業種だけ」（2026-10-07 むー様決定）
// ニュースの業種（日本標準産業分類の中分類の名前）と、架電中のリストの業種の名前を、おおまかに突き合わせる。

/** 比べやすい形に：括弧の中・「業」・「その他の」・「（別掲を除く）」を落とす */
export function industryCore(name = '') {
  return String(name)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/その他の|他に分類されないもの/g, '')
    .replace(/業$/g, '')
    .replace(/[・\s]/g, '')
    .trim();
}

// リストの業種名とニュースの業種名の言い方の違いを寄せる（両方向に効く）
const ALIAS = [
  ['建設', '工事'], ['土木', '工事'], ['警備', '警備'], ['物流', '運輸'], ['物流', '運送'], ['物流', '貨物'], ['物流', '倉庫'], ['運送', '運輸'],
  ['IT', '情報サービス'], ['ソフトウェア', '情報サービス'], ['システム', '情報サービス'],
  ['食品', '食料品'], ['介護', '社会保険'], ['介護', '福祉'], ['医療', '医療'], ['不動産', '不動産'],
  ['製造', '製造'], ['設備', '設備工事'], ['電気工事', '設備工事'], ['人材', '職業紹介'], ['広告', '広告'],
];

/** そのニュースの業種が、架電中のリストの業種のどれかに当たるか */
export function matchesListIndustries(newsIndustry, listIndustries = []) {
  const n = industryCore(newsIndustry);
  if (!n) return false;
  return listIndustries.some((li) => {
    const l = industryCore(li);
    if (!l) return false;
    if (l.length >= 2 && n.includes(l)) return true;
    if (n.length >= 2 && l.includes(n)) return true;
    return ALIAS.some(([a, b]) => l.includes(a) && n.includes(b));
  });
}

export const MA_KINDS = {
  acquisition: { label: '買収', color: '#0176D3' },
  business_transfer: { label: '事業譲渡', color: '#B7791F' },
  capital_participation: { label: '資本参加', color: '#8692A0' },
  tob: { label: 'TOB', color: '#C8102E' },
  merger: { label: '合併', color: '#C8A45A' },
  capital_increase: { label: '出資拡大', color: '#1F7A4D' },
};
