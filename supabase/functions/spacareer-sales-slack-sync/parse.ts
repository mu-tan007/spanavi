// スパキャリ営業の Slack ワークフロー投稿を、spacareer_sales_events の1行に読み替える。
// 投稿の形（2026-10-01 実物で確認）:
//   ■獲得者 / ■初回日程 / ■獲得日 / ■流入経路 / ■ワーカー名 / ■年代性別 / ■職業   … 初回面談獲得
//   ■担当アポインター / ■実施日時 / ■ワーカー名 / ■面談可否 / ■アポステータス / ■繋ぎ日時 / ■アポ商談ログ
//   ■担当クローザー / ■実施日時 / ■ワーカー名 / ■クロステータス / ■次回日時 / ■クロ商談ログ / ■クロ相席
// 見出しは「*■獲得者*」のように太字の * が付くことがある。

export type SlackMessage = {
  ts: string
  text?: string
  user?: string
  bot_id?: string
  subtype?: string
}

export type SalesEvent = {
  kind: 'booked' | 'first_meeting' | 're_meeting' | 'closing'
  occurred_at: string
  scheduled_at: string | null
  rep_slack_user_id: string | null
  result: string | null
  is_won: boolean
  next_at: string | null
  recording_url: string | null
  worker_name_raw: string | null
  worker_name_norm: string | null
  source: 'slack'
  source_ref: string
  attrs: Record<string, string | null>
}

/** 「■見出し」の直後から次の「■」までを取り出す */
export function field(text: string, label: string): string | null {
  const re = new RegExp(`\\*?■${label}\\*?\\n([\\s\\S]*?)(?=\\n\\*?■|$)`)
  const m = text.match(re)
  if (!m) return null
  const v = m[1].trim()
  return v === '' ? null : v
}

export function slackUserId(v: string | null): string | null {
  const m = v?.match(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/)
  return m ? m[1] : null
}

export function slackUrl(v: string | null): string | null {
  const m = v?.match(/<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/) ?? v?.match(/(https?:\/\/\S+)/)
  return m ? m[1] : null
}

/** 「2026/09/30 17:00:00」「2026-10-01」を JST として ISO に。読めなければ null */
export function jstIso(v: string | null): string | null {
  if (!v) return null
  // 旧ワークフローの英語表記「May 25th, 2026 at 9:00 AM UTC」
  const en = v.match(/^([A-Z][a-z]+ \d{1,2})(?:st|nd|rd|th)?, (\d{4}) at (\d{1,2}:\d{2} [AP]M) UTC$/)
  if (en) {
    const t = Date.parse(`${en[1]}, ${en[2]} ${en[3]} UTC`)
    return Number.isNaN(t) ? null : new Date(t).toISOString()
  }
  const m = v.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const p = (s: string | undefined, d = '00') => (s ?? d).padStart(2, '0')
  const iso = `${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4])}:${p(m[5])}:${p(m[6])}+09:00`
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString()
}

/** 「pppyoon(舟口さん)」の注記を落とす。注記は さん／様 で終わる括弧だけ */
export function cleanWorkerName(v: string | null): string | null {
  if (!v) return null
  const s = v.replace(/\s*[（(][^()（）]*(さん|様)[)）]\s*$/, '').trim()
  return s || null
}

/** DB の spacareer_norm_name と同じ規則（NFKC → 空白除去 → 小文字） */
export function normName(v: string | null): string | null {
  if (!v) return null
  const s = v.normalize('NFKC').replace(/\s/g, '').toLowerCase()
  return s || null
}

export function parseSalesMessage(channelId: string, m: SlackMessage): SalesEvent | null {
  const text = m.text ?? ''
  const postedIso = new Date(Number(m.ts) * 1000).toISOString()
  const worker = cleanWorkerName(field(text, 'ワーカー名'))
  const base = {
    source: 'slack' as const,
    source_ref: `slack:${channelId}:${m.ts}`,
    worker_name_raw: worker,
    worker_name_norm: normName(worker),
    is_won: false,
    next_at: null as string | null,
    recording_url: null as string | null,
    scheduled_at: null as string | null,
  }

  if (text.includes('初回面談アポイントを取得') && text.includes('■獲得者')) {
    return {
      ...base,
      kind: 'booked',
      occurred_at: jstIso(field(text, '獲得日')) ?? postedIso,
      scheduled_at: jstIso(field(text, '初回日程')),
      rep_slack_user_id: slackUserId(field(text, '獲得者')),
      result: null,
      attrs: {
        channel_route: field(text, '流入経路'),
        applicant_name: field(text, '応募者の名前'),
        age_gender: field(text, '年代性別'),
        occupation: field(text, '職業'),
        posted_at: postedIso,
      },
    }
  }

  if (text.includes('■クロステータス')) {
    const status = field(text, 'クロステータス')
    return {
      ...base,
      kind: 'closing',
      occurred_at: jstIso(field(text, '実施日時')) ?? postedIso,
      rep_slack_user_id: slackUserId(field(text, '担当クローザー')),
      result: status,
      is_won: status === '成約',
      next_at: field(text, '次回日時'),
      recording_url: slackUrl(field(text, 'クロ商談ログ')),
      attrs: {
        sitting_in: field(text, 'クロ相席'),
        posted_at: postedIso,
      },
    }
  }

  if (text.includes('■アポステータス')) {
    const isRe = text.includes('再アポ面談の報告')
    return {
      ...base,
      kind: isRe ? 're_meeting' : 'first_meeting',
      occurred_at: jstIso(field(text, '実施日時')) ?? postedIso,
      rep_slack_user_id: slackUserId(field(text, '担当アポインター')),
      result: field(text, 'アポステータス'),
      next_at: field(text, '繋ぎ日時'),
      recording_url: slackUrl(field(text, 'アポ商談ログ')),
      attrs: {
        attended: field(text, '面談可否'),
        memo: field(text, 'アポメモ'),
        sitting_in: field(text, 'アポ相席'),
        posted_at: postedIso,
      },
    }
  }

  return null
}
