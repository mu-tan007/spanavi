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
    businessDesc: bi.business_description || '',
    shareholders: bi.shareholders || '',
    repAge: bi.representative_age || '',
    business: Array.isArray(c.business) ? c.business.slice(0, 4) : [],
    strengths: Array.isArray(c.strengths) ? c.strengths.slice(0, 4) : [],
    history: Array.isArray(c.history) ? c.history.slice(0, 5) : [],
    // 業界のM&Aの動き（企業DBで集めたニュース）
    industryNews: Array.isArray(c.industry_ma_news) ? c.industry_ma_news.filter(n => n?.title).slice(0, 2) : [],
    personality: c.masp_memo?.personality || '',
    brief: b,
    getter: appo.getter || '',
    // クライアントごとの「聞くこと」（アポ報告の最後の【ヒアリング】の段）
    hearing: ((String(appo.appoReport || '').split('【ヒアリング】')[1] || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && /[：:]/.test(l))),
  };
}

/** 新しい形のアポ取得報告（メール・Slack・Chatwork の本文に入れる部分） */
export function buildNewReportText(m, { phone = '', email = '' } = {}) {
  const b = m.brief;
  const lines = [];
  lines.push(`【アポ取得】${m.company}${m.pref || m.industry ? `（${[m.pref.replace(/[都府県]$/, ''), m.industry].filter(Boolean).join('・')}）` : ''}`);
  lines.push(`面談：${m.meeting}〜 ${m.format}${m.rep ? ` ・ ${m.rep} 様` : ''}`);
  if (b?.one_liner) {
    lines.push('');
    lines.push(`■ ひとことで（温度感 ${'●'.repeat(b.temperature)}${'○'.repeat(5 - b.temperature)} ${b.temperature_label || ''}）`);
    lines.push(b.one_liner);
  }
  if (b?.quotes?.length) {
    lines.push('');
    lines.push('■ 社長の言葉（録音より）');
    for (const q of b.quotes) lines.push(`「${q.text}」${q.context ? `（${q.context}）` : ''}${q.source === 'report' ? '※趣旨' : ''}`);
  }
  if (m.hearing?.length) {
    lines.push('');
    lines.push('■ ヒアリング');
    for (const h of m.hearing) lines.push(h);
  }
  lines.push('');
  lines.push('■ 会社の概要（東京商工リサーチ）');
  if (m.industry || m.businessDesc) lines.push(`業種：${[m.industry, m.businessDesc && `（${m.businessDesc}）`].filter(Boolean).join('')}`);
  if (m.established) lines.push(`設立：${m.established}年${m.years != null && m.years >= 0 ? `（${m.years}年目）` : ''}`);
  if (m.revenue || m.netIncome) lines.push(`財務：${[m.revenue && `売上 ${m.revenue}`, m.netIncome && `純利益 ${m.netIncome}`].filter(Boolean).join(' ／ ')}`);
  if (m.employees) lines.push(`従業員：${m.employees}名`);
  if (m.rep) lines.push(`代表：${m.rep} 様${m.repAge ? `（${m.repAge}歳）` : ''}`);
  if (m.shareholders) lines.push(`大株主：${String(m.shareholders).replace(/[，,]/g, '、')}`);
  if (m.business.length) {
    lines.push('');
    lines.push('■ 事業の詳細（会社HPなど公開情報より）');
    for (const x of m.business.slice(0, 3)) lines.push(`・${x.replace(/。$/, '')}`);
  }
  if (m.strengths.length) {
    lines.push('');
    lines.push('■ 強み');
    for (const x of m.strengths.slice(0, 3)) lines.push(`・${x.replace(/。$/, '')}`);
  }
  if (m.history.length) {
    lines.push('');
    lines.push('■ 沿革');
    for (const h of m.history.slice(0, 5)) lines.push(`${h.year}　${String(h.event || '').replace(/[（(].*?[)）]$/, '')}`);
  }
  if (m.industryNews.length) {
    lines.push('');
    lines.push('■ 業界のM&Aの動き');
    for (const n of m.industryNews) lines.push(`・${n.title}${n.date ? `（${String(n.date).slice(0, 7).replace('-', '/')}）` : ''}`);
  }
  lines.push('');
  lines.push('■ 面談');
  if (m.address) lines.push(`訪問先：${m.address}${m.travel ? `（東京から${m.travel.replace(/^東京から/, '')}）` : ''}`);
  if (phone || email) lines.push(`連絡先：${[phone, email || 'メール未取得'].filter(Boolean).join(' ／ ')}`);
  if (b?.successor && b.successor !== '未確認') lines.push(`後継者：${b.successor}`);
  lines.push('');
  lines.push('面談前の1枚資料を添付しております。');
  if (m.getter) lines.push(`取得：${m.getter.split(/\s/)[0]}`);
  return lines.join('\n');
}
