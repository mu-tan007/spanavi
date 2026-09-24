import ICAL from 'npm:ical.js@2.2.1'

// Outlook 等の「公開予定表 (ICS)」URL から busy 区間を取り出す。
//
// Outlook の予定表共有メール（空き時間情報のみ）には
//   https://outlook.office365.com/owa/calendar/.../reachcalendar.ics
// が載っており、認証なしで取得できる。ブラウザからは CORS で読めないため、この関数経由で取る。
// 誰でも叩ける関数なので、任意 URL の中継にならないよう取得先ホストを絞る。
const ALLOWED_ICS_HOSTS = ['outlook.office365.com', 'outlook.office.com', 'outlook.live.com']

export const isIcsUrl = (id: string) => /^(https?|webcal):\/\//i.test(id)

export async function fetchIcsBusy(
  icsUrl: string,
  timeMin: string,
  timeMax: string,
): Promise<{ busy: Array<{ start: string; end: string }>; errors?: any[] }> {
  let url: URL
  try {
    url = new URL(icsUrl.replace(/^webcal:\/\//i, 'https://'))
  } catch {
    return { busy: [], errors: [{ reason: 'invalid ICS URL' }] }
  }
  if (url.protocol !== 'https:' || !ALLOWED_ICS_HOSTS.includes(url.hostname)) {
    return { busy: [], errors: [{ reason: `host not allowed: ${url.hostname}` }] }
  }

  const r = await fetch(url.toString())
  if (!r.ok) return { busy: [], errors: [{ reason: 'ICS fetch failed', code: r.status }] }
  return { busy: parseIcsBusy(await r.text(), timeMin, timeMax) }
}

// ICS 本文 → 期間内の busy 区間（ISO 文字列）。
// 除外: 終日予定 / 「空き時間」扱い (TRANSP:TRANSPARENT, BUSYSTATUS:FREE) / キャンセル済み。
// 仮の予定 (TENTATIVE) は埋まっている扱いにする（空きと見せてアポを入れる方が事故になる）。
export function parseIcsBusy(text: string, timeMin: string, timeMax: string) {
  const minMs = new Date(timeMin).getTime()
  const maxMs = new Date(timeMax).getTime()
  const vcal = new ICAL.Component(ICAL.parse(text))

  // Exchange は "Tokyo Standard Time" のような Windows 名の TZID を使い、VTIMEZONE を同梱してくる
  for (const tz of vcal.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(tz)
  }

  const vevents = vcal.getAllSubcomponents('vevent')
  // 繰り返しの個別変更 (RECURRENCE-ID 付き) は親イベントに紐付けて展開させる
  const overrides = new Map<string, any[]>()
  for (const ve of vevents) {
    if (!ve.hasProperty('recurrence-id')) continue
    const uid = ve.getFirstPropertyValue('uid')
    overrides.set(uid, [...(overrides.get(uid) || []), ve])
  }

  const isBusyComponent = (ve: any) => {
    if (String(ve.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return false
    if (String(ve.getFirstPropertyValue('transp') || '').toUpperCase() === 'TRANSPARENT') return false
    const ms = String(ve.getFirstPropertyValue('x-microsoft-cdo-busystatus') || '').toUpperCase()
    if (ms === 'FREE') return false
    return true
  }

  const busy: Array<{ start: string; end: string }> = []
  const push = (start: any, end: any, ve: any) => {
    if (start.isDate) return // 終日
    if (!isBusyComponent(ve)) return
    const s = start.toJSDate().getTime()
    const e = end.toJSDate().getTime()
    if (e <= minMs || s >= maxMs) return
    busy.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString() })
  }

  for (const ve of vevents) {
    if (ve.hasProperty('recurrence-id')) continue
    const ev = new ICAL.Event(ve)
    for (const ex of overrides.get(ev.uid) || []) ev.relateException(ex)

    if (!ev.isRecurring()) {
      push(ev.startDate, ev.endDate, ve)
      continue
    }
    const it = ev.iterator()
    let next
    // 期間を過ぎたら打ち切る。上限は暴走防止
    for (let i = 0; i < 5000 && (next = it.next()); i++) {
      if (next.toJSDate().getTime() >= maxMs) break
      const occ = ev.getOccurrenceDetails(next)
      push(occ.startDate, occ.endDate, occ.item.component)
    }
  }

  busy.sort((a, b) => a.start.localeCompare(b.start))
  return busy
}
