import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// マネジメント面談ログ — 3カテゴリ
const CATEGORIES = [
  { key: 'top_meeting',  label: 'トップ面談',     hint: 'CEO/会長との初期面談、経営理念・人物評価' },
  { key: 'dd_session',   label: 'DDセッション',    hint: '財務/法務/人事/オペ 各領域の深掘り' },
  { key: 'followup',     label: 'フォローアップ', hint: '追加質問・交渉・条件確認' },
]

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }

export default function MeetingsTab({ dealId }) {
  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ['deal-meetings', dealId],
    queryFn: async () => {
      const { data } = await supabase.from('deal_meetings').select('*').eq('deal_id', dealId).order('held_at', { ascending: false })
      return data || []
    },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>マネジメント面談ログ</div>
          <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>
            経営陣とのセッション記録。議事録を AIチャットに投げると自動でこのタブに記録されます。
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#706E6B' }}>
          合計 <strong style={{ color: '#032D60', fontSize: 14 }}>{meetings.length}</strong> 件
        </div>
      </div>

      {CATEGORIES.map(cat => {
        const list = meetings.filter(m => m.meeting_type === cat.key)
        return (
          <div key={cat.key} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '0.5px solid #E5E5E5' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#032D60' }}>
                  {cat.label} <span style={{ fontSize: 11, fontWeight: 400, color: '#A0A0A0', marginLeft: 6 }}>({list.length}件)</span>
                </div>
                <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 2 }}>{cat.hint}</div>
              </div>
            </div>

            {isLoading ? (
              <div style={{ fontSize: 12, color: '#E5E5E5', textAlign: 'center', padding: '16px 0' }}>読み込み中...</div>
            ) : list.length === 0 ? (
              <div style={{ padding: '20px 16px', background: '#FAFAFA', border: '0.5px dashed #E5E5E5', borderRadius: 6, fontSize: 12, color: '#706E6B', textAlign: 'center' }}>
                記録がまだありません。AIチャットに議事録をアップロードするか、カレンダーからこのカテゴリで予定を作成してください。
              </div>
            ) : (
              list.map((m, i) => (
                <div key={m.id} style={{ padding: '12px 0', borderBottom: i < list.length - 1 ? '0.5px solid #f0f2f5' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#032D60', fontWeight: 500 }}>
                      {m.held_at ? new Date(m.held_at).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '日程未設定'}
                    </span>
                    {m.attendees?.length > 0 && (
                      <span style={{ fontSize: 10, color: '#A0A0A0' }}>
                        参加者: {Array.isArray(m.attendees) ? m.attendees.slice(0, 3).join(', ') : ''}
                        {Array.isArray(m.attendees) && m.attendees.length > 3 ? ` 他${m.attendees.length - 3}名` : ''}
                      </span>
                    )}
                  </div>
                  {m.summary && (
                    <div style={{ fontSize: 12, color: '#FFFFFF', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{m.summary}</div>
                  )}
                  {m.action_items && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#FAFAFA', borderRadius: 5, fontSize: 11, color: '#706E6B', lineHeight: 1.7 }}>
                      <strong style={{ color: '#032D60' }}>アクション:</strong> {typeof m.action_items === 'string' ? m.action_items : JSON.stringify(m.action_items)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}
