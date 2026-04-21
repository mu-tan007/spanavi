import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function LoginHistorySection() {
  const { user } = useAuth()

  const { data: logins = [], isLoading } = useQuery({
    queryKey: ['login-history', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('login_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      return data || []
    },
  })

  if (isLoading) {
    return <div style={{ fontSize: 12, color: '#A0A0A0', padding: 12 }}>読み込み中...</div>
  }

  if (logins.length === 0) {
    return <div style={{ fontSize: 12, color: '#A0A0A0', padding: 12 }}>ログイン履歴はまだ記録されていません</div>
  }

  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid #E5E5E5', color: '#A0A0A0', fontSize: 11 }}>
            <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 500 }}>日時</th>
            <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 500 }}>結果</th>
            <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 500 }}>デバイス</th>
            <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 500 }}>ブラウザ</th>
            <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 500 }}>OS</th>
          </tr>
        </thead>
        <tbody>
          {logins.map(l => (
            <tr key={l.id} style={{ borderBottom: '0.5px solid #f0f2f5' }}>
              <td style={{ padding: '8px 6px', color: '#FFFFFF' }}>
                {new Date(l.created_at).toLocaleString('ja-JP')}
              </td>
              <td style={{ padding: '8px 6px' }}>
                {l.success ? (
                  <span style={{ color: '#2E844A' }}>✓ 成功</span>
                ) : (
                  <span style={{ color: '#EA001E' }}>✗ 失敗</span>
                )}
              </td>
              <td style={{ padding: '8px 6px', color: '#706E6B' }}>{l.device_type || '—'}</td>
              <td style={{ padding: '8px 6px', color: '#706E6B' }}>{l.browser || '—'}</td>
              <td style={{ padding: '8px 6px', color: '#706E6B' }}>{l.os || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
