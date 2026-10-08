// アポ取得報告の新しい形と、面談前の1枚資料に入れる値をまとめる（2026-10-07 むー様決定）。
// 要点（ひとことで・温度感・社長の言葉）は generate-appo-brief が company_dossiers.content.brief に入れる。
// 2026-10-08 むー様：「面談で聞くとよいこと」はクライアントに釈迦に説法なので出さない。代わりに企業DB（東京商工リサーチ）と公開情報の詳細・強みを厚くする

import { travelLabel } from './travelFromTokyo';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** 千円単位の数 → 「1億5,050万円」「▲30万円」 */
export function yenFromThousand(k) {
  if (k == null || k === '' || isNaN(Number(k))) return '';
  const yen = Number(k) * 1000;
  const neg = yen < 0;
  let v = Math.abs(yen);
  const oku = Math.floor(v / 1e8);
  const man = Math.round((v - oku * 1e8) / 1e4);
  let s = '';
  if (oku) s += `${oku.toLocaleString()}億`;
  if (man) s += `${man.toLocaleString()}万`;
  if (!s) s = '0';
  return `${neg ? '▲' : ''}${s}円`;
}

/** 千円単位の数 → 短い表記「1.5億」「▲30万」 */
export function shortYen(k) {
  if (k == null || k === '' || isNaN(Number(k))) return '';
  const yen = Number(k) * 1000;
  const neg = yen < 0 ? '▲' : '';
  const v = Math.abs(yen);
  if (v >= 1e8) return `${neg}${(v / 1e8).toFixed(v >= 1e9 ? 0 : 1).replace(/\.0$/, '')}億`;
  return `${neg}${Math.round(v / 1e4).toLocaleString()}万`;
}

/** 報告本文の「財務：売上150,500千円、当期純利益-300千円」から千円の値を拾う */
export function financeFromReport(report) {
  const t = String(report || '').replace(/,/g, '');
  const m1 = t.match(/売上(?:高)?[：:\s]*(-?\d+)千円/);
  const m2 = t.match(/(?:当期)?純利益[：:\s]*(-?\d+)千円/);
  return { revenue_k: m1 ? Number(m1[1]) : null, net_income_k: m2 ? Number(m2[1]) : null };
}

export function meetingLabel(date, time) {
  if (!date) return '';
  const d = new Date(String(date).slice(0, 10) + 'T12:00:00Z');
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）`;
  return `${md}${time ? ' ' + String(time).slice(0, 5) : ''}`;
}

/**
 * 1枚資料と報告に共通する値を、アポ・ドシエからそろえる
 * @param {object} appo アポ（company, client, meetDate, meetTime, meetLocation, isOnline, appoReport, getter）
 * @param {object|null} dossier company_dossiers の行（content / target_representative / target_address）
 */
export function briefModel(appo, dossier) {
  const c = dossier?.content || {};
  const b = c.brief || null;
  const bi = c.basic_info || {};
  const fin = financeFromReport(appo.appoReport);
  const revenue_k = bi.revenue_k ?? fin.revenue_k;
  const net_income_k = bi.net_income_k ?? fin.net_income_k;
  const address = appo.meetLocation || dossier?.target_address || bi.full_address || bi.address || '';
  const rep = dossier?.target_representative || bi.representative || '';
  const est = bi.established_year || (Array.isArray(c.history) && c.history[0]?.year) || '';
  const industry = bi.industry_sub || bi.industry_major || '';
  const pref = (String(address).match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/) || [])[1] || bi.prefecture || '';
  return {
    company: appo.company,
    client: appo.client,
    rep,
    address,
    pref,
    industry,
    meeting: meetingLabel(appo.meetDate, appo.meetTime),
    format: appo.isOnline ? 'オンライン' : '対面',
    travel: appo.isOnline ? '' : (travelLabel(address) || '').replace(/^.*? ・ /, ''),
    revenue: yenFromThousand(revenue_k), revenueShort: shortYen(revenue_k),
    netIncome: yenFromThousand(net_income_k), netIncomeShort: shortYen(net_income_k), netNeg: Number(net_income_k) < 0,
    established: est ? String(est).replace(/年$/, '') : '',
    years: est && /^\d{4}/.test(String(est)) ? new Date().getFullYear() - Number(String(est).slice(0, 4)) : null,
    employees: bi.employee_count || '',
    // 東京商工リサーチ（企業DB・リストの値）
    industryMajor: String(bi.industry_major || '').replace(/^[A-Z]\s*/, ''),
    // 「食肉販売（１００％）」→「食肉販売100%」（全角の数字と括弧を整える）
    businessDesc: String(bi.business_description || '').replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[（(]\s*(\d+)\s*[％%]\s*[）)]/g, '$1%'),
    shareholders: bi.shareholders || '',
    repAge: bi.representative_age || '',
    business: Array.isArray(c.business) ? c.business.slice(0, 4) : [],
    strengths: Array.isArray(c.strengths) ? c.strengths.slice(0, 4) : [],
    history: Array.isArray(c.history) ? c.history.slice(0, 5) : [],
    // 業界のM&Aの動き（企業DBで集めたニュース）
    industryNews: Array.isArray(c.industry_ma_news) ? c.industry_ma_news.filter(n => n?.title).slice(0, 3) : [],
    personality: c.masp_memo?.personality || '',
    // 録音から読み取ったM&Aへの向き合い方（2026-10-08 むー様：お人柄・面談経験は報告に残す）
    meetingExp: c.masp_memo?.meeting_exp || '',
    futureConsider: c.masp_memo?.future_consider || '',
    brief: b,
    // ご依頼（2026-10-08 むー様）：アポ一覧で書いた内容があればそれ（「なし」も含む）、無ければ録音からAIが拾ったもの
    isOnline: !!appo.isOnline,
    requests: requestLines(appo.clientRequests, b?.requests),
    getter: appo.getter || '',
    // クライアントごとの「聞くこと」（アポ報告の最後の【ヒアリング】の段）
    hearing: ((String(appo.appoReport || '').split('【ヒアリング】')[1] || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && /[：:]/.test(l))),
  };
}

/** ご依頼の行。手で書いた内容（改行区切り・「なし」なら空）を優先し、無ければ AI の拾ったもの */
export function requestLines(manual, ai) {
  const m = String(manual || '').trim();
  if (m) return /^なし$/.test(m) ? [] : m.split(/\r?\n/).map(l => l.replace(/^[・\-\s　]+/, '').trim()).filter(Boolean);
  return (Array.isArray(ai) ? ai : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 3);
}

/** 長い文を、最初の n 文（かつ max 字まで）に縮める */
export function firstSentences(text, n = 1, max = 90) {
  // 文の途中で切らない：最初の文から順に、max 字に収まる所まで足す（最初の1文だけが長いときは読点で切る）
  const parts = String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=。)/).filter(Boolean);
  let out = '';
  for (const p of parts.slice(0, n)) { if (out && (out + p).length > max) break; out += p; }
  if (out.length > max) {
    const cut = out.slice(0, max).lastIndexOf('、');
    out = (cut > max * 0.5 ? out.slice(0, cut) : out.slice(0, max - 1)) + '…';
  }
  return out;
}

/**
 * 新しい形のアポ取得報告（メール・Slack・Chatwork の本文）。2026-10-08 むー様「きれいにまとめる形に」
 * 面談 → 社長との会話 → 会社の概要（東京商工リサーチ）→ 事業と強み（公開情報）→ 沿革 → 業界のM&A → ヒアリング の順。
 * 長い所見は最初の1〜2文に縮める（全文は1枚資料と録音で）。
 */
export function buildNewReportText(m, { phone = '', email = '' } = {}) {
  // 面談 → ご依頼 → 社長との会話 → …（ご依頼は先方への対応が要るので面談のすぐ下）
  const b = m.brief;
  const L = [];
  const sec = (t) => { L.push(''); L.push(`■ ${t}`); };
  L.push(`【アポ取得のご報告】${m.company}`);
  L.push(`${[m.pref.replace(/[都府県]$/, ''), m.industry].filter(Boolean).join('・')}`);

  sec('面談');
  L.push(`日時　${m.meeting}〜（${m.format}）`);
  if (m.address) L.push(`場所　${m.address}${m.travel ? `（東京から${m.travel.replace(/^東京から/, '').replace(/[（(](.+?)[)）]/, '・$1')}）` : ''}`);
  if (m.rep) L.push(`お相手　${m.rep} 様${m.repAge ? `（${m.repAge}歳）` : ''}`);
  if (phone || email) L.push(`連絡先　${[phone, email || 'メール未取得'].filter(Boolean).join(' ／ ')}`);

  // ご依頼：先方（社長）からの依頼・オンライン面談のURLの送付・イレギュラー。無ければ「なし」（2026-10-08 むー様）
  sec('ご依頼');
  const reqs = [];
  if (m.isOnline) reqs.push(`オンライン面談のため、面談のURLを貴社ご担当者様より先方へ事前にお送りいただけますでしょうか${email ? `（送付先：${email}）` : ''}`);
  for (const r of m.requests || []) reqs.push(r);
  if (reqs.length) for (const r of reqs) L.push(`・${r}`);
  else L.push('なし');

  if (b?.one_liner || b?.quotes?.length || m.personality || m.meetingExp || m.futureConsider) {
    sec(`社長との会話${b?.temperature ? `（温度感 ${'●'.repeat(b.temperature)}${'○'.repeat(5 - b.temperature)} ${b.temperature_label || ''}）` : ''}`);
    if (b?.one_liner) L.push(`・ひとことで：${b.one_liner}`);
    if (b?.quotes?.length) L.push(`・社長の言葉：${b.quotes.map(q => `「${q.text}」`).join('')}`);
    if (m.personality) L.push(`・お人柄：${firstSentences(m.personality, 2, 130)}`);
    if (m.meetingExp) L.push(`・面談経験：${firstSentences(m.meetingExp, 2, 90)}`);
    if (m.futureConsider) L.push(`・将来の検討：${firstSentences(m.futureConsider, 2, 90)}`);
    if (b?.successor && b.successor !== '未確認') L.push(`・後継者：${b.successor}`);
  }

  sec('会社の概要（東京商工リサーチ）');
  if (m.industry || m.businessDesc) L.push(`業種　${[m.industry, m.businessDesc].filter(Boolean).join(' ・ ')}`);
  if (m.established) L.push(`設立　${m.established}年${m.years != null && m.years >= 0 ? `（${m.years}年目）` : ''}`);
  if (m.revenue || m.netIncome) L.push(`財務　${[m.revenue && `売上 ${m.revenue}`, m.netIncome && `純利益 ${m.netIncome}`].filter(Boolean).join(' ／ ')}`);
  if (m.employees) L.push(`従業員　${m.employees}名`);
  if (m.shareholders) L.push(`大株主　${String(m.shareholders).replace(/[，,]/g, '、')}`);

  if (m.business.length || m.strengths.length) {
    sec('事業と強み（会社HPなど公開情報より）');
    for (const x of m.business.slice(0, 2)) L.push(`・${firstSentences(x, 1, 70).replace(/。$/, '')}`);
    for (const x of m.strengths.slice(0, 3)) L.push(`◎${firstSentences(x, 1, 70).replace(/。$/, '')}`);
  }
  if (m.history.length) {
    sec('沿革');
    for (const h of m.history.slice(0, 5)) L.push(`${h.year}　${String(h.event || '').replace(/[（(][^（）()]*[)）]$/, '')}`);
  }
  if (m.industryNews.length) {
    sec('業界のM&Aの動き');
    for (const n of m.industryNews.slice(0, 2)) L.push(`・${n.title}${n.date ? `（${String(n.date).slice(0, 7).replace('-', '/')}）` : ''}`);
  }
  if (m.hearing?.length) {
    sec('ヒアリング');
    for (const h of m.hearing) L.push(h);
  }
  L.push('');
  L.push(`面談前の1枚資料を添付しております。${m.getter ? `（取得：${m.getter.split(/\s/)[0]}）` : ''}`);
  return L.join('\n');
}
