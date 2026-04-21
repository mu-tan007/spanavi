import { useState } from 'react'
import { INDUSTRY_LABEL_MAP } from '../../constants/maNewsIndustries'

function formatJpy(v) {
  if (v == null) return null
  const oku = v / 100_000_000
  if (oku >= 10000) return `約${(oku / 10000).toFixed(1)}兆円`
  if (oku >= 1) return `約${oku.toFixed(0)}億円`
  const man = v / 10_000
  return `約${man.toFixed(0)}万円`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
        <p key={`p-${blocks.length}`} style={{ fontSize: 13, lineHeight: 1.75, color: '#FFFFFF', margin: '6px 0' }}>
          {inline(para.join(' '))}
        </p>
      )
      para = []
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); continue }
    if (line.startsWith('### ')) {
      flush()
      blocks.push(<h3 key={`h3-${blocks.length}`} style={{ fontSize: 13, fontWeight: 600, color: '#032D60', margin: '14px 0 4px' }}>{inline(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      flush()
      blocks.push(<h2 key={`h2-${blocks.length}`} style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', margin: '16px 0 6px' }}>{inline(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      flush()
      blocks.push(<h1 key={`h1-${blocks.length}`} style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', margin: '16px 0 6px' }}>{inline(line.slice(2))}</h1>)
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

export default function ReportCard({ report }) {
  const [open, setOpen] = useState(false)
  const dealValue = formatJpy(report.deal_value_jpy)
  const targets = Array.isArray(report.target_companies) ? report.target_companies : []
  const sources = Array.isArray(report.sources) ? report.sources : []

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
          width: '100%',
          textAlign: 'left',
          padding: '14px 18px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
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
          {dealValue && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              background: '#f0e8dc', color: '#a06020', fontWeight: 500,
            }}>{dealValue}</span>
          )}
          <span style={{ fontSize: 11, color: '#706E6B', marginLeft: 'auto' }}>
            {formatDate(report.published_at)}
          </span>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.5, margin: 0 }}>
          {report.title}
        </h3>

        <p style={{ fontSize: 12, color: '#706E6B', lineHeight: 1.65, margin: 0 }}>
          {report.summary}
        </p>

        {targets.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            {targets.map((t, i) => (
              <span key={i} style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 4,
                border: '0.5px solid #E5E5E5', color: '#706E6B',
              }}>
                {t.role === 'acquirer' ? '買収側' : t.role === 'target' ? '被買収' : ''}
                {t.role ? ': ' : ''}
                {t.name}
              </span>
            ))}
          </div>
        )}

        <span style={{ fontSize: 11, color: '#032D60', marginTop: 4 }}>
          {open ? '▲ レポートを閉じる' : '▼ 詳細レポートを開く'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px', borderTop: '0.5px solid #F8F8F8' }}>
          <div style={{ paddingTop: 8 }}>
            {renderMarkdown(report.body_md)}
          </div>

          {sources.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px dashed #E5E5E5' }}>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                出典 ({sources.length})
              </div>
              {sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'block', padding: '6px 0',
                    fontSize: 12, color: '#032D60',
                    textDecoration: 'none',
                    borderBottom: i < sources.length - 1 ? '0.5px solid #F8F8F8' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 10, color: '#706E6B', flexShrink: 0, minWidth: 90 }}>
                      {s.publisher || '—'}
                    </span>
                    <span style={{ flex: 1 }}>{s.title || s.url}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
