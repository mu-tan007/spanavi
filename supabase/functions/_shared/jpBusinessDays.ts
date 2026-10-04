// 日本の営業日（土日・祝日を除く）の計算。
// 祝日は holidays-jp（内閣府の一覧をもとにした公開データ）から取り、取れないときは下の控えを使う。
// 控えは 2027 年まで。2028 年以降は取得が失敗し続けると祝日が平日扱いになるので、毎年足すこと。

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

const FALLBACK_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日', '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日', '2026-05-06': '振替休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日', '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日', '2027-03-22': '振替休日', '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日', '2027-05-05': 'こどもの日', '2027-07-19': '海の日', '2027-08-11': '山の日',
  '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日', '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
}

export type Holidays = Record<string, string>

/** 祝日一覧を取得する。失敗したら控えを返す（通知自体は止めない） */
export async function loadJpHolidays(): Promise<Holidays> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetch('https://holidays-jp.github.io/api/v1/date.json', { signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json() as Holidays
      if (data && Object.keys(data).length > 0) return { ...FALLBACK_HOLIDAYS, ...data }
    }
    console.warn('[jpBusinessDays] 祝日取得失敗 HTTP', res.status, '→ 控えを使用')
  } catch (e) {
    console.warn('[jpBusinessDays] 祝日取得失敗 → 控えを使用:', (e as Error).message)
  }
  return FALLBACK_HOLIDAYS
}

/** UTC 0時の Date → 'YYYY-MM-DD' */
export function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** UTC 0時の Date → '2026/03/05（水）' */
export function formatDateJP(date: Date): string {
  const [y, m, d] = toDateStr(date).split('-')
  return `${y}/${m}/${d}（${DAY_NAMES[date.getUTCDay()]}）`
}

export function isBusinessDay(date: Date, holidays: Holidays): boolean {
  const dow = date.getUTCDay()
  return dow !== 0 && dow !== 6 && !holidays[toDateStr(date)]
}

export interface TargetDay {
  date: string   // 'YYYY-MM-DD'
  label: string  // 見出しの括弧書き（当日 / N営業日後 / 休日・祝日名）
  jp: string     // '2026/10/10（土）'
}

/**
 * 今日から「n 営業日後」までのすべての日付を返す。間に挟まる土日・祝日も含める
 * （面談日が休日のアポも、前の営業日のうちに事前確認するため）。
 */
export function listDaysThroughBusinessDay(today: Date, n: number, holidays: Holidays): TargetDay[] {
  const days: TargetDay[] = []
  const cur = new Date(today)
  let count = 0
  while (true) {
    const ds = toDateStr(cur)
    let label: string
    if (days.length === 0) {
      label = '当日'
    } else if (isBusinessDay(cur, holidays)) {
      count++
      label = `${count}営業日後`
    } else {
      label = holidays[ds] ? `祝日・${holidays[ds]}` : '休日'
    }
    days.push({ date: ds, label, jp: formatDateJP(cur) })
    if (count >= n) break
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}
