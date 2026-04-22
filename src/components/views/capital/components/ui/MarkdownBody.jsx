import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Caesar 統一の Markdown レンダラー (表/見出し/リスト/太字/コードブロック)
export default function MarkdownBody({ children, compact = false, dark = false }) {
  const base = {
    fontSize: compact ? 12 : 13,
    lineHeight: 1.9,
    color: '#181818',
    wordBreak: 'break-word',
  }
  return (
    <div className={`md-body ${compact ? 'md-compact' : ''} ${dark ? 'md-dark' : ''}`} style={base}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: props => <h1 style={{ fontSize: compact ? 15 : 17, fontWeight: 600, margin: '16px 0 8px', paddingBottom: 5, borderBottom: '0.5px solid ' + (dark ? '#E5E5E5' : '#E5E5E5') }} {...props} />,
          h2: props => <h2 style={{ fontSize: compact ? 14 : 15, fontWeight: 600, margin: '14px 0 6px', color: dark ? '#cedbea' : '#032D60' }} {...props} />,
          h3: props => <h3 style={{ fontSize: compact ? 13 : 14, fontWeight: 600, margin: '12px 0 4px', color: dark ? '#706E6B' : '#032D60' }} {...props} />,
          p:  props => <p style={{ margin: '6px 0' }} {...props} />,
          ul: props => <ul style={{ margin: '6px 0 10px 20px', padding: 0 }} {...props} />,
          ol: props => <ol style={{ margin: '6px 0 10px 22px', padding: 0 }} {...props} />,
          li: props => <li style={{ margin: '3px 0' }} {...props} />,
          strong: props => <strong style={{ fontWeight: 600, color: dark ? '#181818' : '#032D60' }} {...props} />,
          em: props => <em style={{ color: dark ? '#706E6B' : '#706E6B' }} {...props} />,
          code: ({ inline, ...props }) => inline
            ? <code style={{ background: dark ? '#FFFFFF' : '#F3F2F2', padding: '1px 5px', borderRadius: 3, fontSize: '0.92em', fontFamily: 'monospace' }} {...props} />
            : <code style={{ display: 'block', background: dark ? '#FFFFFF' : '#f6f8fb', padding: 10, borderRadius: 6, fontSize: '0.9em', fontFamily: 'monospace', overflow: 'auto' }} {...props} />,
          table: props => <div style={{ overflowX: 'auto', margin: '10px 0' }}><table style={{ borderCollapse: 'collapse', fontSize: compact ? 11 : 12, width: '100%' }} {...props} /></div>,
          thead: props => <thead style={{ background: dark ? '#FFFFFF' : '#FAFAFA' }} {...props} />,
          th: props => <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500, color: dark ? '#706E6B' : '#706E6B', borderBottom: '0.5px solid ' + (dark ? '#E5E5E5' : '#E5E5E5'), whiteSpace: 'nowrap' }} {...props} />,
          td: props => <td style={{ padding: '5px 10px', borderBottom: '0.5px solid ' + (dark ? '#E5E5E5' : '#f0f2f5'), verticalAlign: 'top' }} {...props} />,
          blockquote: props => <blockquote style={{ borderLeft: '3px solid ' + (dark ? '#032D60' : '#E5E5E5'), paddingLeft: 12, margin: '8px 0', color: dark ? '#706E6B' : '#706E6B' }} {...props} />,
          hr: () => <hr style={{ border: 'none', height: 0.5, background: dark ? '#E5E5E5' : '#E5E5E5', margin: '16px 0' }} />,
          a: props => <a style={{ color: '#032D60' }} target="_blank" rel="noreferrer" {...props} />,
        }}>
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}
