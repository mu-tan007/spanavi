import { useState } from 'react'
import { INDUSTRY_LABEL_MAP } from '../../constants/maNewsIndustries'

function formatJpy(v) {
  if (v == null) return ''
  const oku = v / 100_000_000
  if (oku >= 10000) return `約${(oku / 10000).toFixed(1)}兆円`
  if (oku >= 1) return `約${oku.toFixed(0)}億円`
  const man = v / 10_000
  return `約${man.toFixed(0)}万円`
}

function formatPeriod(pt, start, end) {
  if (pt === 'month') return `${start.slice(0, 7)}`
  return `${start} 〜 ${end}`
}

function inline(text) {
  const out = []
  const re = /\*\*([^*\n]+?)\*\*/g
  let last = 0
  let m
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<strong key={`b-${key++}`} style={{ fontWeight: 600, color: '#032D60' }}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out.length ? out : [text]
}

function renderMarkdown(md) {
  if (!md) return null
  const lines = md.split('\n')
  const blocks = []
  let para = []
  const flush = () => {
    if (para.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} style={{ fontSize: 13, lineHeight: 1.8, color: '#FFFFFF', margin: '6px 0' }}>{inline(para.join(' '))}</p>
      )
      para = []
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); continue }
    if (line.startsWith('### ')) {
      flush()
      blocks.push(<h3 key={`h3-${blocks.length}`} style={{ fontSize: 13, fontWeight: 600, color: '#032D60', margin: '16px 0 4px' }}>{inline(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      flush()
      blocks.push(<h2 key={`h2-${blocks.length}`} style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', margin: '18px 0 6px', paddingBottom: 4, borderBottom: '0.5px solid #F8F8F8' }}>{inline(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      flush()
      blocks.push(<h1 key={`h1-${blocks.length}`} style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', margin: '18px 0 6px' }}>{inline(line.slice(2))}</h1>)
    } else if (/^[-*]\s/.test(line)) {
      flush()
      blocks.push(<li key={`li-${blocks.length}`} style={{ fontSize: 13, lineHeight: 1.75, color: '#FFFFFF', marginLeft: 18 }}>{inline(line.slice(2))}</li>)
    } else {
      para.push(line)
    }
  }
  flush()
  return blocks
}

export default function TrendReportCard({ report }) {
  const [open, setOpen] = useState(false)
  const keyDeals = Array.isArray(report.key_deals) ? report.key_deals : []
  const sources = Array.isArray(report.sources) ? report.sources : []
  const webSources = sources.filter(s => s.url)

  return (
    <div style={{
      background: '#ffffff',
      border: '0.5px solid #E5E5E5',
      borderRadius: 12,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left',
          padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: '#F8F8F8', color: '#032D60', fontWeight: 500,
          }}>{INDUSTRY_LABEL_MAP[report.industry_key] || report.industry_key}</span>
          {report.region && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              background: report.region === 'global' ? '#d8e8f8' : '#e8e0d8',
              color: report.region === 'global' ? '#032D60' : '#80501a', fontWeight: 500,
            }}>{report.region === 'global' ? '海外' : '国内'}</span>
          )}
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: report.period_type === 'month' ? '#f0e8dc' : '#e8f0e0',
            color: report.period_type === 'month' ? '#a06020' : '#2a7050', fontWeight: 500,
          }}>
            {report.period_type === 'month' ? '月次' : '週次'}
          </span>
          <span style={{ fontSize: 11, color: '#706E6B', marginLeft: 'auto' }}>
            {formatPeriod(report.period_type, report.period_start, report.period_end)}
          </span>
        </div>

        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.5, margin: 0 }}>
          {report.title}
        </h3>

        <p style={{ fontSize: 12, color: '#706E6B', lineHeight: 1.7, margin: 0 }}>
          {report.summary}
        </p>

        {keyDeals.length > 0 && !open && (
          <div style={{ fontSize: 11, color: '#706E6B', marginTop: 2 }}>
            主要ディール {keyDeals.length} 件
          </div>
        )}

        <span style={{ fontSize: 11, color: '#032D60', marginTop: 4 }}>
          {open ? '▲ 閉じる' : '▼ トレンドレポートを開く'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 20px 20px', borderTop: '0.5px solid #F8F8F8' }}>
          <div style={{ paddingTop: 8 }}>
            {renderMarkdown(report.body_md)}
          </div>

          {keyDeals.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px dashed #E5E5E5' }}>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                主要ディール ({keyDeals.length})
              </div>
              {keyDeals.map((d, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: i < keyDeals.length - 1 ? '0.5px solid #F8F8F8' : 'none' }}>
                  <div style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 500 }}>
                    {d.name}
                    {d.date && <span style={{ color: '#706E6B', fontWeight: 400, marginLeft: 8 }}>{d.date}</span>}
                    {d.value_jpy != null && <span style={{ color: '#a06020', fontWeight: 500, marginLeft: 8 }}>{formatJpy(d.value_jpy)}</span>}
                  </div>
                  {d.note && <div style={{ fontSize: 11, color: '#706E6B', marginTop: 2 }}>{d.note}</div>}
                </div>
              ))}
            </div>
          )}

          {webSources.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px dashed #E5E5E5' }}>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                出典 ({webSources.length})
              </div>
              {webSources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'block', padding: '6px 0',
                    fontSize: 12, color: '#032D60', textDecoration: 'none',
                    borderBottom: i < webSources.length - 1 ? '0.5px solid #F8F8F8' : 'none',
                  }}>
                  {s.title || s.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
