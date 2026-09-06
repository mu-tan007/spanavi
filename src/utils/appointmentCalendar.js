// カレンダーではDBの面談日を正とする。報告本文の日付はリスケ前のことがある。
const PREFECTURES = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');

export function jstDate(value = new Date()) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(typeof value === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? `${value.replace(' ', 'T')}+09:00` : value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function calendarMonth(dateStr) {
  const [year, month] = dateStr.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, next, offset: new Date(`${start}T00:00:00Z`).getUTCDay(), days: Array.from({ length: count }, (_, i) => `${start.slice(0, 8)}${String(i + 1).padStart(2, '0')}`) };
}

export function shiftCalendarMonth(dateStr, delta) {
  const [year, month] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 10);
}

const cleanName = name => String(name || '').replace(/[\s　]/g, '').replace(/様$/, '');

// IDが設定されている場合は文字列から別の担当者を追加しない。
// 古い姓だけの設定も、同一クライアント内で一意に特定できる場合に限る。
export function calendarListContactIds(list, contacts) {
  const explicit = list.contact_ids?.length ? list.contact_ids : list.contact_id ? [list.contact_id] : [];
  if (explicit.length) return explicit.filter(id => contacts.some(c => c.id === id));
  return [...new Set(String(list.manager_name || '').split(/\s*(?:\bor\b|、|,|\/|・|｜|\|)\s*/i).flatMap(part => {
    const name = cleanName(part);
    if (!name) return [];
    const exact = contacts.filter(c => cleanName(c.name) === name);
    if (exact.length === 1) return [exact[0].id];
    const bySurname = contacts.filter(c => cleanName(String(c.name || '').trim().split(/[\s　]+/)[0]) === name);
    return bySurname.length === 1 ? [bySurname[0].id] : [];
  }))];
}

function timeLabel(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function timestampTime(value) {
  if (!/[T ]\d{2}:\d{2}/.test(value || '')) return '';
  const date = new Date(!/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? `${value.replace(' ', 'T')}+09:00` : value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export function meetingTimestampTime(value) {
  const time = timestampTime(value);
  // 日付のみをtimestampへ保存したUTC/JST午前0時は面談の開始時刻ではない。
  return time !== '00:00' && !/[T ]00:00(?::00(?:\.\d+)?)?(?:Z|[+-]00:00|[+-]09:00)?$/.test(value || '') ? time : '';
}

export function calendarAppointment(row) {
  if (row.status === 'キャンセル') return null;
  const rescheduling = row.status === 'リスケ中';
  // 日時未確定のリスケを、古い面談日の予定として残さない。
  const rawDate = rescheduling ? row.rescheduled_at : row.meeting_date;
  // rescheduled_atだけは既存の事前確認画面がdatetime-localをoffsetなしで保存し、
  // useSpanaviDataも文字列のまま読む契約。ここでJST変換すると入力時刻が9時間ずれる。
  const date = rawDate ? (rescheduling ? rawDate.slice(0, 10) : jstDate(rawDate)) : '';
  if (!date) return null;
  const report = row.report_data || {};
  const text = String(row.appo_report || '').replace(/\\n/g, '\n');
  const reportMeeting = text.match(/(?:面談日時|面談日)[：:]\s*(\d{4}-\d{2}-\d{2})[^\n]*?(\d{1,2}:\d{2})/);
  const time = rescheduling ? timeLabel(row.rescheduled_at.slice(11, 16)) : (
    timeLabel(row.meeting_time) ||
    meetingTimestampTime(row.meeting_date) ||
    (report.appoDate === date ? timeLabel(report.appoTime) : '') ||
    (reportMeeting?.[1] === date ? timeLabel(reportMeeting[2]) : '')
  );
  const location = String(row.meeting_location || report.visitLocation || text.match(/(?:訪問先|面談場所|場所)[：:]\s*([^\n]+)/)?.[1] || '').trim();
  const online = row.is_online ?? (['オンライン', 'Web'].includes(report.meeting_format) || /^(オンライン|zoom|google\s*meet|teams)(?:\s|$|[（(])/i.test(location));
  const prefecture = PREFECTURES.find(pref => location.includes(pref)) || '';
  return { id: row.id, date, time, company: row.company_name || '企業名未登録', location, online,
    area: online ? 'オンライン' : prefecture || '都道府県未登録', status: rescheduling ? '日程変更' : row.status || '', listId: row.list_id };
}
