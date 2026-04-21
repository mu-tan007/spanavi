import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'

const ACTION_LABELS = {
  create: '作成', update: '更新', delete: '削除', view: '閲覧',
  export: 'エクスポート', ai_call: 'AI実行', login: 'ログイン', logout: 'ログアウト',
  mfa_enrolled: 'MFA有効化', mfa_removed: 'MFA削除',
  password_changed: 'パスワード変更', broadcast_send: '一斉送信',
}

const ACTION_COLORS = {
  delete: '#EA001E', export: '#C8A84B', ai_call: '#032D60',
  login: '#2E844A', mfa_enrolled: '#2E844A', mfa_removed: '#EA001E',
  broadcast_send: '#C8A84B',
}

function csvEscape(v) {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function exportCsv(logs) {
  const header = ['日時', 'ユーザー', '操作', '対象種別', '対象ID', '対象名', 'metadata']
  const rows = logs.map(l => [
    new Date(l.created_at).toLocaleString('ja-JP', { hour12: false }),
    l.user_email || '',
    l.action || '',
    l.resource_type || '',
    l.resource_id || '',
    l.resource_name || '',
    l.metadata ? JSON.stringify(l.metadata) : '',
  ])
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n')
  // Excel用BOM
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  logAudit({ action: 'export', resourceType: 'audit_log', metadata: { rows: logs.length } })
}

export default function AuditLogSection() {
  const [filterAction, setFilterAction] = useState('')
  const [filterResource, setFilterResource] = useState('')
  const [days, setDays] = useState(30)

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', filterAction, filterResource, days],
    queryFn: async () => {
      let q = supabase.from('audit_logs').select('*')
        .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(500)
      if (filterAction) q = q.eq('action', filterAction)
      if (filterResource) q = q.eq('resource_type', filterResource)
      const { data } = await q
      return data || []
    },
  })

  const inp = (val, set, options, placeholder) => (
    <select value={val} onChange={e => set(e.target.value)}
      style={{ height: 30, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none', background: '#fff' }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  const actionOpts = Object.entries(ACTION_LABELS).map(([v, l]) => ({ value: v, label: l }))
  const resourceOpts = ['deal', 'contact', 'firm', 'file', 'auth', 'broadcast', 'chat', 'company']
    .map(v => ({ value: v, label: v }))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {inp(filterAction, setFilterAction, actionOpts, 'すべての操作')}
        {inp(filterResource, setFilterResource, resourceOpts, 'すべての対象')}
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          style={{ height: 30, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none', background: '#fff' }}>
          <option value={7}>過去7日</option>
          <option value={30}>過去30日</option>
          <option value={90}>過去90日</option>
          <option value={365}>過去1年</option>
        </select>
        <span style={{ fontSize: 11, color: '#A0A0A0', marginLeft: 'auto' }}>
          {logs.length}件 (最大500件表示)
        </span>
        <button onClick={() => exportCsv(logs)} disabled={logs.length === 0}
          style={{ height: 30, padding: '0 12px', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, color: '#032D60', cursor: logs.length === 0 ? 'default' : 'pointer', opacity: logs.length === 0 ? 0.5 : 1 }}>
          CSVダウンロード
        </button>
      </div>

      {isLoading ? (
        <div style={{ fontSize: 12, color: '#A0A0A0', padding: 12 }}>読み込み中...</div>
      ) : logs.length === 0 ? (
        <div style={{ fontSize: 12, color: '#A0A0A0', padding: 12 }}>該当する監査ログはありません</div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 600, border: '0.5px solid #E5E5E5', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#FAFAFA' }}>
              <tr style={{ borderBottom: '0.5px solid #E5E5E5', color: '#706E6B', fontSize: 11 }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500 }}>日時</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500 }}>ユーザー</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500 }}>操作</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500 }}>対象</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500 }}>名称</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{ borderBottom: '0.5px solid #f0f2f5' }}>
                  <td style={{ padding: '6px 10px', color: '#FFFFFF', whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleString('ja-JP', { hour12: false })}
                  </td>
                  <td style={{ padding: '6px 10px', color: '#706E6B' }}>{l.user_email || '—'}</td>
                  <td style={{ padding: '6px 10px', color: ACTION_COLORS[l.action] || '#FFFFFF', fontWeight: 500 }}>
                    {ACTION_LABELS[l.action] || l.action}
                  </td>
                  <td style={{ padding: '6px 10px', color: '#706E6B' }}>{l.resource_type}</td>
                  <td style={{ padding: '6px 10px', color: '#FFFFFF', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.resource_name || l.resource_id?.slice(0, 8) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
