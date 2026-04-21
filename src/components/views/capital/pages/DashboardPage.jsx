import { useDashboard } from '../hooks/useDashboard'
import { DEAL_STATUSES } from '../lib/constants'
import { Link } from 'react-router-dom'
import CaesarLogo from '../components/ui/CaesarLogo'

// ---- 共通スタイル定数 ----
const card = {
  background: '#ffffff',
  border: '0.5px solid #E5E5E5',
  borderRadius: 12,
  padding: 16,
}

// ---- ステータスバッジ ----
const STATUS_STYLE = {
  nn_review:       { bg: '#F3F2F2', color: '#2a4a7a', label: 'NN精査' },
  im_review:       { bg: '#F8F8F8', color: '#032D60', label: 'IM精査' },
  top_meeting:     { bg: '#dce8f5', color: '#144080', label: 'トップ面談' },
  loi_prep:        { bg: '#032D60', color: '#fff',    label: 'LOI準備' },
  dd:              { bg: '#0f3060', color: '#fff',    label: 'DD実施' },
  spa_negotiation: { bg: '#032D60', color: '#fff',    label: 'SPA・最終交渉' },
  stop:            { bg: '#FAF3E0', color: '#A08040', label: 'ストップ' },
  break:           { bg: '#FAECE7', color: '#EA001E', label: 'ブレイク' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: '#f0f0f0', color: '#555', label: status }
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 3,
      fontWeight: 500, background: s.bg, color: s.color,
      whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

// ---- KPIカード ----
function KpiCard({ label, value, sub, danger }) {
  return (
    <div style={{ background: '#F8F8F8', borderRadius: 8, padding: '12px 14px', border: '0.5px solid #E5E5E5' }}>
      <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: danger ? '#EA001E' : '#FFFFFF' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#706E6B', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ---- ファネルバー ----
const FUNNEL_STAGES = [
  { key: 'nn_review',       label: 'NN精査',        color: '#cdddf0' },
  { key: 'im_review',       label: 'IM精査',        color: '#9dbedd' },
  { key: 'top_meeting',     label: 'トップ面談',    color: '#6090bf' },
  { key: 'loi_prep',        label: 'LOI準備',       color: '#032D60' },
  { key: 'dd',              label: 'DD実施',        color: '#032D60' },
  { key: 'spa_negotiation', label: 'SPA・最終交渉', color: '#032D60' },
]

function PipelineFunnel({ statusCounts, stopped, broken }) {
  const max = Math.max(...FUNNEL_STAGES.map(s => statusCounts[s.key] || 0), 1)
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {FUNNEL_STAGES.map(s => {
          const count = statusCounts[s.key] || 0
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 10, color: '#706E6B', width: 96, flexShrink: 0 }}>{s.label}</div>
              <div style={{ flex: 1, background: '#F8F8F8', borderRadius: 3, height: 16, overflow: 'hidden' }}>
                <div style={{
                  width: `${(count / max) * 100}%`,
                  height: '100%',
                  background: s.color,
                  borderRadius: 3,
                  minWidth: count > 0 ? 8 : 0,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ fontSize: 11, color: '#706E6B', width: 20, textAlign: 'right' }}>{count}</div>
            </div>
          )
        })}
      </div>
      {/* ストップ・ブレイク */}
      <div style={{ borderTop: '0.5px solid #E5E5E5', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#A08040', width: 96 }}>ストップ中</div>
          <div style={{ flex: 1, background: '#F8F8F8', borderRadius: 3, height: 16, overflow: 'hidden' }}>
            <div style={{ width: `${(stopped.length / Math.max(max,1)) * 100}%`, height: '100%', background: '#e8b88a', borderRadius: 3, minWidth: stopped.length > 0 ? 8 : 0 }} />
          </div>
          <div style={{ fontSize: 11, color: '#A08040', width: 20, textAlign: 'right' }}>{stopped.length}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#EA001E', width: 96 }}>ブレイク</div>
          <div style={{ flex: 1, background: '#F8F8F8', borderRadius: 3, height: 16, overflow: 'hidden' }}>
            <div style={{ width: `${(broken.length / Math.max(max,1)) * 100}%`, height: '100%', background: '#F0B4B4', borderRadius: 3, minWidth: broken.length > 0 ? 8 : 0 }} />
          </div>
          <div style={{ fontSize: 11, color: '#EA001E', width: 20, textAlign: 'right' }}>{broken.length}</div>
        </div>
      </div>
    </div>
  )
}

// ---- 通知アイテム ----
function NotifItem({ n }) {
  const dotColor = n.is_read ? '#E5E5E5' : '#EA001E'
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '0.5px solid #E5E5E5' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, marginTop: 4, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFF' }}>{n.title}</div>
        {n.summary && <div style={{ fontSize: 11, color: '#706E6B', marginTop: 2 }}>{n.summary}</div>}
      </div>
      <div style={{ fontSize: 10, color: '#706E6B', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {formatRelative(n.created_at)}
      </div>
    </div>
  )
}

function formatRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'たった今'
  if (m < 60) return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// ---- メインページ ----
export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard()

  if (isLoading) return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      gap: 20,
    }}>
      <CaesarLogo size={56} animated={true} />
      <div style={{ fontSize: 12, color: '#706E6B', letterSpacing: '2px', textTransform: 'uppercase' }}>
        Loading
      </div>
    </div>
  )

  if (error) return (
    <div style={{ padding: 24, color: '#EA001E', fontSize: 13 }}>
      データの取得に失敗しました。再読み込みしてください。
    </div>
  )

  const { kpi, statusCounts, stopped, broken, active, deals, todos, notifications, meetings } = data

  // 優先案件 上位6件
  const priorityDeals = [...active]
    .sort((a, b) => a.priority - b.priority || new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 6)

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        <KpiCard label="進行中案件" value={kpi.activeCount} sub={`ストップ ${stopped.length} / ブレイク ${broken.length}`} />
        <KpiCard label="優先案件（高）" value={kpi.priority1Count} sub="優先度 高" />
        <KpiCard label="今月のトップ面談" value={kpi.topMeetingCount} sub="予定あり" />
        <KpiCard label="未対応タスク" value={kpi.todoCount} danger={kpi.todoCount > 0} sub="期限間近含む" />
      </div>

      {/* Row 2: Pipeline + Meetings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>案件パイプライン</div>
          <PipelineFunnel statusCounts={statusCounts} stopped={stopped} broken={broken} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '0.5px solid #E5E5E5' }}>
            <div>
              <div style={{ fontSize: 10, color: '#706E6B', marginBottom: 3 }}>ルート別</div>
              <div style={{ fontSize: 11, color: '#706E6B' }}>仲介/FA: <strong style={{ color: '#FFFFFF' }}>{active.filter(d => d.source_type !== 'self').length}</strong></div>
              <div style={{ fontSize: 11, color: '#706E6B' }}>自社ソーシング: <strong style={{ color: '#FFFFFF' }}>{active.filter(d => d.source_type === 'self').length}</strong></div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#706E6B', marginBottom: 3 }}>合計案件数</div>
              <div style={{ fontSize: 11, color: '#706E6B' }}>進行中: <strong style={{ color: '#FFFFFF' }}>{active.length}</strong></div>
              <div style={{ fontSize: 11, color: '#706E6B' }}>全案件: <strong style={{ color: '#FFFFFF' }}>{deals.length}</strong></div>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>直近の予定</div>
          {meetings.length === 0 ? (
            <div style={{ fontSize: 12, color: '#706E6B', padding: '20px 0', textAlign: 'center' }}>予定はありません</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {meetings.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < meetings.length - 1 ? '0.5px solid #E5E5E5' : 'none' }}>
                  <div style={{ fontSize: 10, color: '#706E6B', whiteSpace: 'nowrap', marginTop: 1, minWidth: 72 }}>{formatDate(m.held_at)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#FFFFFF' }}>{m.summary || '打合せ'}</div>
                    <div style={{ fontSize: 10, color: '#706E6B', marginTop: 2 }}>
                      {m.meeting_type === 'top_meeting' ? 'トップ面談' : '打合せ'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Deal list + Notif + TODO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginBottom: 20 }}>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B' }}>案件一覧（優先順）</div>
            <Link to="/deals" style={{ fontSize: 11, color: '#032D60' }}>全案件を見る</Link>
          </div>
          {priorityDeals.length === 0 ? (
            <div style={{ fontSize: 12, color: '#706E6B', padding: '20px 0', textAlign: 'center' }}>案件がありません</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {priorityDeals.map((d, i) => (
                <Link
                  key={d.id}
                  to={`/deals/${d.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0',
                    borderBottom: i < priorityDeals.length - 1 ? '0.5px solid #E5E5E5' : 'none',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#706E6B', width: 14 }}>{i + 1}</div>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: d.priority === 1 ? '#032D60' : d.priority === 2 ? '#032D60' : '#9fbedd',
                  }} />
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFF', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#706E6B', width: 72, flexShrink: 0 }}>{d.industry_label || '—'}</div>
                  <StatusBadge status={d.status} />
                  {d.ev_estimate && (
                    <div style={{ fontSize: 11, color: '#706E6B', width: 64, textAlign: 'right', flexShrink: 0 }}>
                      ¥{(d.ev_estimate / 100000000).toFixed(1)}億
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 通知 */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B' }}>案件通知</div>
              {kpi.unreadNotif > 0 && (
                <span style={{ fontSize: 10, background: '#EA001E', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>
                  {kpi.unreadNotif}
                </span>
              )}
            </div>
            {notifications.length === 0 ? (
              <div style={{ fontSize: 12, color: '#706E6B', padding: '12px 0', textAlign: 'center' }}>通知はありません</div>
            ) : (
              <div>
                {notifications.map((n, i) => (
                  <div key={n.id} style={{ borderBottom: i < notifications.length - 1 ? '0.5px solid #E5E5E5' : 'none' }}>
                    <NotifItem n={n} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TODO */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>TODO</div>
            {todos.length === 0 ? (
              <div style={{ fontSize: 12, color: '#706E6B', padding: '12px 0', textAlign: 'center' }}>タスクはありません</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {todos.map((t, i) => {
                  const isOverdue = t.due_date && new Date(t.due_date) < new Date()
                  const isToday = t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()
                  return (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: '7px 0',
                      borderBottom: i < todos.length - 1 ? '0.5px solid #E5E5E5' : 'none',
                    }}>
                      <div style={{
                        width: 14, height: 14, border: '0.5px solid #E5E5E5',
                        borderRadius: 3, marginTop: 1, flexShrink: 0,
                      }} />
                      <div style={{ fontSize: 12, color: '#FFFFFF', flex: 1, lineHeight: 1.4 }}>{t.title}</div>
                      {t.due_date && (
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 2, flexShrink: 0,
                          background: isOverdue ? '#fde8e8' : isToday ? '#fde8e8' : '#E1F5EE',
                          color: isOverdue ? '#8a1010' : isToday ? '#8a1010' : '#2E844A',
                        }}>
                          {isToday ? '今日' : isOverdue ? '期限超過' : t.due_date}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
