import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { getDossierAiSpec } from '../_shared/engagementDossierSpec.ts'

// Exact pre-phase2 handler (git 9a58a7f, deployed v22), retained so comparison
// also works in CI's shallow checkout. Only transports/runtime are substituted.
const before = readFileSync(new URL('./fixtures/before-phase2.ts.txt', import.meta.url), 'utf8')
const after = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const compile = (source: string) => transformSync(source.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'cjs' }).code
const programs = { before: compile(before), after: compile(after) }
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const drain = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
const hpPages = [{ url: 'https://fixture.example/company', text: '株式会社検証、代表者：山田太郎、東京都千代田区1-2-3。精密機器の製造。' }]
const coreData = { content: { business: ['精密機器製造'], strengths: ['自社設計'], history: [{ year: '1985', event: '設立' }] }, sources: [{ type: 'hp', url: hpPages[0].url, identity_match: 'high' }] }
const newsData = { content: { industry_ma_news: [{ date: '2026-04-15', title: '業界ニュース', url: 'https://news.example/article', summary: '検証用記事', source: 'fixture', deal_type: 'M&A' }] }, sources: [{ type: 'web_search', url: 'https://news.example/article', identity_match: 'medium' }] }
const aiResponse = (data: unknown) => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(data) }] }))
const withoutTimes = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => ['generated_at', 'fetched_at'].includes(key) ? undefined : v))

function harness(version: keyof typeof programs, options: { noHp?: boolean; noMaster?: boolean; upsertFail?: boolean; missingAppointment?: boolean } = {}) {
  const hp = deferred<typeof hpPages>()
  const core = deferred<Response>()
  const news = deferred<Response>()
  const running = deferred<{ error: unknown }>()
  const events: string[] = []
  const requests: any[] = []
  const writes: any[] = []
  const timers: number[] = []
  let handler!: (request: Request) => Promise<Response>
  let background!: Promise<void>
  const appointment = { id: 'fixture-appointment', org_id: 'fixture-org', item_id: 'fixture-item', list_id: 'fixture-list', client_id: null, engagement_id: 'fixture-engagement', company_name: '株式会社検証', appo_report: null }
  const master = options.noMaster ? null : { company_name: '株式会社検証', industry_major: '製造業', industry_sub: '精密機器', address: '東京都千代田区1-2-3', representative: '山田太郎', employee_count: 20 }
  const client = { from(table: string) {
    const query = {
      select() { return query }, eq(...args: unknown[]) { if (pendingWrite) pendingWrite.eq = args; return query }, limit() { return query },
      maybeSingle: async () => ({ data: table === 'appointments' ? (options.missingAppointment ? null : appointment) : table === 'call_list_items' ? { company: '株式会社検証', representative: '山田太郎', address: '東京都千代田区1-2-3' } : table === 'call_lists' ? { company_url: options.noHp ? null : 'https://fixture.example' } : table === 'company_master' ? master : table === 'engagements' ? { slug: 'seller_sourcing' } : null }),
      upsert(value: unknown, config: unknown) { writes.push({ table, action: 'upsert', value, config }); events.push('running'); return running.promise },
      update(value: unknown) { pendingWrite = { table, action: 'update', value }; writes.push(pendingWrite); events.push('persist'); return query },
      then(resolve: (value: unknown) => void) { resolve({ error: null }) },
    }
    let pendingWrite: any
    return query
  } }
  new Function('createClient', 'fetchCompanyPagesFromDomain', 'getDossierAiSpec', 'Deno', 'EdgeRuntime', 'fetch', 'console', 'setTimeout', 'clearTimeout', programs[version])(
    () => client,
    (url: string) => { expect(url).toBe('https://fixture.example'); events.push('hp'); return hp.promise },
    getDossierAiSpec,
    { env: { get: (name: string) => ({ SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', ANTHROPIC_API_KEY: 'fixture-api' }[name]) }, serve: (fn: typeof handler) => { handler = fn } },
    { waitUntil: (promise: Promise<void>) => { background = promise } },
    (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages')
      const body = JSON.parse(String(init.body))
      const kind = body.max_tokens === 3000 ? 'core' : 'news'
      events.push(kind)
      requests.push({ kind, url, method: init.method, headers: init.headers, body, hasAbortSignal: init.signal instanceof AbortSignal })
      return kind === 'core' ? core.promise : news.promise
    },
    { error() {} },
    (_fn: unknown, ms: number) => { timers.push(ms); return timers.length },
    () => {},
  )
  return {
    hp, core, news, running, events, requests, writes, timers,
    start: async (body: unknown = { appointment_id: appointment.id }) => {
      const response = await handler(new Request('https://edge.example/generate-company-dossier', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      await drain()
      return response
    },
    finish: () => background,
    allowRunning: async () => { running.resolve({ error: options.upsertFail ? { message: 'fixture upsert failure' } : null }); await drain() },
  }
}

describe('real dossier handler: overlap only independent industry news with HP fetch', () => {
  it('starts news while HP is pending, waits for HP before core, and waits for core before persisting', async () => {
    const h = harness('after')
    expect((await h.start()).status).toBe(202)
    expect(h.events).toEqual(['running'])
    await h.allowRunning()
    expect(h.events).toEqual(['running', 'hp', 'news'])
    h.news.resolve(aiResponse(newsData)); await drain()
    expect(h.events).not.toContain('core')
    expect(h.events).not.toContain('persist')
    h.hp.resolve(hpPages); await drain()
    expect(h.events).toContain('core')
    expect(h.requests.find(r => r.kind === 'core').body.messages[0].content).toContain(hpPages[0].text)
    expect(h.events).not.toContain('persist')
    h.core.resolve(aiResponse(coreData)); await h.finish()
    expect(h.events.filter(e => e === 'persist')).toHaveLength(1)
  })

  it('does not persist when core completes before news', async () => {
    const h = harness('after'); await h.start(); await h.allowRunning()
    h.hp.resolve(hpPages); h.core.resolve(aiResponse(coreData)); await drain()
    expect(h.events).toContain('core')
    expect(h.events).not.toContain('persist')
    h.news.resolve(aiResponse(newsData)); await h.finish()
    expect(h.events.filter(e => e === 'persist')).toHaveLength(1)
  })

  for (const scenario of ['success', 'hp-failure', 'no-hp', 'core-failure', 'news-failure', 'both-fail', 'both-fail-no-master', 'upsert-failure', 'missing-appointment'] as const) {
    it(`matches pre-change complete AI payloads and persisted result: ${scenario}`, async () => {
      const results: any[] = []
      for (const version of ['before', 'after'] as const) {
        const h = harness(version, { noHp: scenario === 'no-hp', noMaster: scenario === 'both-fail-no-master', upsertFail: scenario === 'upsert-failure', missingAppointment: scenario === 'missing-appointment' })
        const response = await h.start(); await h.allowRunning()
        if (!['upsert-failure', 'missing-appointment'].includes(scenario)) {
          if (scenario === 'hp-failure') h.hp.reject(new Error('HP unavailable'))
          else h.hp.resolve(hpPages)
          await drain()
          h.core.resolve(['core-failure', 'both-fail', 'both-fail-no-master'].includes(scenario) ? new Response('fixture core failure', { status: 503 }) : aiResponse(coreData))
          h.news.resolve(['news-failure', 'both-fail', 'both-fail-no-master'].includes(scenario) ? new Response('fixture news failure', { status: 503 }) : aiResponse(newsData))
        }
        await h.finish()
        results.push({ status: response.status, response: await response.json(), requests: h.requests.sort((a, b) => a.kind.localeCompare(b.kind)), writes: withoutTimes(h.writes), timers: h.timers })
        if (['upsert-failure', 'missing-appointment'].includes(scenario)) {
          expect(h.requests).toHaveLength(0)
          expect(h.events).not.toContain('hp')
        } else {
          expect(h.requests).toHaveLength(2)
          expect(h.timers).toEqual([120000, 120000])
          expect(h.writes[1].value.generation_status).toBe(scenario === 'both-fail-no-master' ? 'failed' : ['core-failure', 'news-failure', 'both-fail'].includes(scenario) ? 'partial' : 'succeeded')
        }
      }
      expect(results[1]).toEqual(results[0])
    })
  }

  it('preserves input rejection without starting background work', async () => {
    for (const version of ['before', 'after'] as const) {
      const h = harness(version)
      expect((await h.start({})).status).toBe(400)
      expect(h.events).toEqual([])
      expect(h.requests).toEqual([])
    }
  })

  it('attaches news rejection immediately while HP is pending; does not turn malformed JSON into partial success', async () => {
    const h = harness('after'); await h.start(); await h.allowRunning()
    const failed = expect(h.finish()).rejects.toBeInstanceOf(SyntaxError)
    h.news.resolve(new Response('not JSON'))
    await failed
    expect(h.events).not.toContain('persist')
    h.hp.resolve(hpPages); h.core.resolve(aiResponse(coreData)); await drain()
    expect(h.events).not.toContain('persist')
  })
})
