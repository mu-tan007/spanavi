import { useMemo, useState } from 'react'
import IndustryTabs from '../components/ma-news/IndustryTabs'
import ReportCard from '../components/ma-news/ReportCard'
import TrendReportCard from '../components/ma-news/TrendReportCard'
import { useMaNewsReports, useMaTrendReports, useMaNewsAvailableDates } from '../hooks/useMaNews'
import { MA_NEWS_INDUSTRIES, INDUSTRY_LABEL_MAP } from '../constants/maNewsIndustries'

const WINDOW_DAYS = 3
const VIEWS = [
  { key: 'daily',   label: '日次ニュース' },
  { key: 'weekly',  label: '週次トレンド' },
  { key: 'monthly', label: '月次トレンド' },
]

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDaysIso(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

export default function MaNewsPage() {
  const [view, setView] = useState('daily')
  const [endDate, setEndDate] = useState(todayIso())
  const [industry, setIndustry] = useState('all')

  const startDate = useMemo(() => addDaysIso(endDate, -(WINDOW_DAYS - 1)), [endDate])

  const { data: dailyReports = [], isLoading: isLoadingDaily } = useMaNewsReports({ startDate, endDate, region: 'jp' })
  const { data: weeklyReports = [], isLoading: isLoadingWeekly } = useMaTrendReports({ periodType: view === 'weekly' ? 'week' : null, region: 'jp' })
  const { data: monthlyReports = [], isLoading: isLoadingMonthly } = useMaTrendReports({ periodType: view === 'monthly' ? 'month' : null, region: 'jp' })
  const { data: availableDates = [] } = useMaNewsAvailableDates()

  const activeReports = view === 'daily' ? dailyReports : view === 'weekly' ? weeklyReports : monthlyReports
  const isLoading = view === 'daily' ? isLoadingDaily : view === 'weekly' ? isLoadingWeekly : isLoadingMonthly

  const counts = useMemo(() => {
    const c = { all: activeReports.length }
    for (const r of activeReports) c[r.industry_key] = (c[r.industry_key] || 0) + 1
    return c
  }, [activeReports])

  const filtered = useMemo(() => {
    if (industry === 'all') return activeReports
    return activeReports.filter(r => r.industry_key === industry)
  }, [activeReports, industry])

  const grouped = useMemo(() => {
    if (industry !== 'all') return null
    const map = new Map()
    for (const r of filtered) {
      if (!map.has(r.industry_key)) map.set(r.industry_key, [])
      map.get(r.industry_key).push(r)
    }
    const order = MA_NEWS_INDUSTRIES.map(i => i.key)
    return order.filter(k => map.has(k)).map(k => ({ key: k, label: INDUSTRY_LABEL_MAP[k], reports: map.get(k) }))
  }, [filtered, industry])

  const isToday = endDate === todayIso()
  const latestAvailable = availableDates[0]
  const showStaleHint = view === 'daily' && !isLoading && activeReports.length === 0 && latestAvailable && latestAvailable < startDate

  const renderCard = (r) => view === 'daily'
    ? <ReportCard key={r.id} report={r} />
    : <TrendReportCard key={r.id} report={r} />

  const subheader = view === 'daily'
    ? (isToday ? `業界別の最新M&Aディール(直近${WINDOW_DAYS}日)。毎朝自動更新。` : `${startDate} 〜 ${endDate} のM&Aディール(${WINDOW_DAYS}日間)`)
    : view === 'weekly'
      ? '業界別の週次M&Aトレンド。毎週月曜09:00 JST自動生成。'
      : '業界別の月次M&Aトレンド。毎月1日09:00 JST自動生成。'

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: '#FFFFFF' }}>M&A News</h1>
          <p style={{ fontSize: 12, color: '#706E6B', marginTop: 3 }}>{subheader}</p>
        </div>

        {view === 'daily' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#706E6B' }}>基準日</label>
            <input
              type="date"
              value={endDate}
              max={todayIso()}
              onChange={e => setEndDate(e.target.value || todayIso())}
              style={{
                height: 32, padding: '0 10px',
                border: '0.5px solid #E5E5E5',
                borderRadius: 6, fontSize: 12, color: '#FFFFFF',
                background: '#ffffff',
              }}
            />
            {!isToday && (
              <button
                onClick={() => setEndDate(todayIso())}
                style={{
                  height: 32, padding: '0 12px',
                  background: 'transparent',
                  border: '0.5px solid #E5E5E5',
                  borderRadius: 6, fontSize: 11, color: '#706E6B',
                  cursor: 'pointer',
                }}
              >今日に戻す</button>
            )}
          </div>
        )}
      </div>

      {/* View switcher */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, padding: 2, background: '#F8F8F8', borderRadius: 8, width: 'fit-content' }}>
        {VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            style={{
              height: 30, padding: '0 16px',
              border: 'none',
              background: view === v.key ? '#ffffff' : 'transparent',
              color: view === v.key ? '#FFFFFF' : '#706E6B',
              fontSize: 12,
              fontWeight: view === v.key ? 600 : 400,
              borderRadius: 6,
              cursor: 'pointer',
              boxShadow: view === v.key ? '0 1px 2px rgba(10,30,60,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >{v.label}</button>
        ))}
      </div>

      <IndustryTabs value={industry} onChange={setIndustry} counts={counts} />

      {isLoading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#706E6B', fontSize: 12 }}>
          読み込み中…
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center',
          background: '#ffffff', border: '0.5px dashed #E5E5E5',
          borderRadius: 12, color: '#706E6B', fontSize: 13,
        }}>
          {view === 'daily' ? (
            <>
              <div style={{ marginBottom: 6 }}>{startDate} 〜 {endDate} のレポートはまだありません。</div>
              {showStaleHint && (
                <button
                  onClick={() => setEndDate(latestAvailable)}
                  style={{
                    marginTop: 8, height: 32, padding: '0 14px',
                    background: '#032D60', border: 'none', borderRadius: 6,
                    color: '#fff', fontSize: 12, cursor: 'pointer',
                  }}
                >最新のレポート({latestAvailable})を含む期間を表示</button>
              )}
              {!showStaleHint && (
                <div style={{ fontSize: 11, color: '#706E6B', marginTop: 4 }}>毎朝 08:00 JST に自動更新されます。</div>
              )}
            </>
          ) : view === 'weekly' ? (
            <>
              <div style={{ marginBottom: 6 }}>週次トレンドレポートはまだありません。</div>
              <div style={{ fontSize: 11, color: '#706E6B' }}>毎週月曜09:00 JSTに前週分が自動生成されます。</div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 6 }}>月次トレンドレポートはまだありません。</div>
              <div style={{ fontSize: 11, color: '#706E6B' }}>毎月1日09:00 JSTに前月分が自動生成されます。</div>
            </>
          )}
        </div>
      )}

      {!isLoading && industry === 'all' && grouped && grouped.map(group => (
        <section key={group.key} style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#032D60',
            letterSpacing: 1, textTransform: 'uppercase',
            padding: '6px 0', marginBottom: 8,
            borderBottom: '0.5px solid #E5E5E5',
          }}>
            {group.label} <span style={{ color: '#706E6B', fontWeight: 400 }}>({group.reports.length})</span>
          </div>
          {group.reports.map(renderCard)}
        </section>
      ))}

      {!isLoading && industry !== 'all' && filtered.map(renderCard)}
    </div>
  )
}
