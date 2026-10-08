// アポ取得報告を登録する前の検査（2026-10-07 むー様指示）。
// #アポ取得報告 を全期間読んだ結果、直近6か月の指摘の約6割が「報告欄の空欄・誤記」だった
// （日時の空欄、メールの綴り違い、「様様」「千円千円」の重複、推測での記入など）。
// テンプレごとに欄の名前が違うため、同じ意味の欄をまとめて見る。
//   error … 直すまで登録できない
//   warn  … 登録はできるが、確かめたことにチェックが要る

const pick = (form, keys) => {
  for (const k of keys) if (form[k] != null && String(form[k]).trim() !== '') return String(form[k]).trim();
  return '';
};
const hasAny = (present, keys) => keys.some(k => present.has(k));

const NAME_KEYS = ['contactName', 'decision_maker_name'];
const TITLE_KEYS = ['contactTitle', 'decision_maker_title'];
const DATE_KEYS = ['appoDate', 'hearing_date'];
const FORMAT_KEYS = ['meeting_format', 'meeting_method'];
const EMAIL_KEYS = ['email'];
const PHONE_KEYS = ['phone', 'fixed_phone', 'mobile_phone'];
const MONEY_KEYS = ['salesAmount', 'netIncome', 'sales', 'net_income'];
const FREE_MAIL = /@(gmail|yahoo|icloud|outlook|hotmail|me|docomo\.ne|ezweb\.ne|au|softbank\.ne|i\.softbank)\b/i;

const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 「2026-10-20 14:00」「10/20 14:00〜」などから日付と時刻を拾う（ブティックス様の書式は1欄に日時）
export function parseMeetingDateTime(text, baseYear = Number(todayJst().slice(0, 4))) {
  const s = String(text || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  let date = null, yearGuessed = false;
  let m = s.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (m) date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  else if ((m = s.match(/(\d{1,2})[/月](\d{1,2})日?/))) { date = `${baseYear}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; yearGuessed = true; }
  const t = s.match(/(\d{1,2})[:：時](\d{2})?/g);
  const last = t ? t[t.length - 1] : null;
  const time = last && date ? (() => { const mm = last.match(/(\d{1,2})[:：時](\d{2})?/); return `${mm[1].padStart(2, '0')}:${mm[2] || '00'}`; })() : '';
  return { date, time, yearGuessed };
}

/**
 * @param {object} form 入力値
 * @param {string[]} presentKeys この報告に存在する欄のキー
 * @param {{ today?: string }} [opt]
 * @returns {{ key: string, level: 'error'|'warn', msg: string }[]}
 */
export function checkAppoReport(form, presentKeys, opt = {}) {
  const present = new Set(presentKeys);
  const today = opt.today || todayJst();
  const out = [];
  const err = (key, msg) => out.push({ key, level: 'error', msg });
  const warn = (key, msg) => out.push({ key, level: 'warn', msg });

  // 担当者名・役職
  if (hasAny(present, NAME_KEYS)) {
    const name = pick(form, NAME_KEYS);
    if (!name) err('name', '担当者名が空欄です');
    else {
      if (/様\s*$/.test(name)) err('name', '担当者名の最後の「様」を外してください（報告で「様様」になります）');
      if (/[○〇◯]{1,}|不明|\?|？/.test(name)) err('name', '担当者名が仮のままです（〇〇・不明など）');
      else if (!/[\s　]/.test(name) && name.length <= 2) warn('name', '担当者名が名字だけかもしれません。フルネームを聞けていれば入れてください');
    }
  }
  if (hasAny(present, TITLE_KEYS) && !pick(form, TITLE_KEYS)) err('title', '役職が空欄です');

  // 面談の日時
  let date = '', time = '';
  if (hasAny(present, DATE_KEYS)) { date = pick(form, DATE_KEYS); time = pick(form, ['appoTime']); }
  else if (present.has('meeting_datetime')) {
    const p = parseMeetingDateTime(form.meeting_datetime, Number(today.slice(0, 4)));
    date = p.date || ''; time = p.time;
    // 年を書かない「1/15」は、今日より前なら翌年のこととみなす（12月に1月のアポを取る場合）
    if (date && p.yearGuessed && date < today) date = `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;
  }
  const needsTime = present.has('appoTime') || present.has('meeting_datetime');
  if (hasAny(present, [...DATE_KEYS, 'meeting_datetime'])) {
    if (!date) err('date', '面談の日付が空欄です');
    else {
      if (needsTime && !time) err('date', '面談の時刻が空欄です（時刻まで入れてください）');
      if (date < today) err('date', '面談日が今日より前になっています');
      const wd = new Date(date + 'T12:00:00Z').getUTCDay();
      if (wd === 0 || wd === 6) warn('date', `面談日が${wd === 0 ? '日曜' : '土曜'}です。クライアントが土日に対応しているか確かめてください`);
      const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
      if (days > 60) warn('date', `面談日が${days}日後です。日付の打ち間違いがないか確かめてください`);
      if (time) {
        const h = Number(time.slice(0, 2));
        if (h < 8 || h >= 20) warn('date', `面談の時刻が${time}です。時刻の打ち間違いがないか確かめてください`);
      }
    }
  }
  // アポ取得日は今日より後にならない
  if (present.has('getDate') && form.getDate && form.getDate > today) err('getDate', 'アポ取得日が未来の日付になっています');

  // 実施形式
  if (hasAny(present, FORMAT_KEYS) && !pick(form, FORMAT_KEYS)) err('format', '実施形式（対面・オンライン）が選ばれていません');
  const online = /オンライン|zoom|meet|teams|web/i.test(pick(form, [...FORMAT_KEYS, 'visitLocation']));

  // メール（2026-10-08 むー様）
  //   オンライン：URLを送る先として、メールアドレスか携帯番号（ショートメッセージで送れる）のどちらかがあればよい
  //   対面：どちらも要らない
  //   携帯番号しか聞けなかったときは、メールの欄に携帯番号を入れてもよい
  if (hasAny(present, EMAIL_KEYS)) {
    const email = pick(form, EMAIL_KEYS).replace(/\s/g, '');
    const isMobile = (v) => /^0[789]0\d{8}$/.test(String(v || '').replace(/\D/g, ''));
    const hasMobile = isMobile(email) || PHONE_KEYS.some(k => present.has(k) && isMobile(form[k]));
    if (!email) {
      if (online && !hasMobile) err('email', 'オンライン面談はURLを送るため、メールアドレスか携帯番号（ショートメッセージで送ります）のどちらかが必要です');
    } else if (isMobile(email)) {
      // 携帯番号を入れた：オンラインならショートメッセージで送る。形の検査はしない
    } else if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
      err('email', `メールアドレスの形が正しくありません（${email}）。携帯番号しか聞けなかったときは、携帯番号（070・080・090）をそのまま入れてください`);
    } else {
      if (/\.(con|cpm|ocm|co\.j|ne\.j|jo)$/i.test(email) || /docomone|ezwebne|softbankne/i.test(email)) err('email', `メールアドレスの綴りを確かめてください（${email}）`);
      const hp = pick(form, ['hp']);
      const host = (hp.match(/https?:\/\/(?:www\.)?([^/\s]+)/i) || [])[1] || '';
      const domain = email.split('@')[1] || '';
      if (host && !FREE_MAIL.test(email) && !(domain.endsWith(host) || host.endsWith(domain))) {
        warn('email', `メールのドメイン（${domain}）とHP（${host}）が違います。聞き間違いがないか確かめてください`);
      }
    }
  }

  // 電話番号
  for (const k of PHONE_KEYS) {
    if (!present.has(k) || !form[k]) continue;
    const digits = String(form[k]).replace(/\D/g, '');
    if (digits.length && (digits.length < 10 || digits.length > 11)) warn('phone', `電話番号の桁数が${digits.length}桁です（${form[k]}）`);
  }

  // 「千円千円」「億円円」などの重複
  for (const k of MONEY_KEYS) {
    if (!present.has(k) || !form[k]) continue;
    if (/(千円|万円|億円|円)\s*\1|円円/.test(String(form[k]))) err('money', `金額の単位が重なっています（${form[k]}）`);
  }

  // 録音
  if (present.has('recordingUrl') && !pick(form, ['recordingUrl'])) warn('recording', '録音URLがありません。携帯への折り返しなどで録音がない場合は「その他」に理由を書いてください');

  return out;
}
