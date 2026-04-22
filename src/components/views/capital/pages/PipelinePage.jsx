import { useState } from 'react'
import { Link } from '../lib/miniRouter'
import { useDecisionQueue } from '../hooks/usePipeline'
import { useUpdateDealStatus } from '../hooks/useDeals'
import { useBudgetForecast } from '../hooks/useMaMandate'
import {
  DEAL_STATUSES,
  RECOMMENDATION_STYLE,
  NEXT_STAGE,
} from '../lib/constants'

const STAGE_LABEL = DEAL_STATUSES.reduce((acc, s) => {
  acc[s.value] = s.label
  return acc
}, {})

function fmtOku(v) {
  if (v == null || v === 0) return '—'
  const oku = v / 100_000_000
  if (oku >= 10)  return `¥${oku.toFixed(0)}億`
  if (oku >= 1)   return `¥${oku.toFixed(1)}億`
  return `¥${(v / 10_000).toFixed(0)}万`
}

function PriDot({ p }) {
  const c = p === 1 ? '#EA001E' : p === 2 ? '#e8a840' : '#9fbedd'
  return (
    <div style={{
      width: 9, height: 9, borderRadius: '50%', background: c, flexShrink: 0,
    }} title={`優先度 ${p}`} />
  )
}

function RecBadge({ rec }) {
  if (!rec) return null
  const s = RECOMMENDATION_STYLE[rec]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.4px',
      padding: '3px 8px', borderRadius: 3,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function ScoreChip({ total }) {
  if (total == null) return <span style={{ fontSize: 11, color: '#706E6B' }}>—</span>
  const color = total >= 80 ? '#2E844A' : total >= 60 ? '#032D60' : total >= 45 ? '#8a5010' : '#EA001E'
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color }}>{total}</span>
  )
}

function AgeLabel({ age, threshold }) {
  const over = age - threshold
  if (over >= 0) {
    return <span style={{ color: '#EA001E', fontWeight: 500 }}>滞留 {age.toFixed(0)}日（閾値 {threshold}日・{over.toFixed(0)}日超過）</span>
  }
  return <span style={{ color: '#706E6B' }}>滞留 {age.toFixed(0)}日（閾値 {threshold}日）</span>
}

function ReasonModal({ open, title, placeholder, onSubmit, onClose, saving }) {
  const [reason, setReason] = useState('')
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}
    onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 440, background: '#fff', borderRadius: 12, padding: 20,
          boxShadow: '0 10px 40px rgba(10,30,60,0.25)',
        }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#FFFFFF', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 12 }}>
          判断の根拠を記録しておくと、後日の振り返り（Pass Reasoning Analytics）で学習材料になります。
        </div>
        <textarea
          autoFocus
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={placeholder}
          rows={4}
          style={{
            width: '100%', padding: 10, fontSize: 12, color: '#FFFFFF',
            border: '0.5px solid #E5E5E5', borderRadius: 6, outline: 'none', resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              height: 34, padding: '0 14px', background: '#F3F2F2', border: '0.5px solid #E5E5E5',
              borderRadius: 6, fontSize: 12, color: '#706E6B', cursor: 'pointer',
            }}>キャンセル</button>
          <button
            onClick={() => onSubmit(reason)}
            disabled={saving || !reason.trim()}
            style={{
              height: 34, padding: '0 16px', background: '#032D60', border: 'none',
              borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#fff',
              cursor: saving || !reason.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || !reason.trim() ? 0.55 : 1,
            }}>
            {saving ? '保存中…' : '記録して実行'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DecisionCard({ d, onPursue, onPass, onHold, pending }) {
  const nextStage = NEXT_STAGE[d.status]
  return (
    <div style={{
      background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Top row: priority + name + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PriDot p={d.priority} />
        <Link to={`/deals/${d.id}`} style={{
          fontSize: 14, fontWeight: 500, color: '#FFFFFF', textDecoration: 'none',
        }}>{d.name}</Link>
        <div style={{ flex: 1 }} />
        <RecBadge rec={d.recommendation} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#706E6B', flexWrap: 'wrap' }}>
        <span>{d.industry_label || '業種未設定'}</span>
        <span style={{ color: '#E5E5E5' }}>│</span>
        <span>{STAGE_LABEL[d.status]}</span>
        <span style={{ color: '#E5E5E5' }}>│</span>
        <span>EV {fmtOku(d.ev_estimate)}</span>
        <span style={{ color: '#E5E5E5' }}>│</span>
        <span>スコア <ScoreChip total={d.score?.total} /></span>
      </div>

      {/* Age row */}
      <div style={{ fontSize: 11 }}>
        <AgeLabel age={d.stageAge} threshold={d.threshold} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={() => onPursue(d)}
          disabled={!nextStage || pending}
          style={{
            height: 32, padding: '0 12px', fontSize: 12, fontWeight: 500,
            background: nextStage ? '#032D60' : '#E5E5E5',
            color: '#fff', border: 'none', borderRadius: 6,
            cursor: nextStage && !pending ? 'pointer' : 'not-allowed',
            opacity: pending ? 0.6 : 1,
          }}
          title={nextStage ? `${STAGE_LABEL[nextStage]} へ進める` : 'これ以上進めるステージはありません'}
        >
          Pursue ▶ {nextStage ? STAGE_LABEL[nextStage] : 'クローズ'}
        </button>
        <button
          onClick={() => onPass(d)}
          disabled={pending}
          style={{
            height: 32, padding: '0 12px', fontSize: 12, fontWeight: 500,
            background: '#fff', color: '#EA001E', border: '0.5px solid #e0c8c8',
            borderRadius: 6, cursor: pending ? 'not-allowed' : 'pointer',
          }}>Pass</button>
        <button
          onClick={() => onHold(d)}
          disabled={pending}
          style={{
            height: 32, padding: '0 12px', fontSize: 12, fontWeight: 500,
            background: '#fff', color: '#8a5010', border: '0.5px solid #e8d4b8',
            borderRadius: 6, cursor: pending ? 'not-allowed' : 'pointer',
          }}>Hold</button>
        <div style={{ flex: 1 }} />
        <Link to={`/deals/${d.id}`} style={{
          height: 32, padding: '0 12px', fontSize: 12, color: '#706E6B',
          background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6,
          display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
        }}>詳細</Link>
      </div>
    </div>
  )
}

export default function PipelinePage() {
  const { data, isLoading, error } = useDecisionQueue()
  const updateStatus = useUpdateDealStatus()
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null) // { type:'pass'|'hold', deal }
  const [pendingId, setPendingId] = useState(null)

  if (isLoading) {
    return (
      <div style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: 12, color: '#706E6B' }}>読み込み中…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: '20px 24px', color: '#EA001E', fontSize: 13 }}>
        取得に失敗しました。再読み込みしてください。
      </div>
    )
  }

  const { items = [], weightedEvTotal = 0, byRec = {} } = data || {}
  const filtered = filter === 'all' ? items : items.filter(d => d.recommendation === filter)

  async function handlePursue(d) {
    const next = NEXT_STAGE[d.status]
    if (!next) return
    setPendingId(d.id)
    try {
      await updateStatus.mutateAsync({ id: d.id, status: next })
    } catch (e) {
      alert('更新に失敗しました: ' + (e?.message || '不明なエラー'))
    } finally {
      setPendingId(null)
    }
  }

  function openPass(d)  { setModal({ type: 'pass', deal: d }) }
  function openHold(d)  { setModal({ type: 'hold', deal: d }) }

  async function submitReason(reason) {
    if (!modal) return
    const status = modal.type === 'pass' ? 'break' : 'stop'
    setPendingId(modal.deal.id)
    try {
      await updateStatus.mutateAsync({ id: modal.deal.id, status, reason })
      setModal(null)
    } catch (e) {
      alert('更新に失敗しました: ' + (e?.message || '不明なエラー'))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 960 }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: '#FFFFFF' }}>Pipeline</h1>
        <p style={{ fontSize: 12, color: '#706E6B', marginTop: 4 }}>
          AIが分析済みの案件のうち、意思決定を要するものを緊急度順に表示しています。
        </p>
      </div>

      <BudgetSection />

      {/* KPI row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16,
      }}>
        <div style={kpi}>
          <div style={kpiLabel}>要判断件数</div>
          <div style={kpiValue}>{items.length}</div>
          <div style={kpiSub}>本日のGo/No-Go対象</div>
        </div>
        <div style={kpi}>
          <div style={kpiLabel}>加重EV</div>
          <div style={kpiValue}>{fmtOku(weightedEvTotal)}</div>
          <div style={kpiSub}>ステージ確率 × EV の合算</div>
        </div>
        <div style={kpi}>
          <div style={kpiLabel}>推奨内訳</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'baseline' }}>
            <MiniRec label="PURSUE" n={byRec.PURSUE || 0} color="#2E844A" />
            <MiniRec label="HOLD"   n={byRec.HOLD   || 0} color="#8a5010" />
            <MiniRec label="PASS"   n={byRec.PASS   || 0} color="#EA001E" />
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <Tab active={filter === 'all'}    onClick={() => setFilter('all')}>全件 ({items.length})</Tab>
        <Tab active={filter === 'PURSUE'} onClick={() => setFilter('PURSUE')}>推進 ({byRec.PURSUE || 0})</Tab>
        <Tab active={filter === 'HOLD'}   onClick={() => setFilter('HOLD')}>保留 ({byRec.HOLD || 0})</Tab>
        <Tab active={filter === 'PASS'}   onClick={() => setFilter('PASS')}>見送り ({byRec.PASS || 0})</Tab>
      </div>

      {/* Queue */}
      {filtered.length === 0 ? (
        <div style={{
          background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12,
          padding: '40px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 500, marginBottom: 4 }}>
            意思決定待ちの案件はありません
          </div>
          <div style={{ fontSize: 11, color: '#706E6B' }}>
            全て順調に進行中です。新規案件は Intake から登録できます。
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(d => (
            <DecisionCard
              key={d.id}
              d={d}
              onPursue={handlePursue}
              onPass={openPass}
              onHold={openHold}
              pending={pendingId === d.id}
            />
          ))}
        </div>
      )}

      <ReasonModal
        open={!!modal}
        title={modal?.type === 'pass' ? `Pass: ${modal?.deal?.name} を見送る` : `Hold: ${modal?.deal?.name} を保留する`}
        placeholder={modal?.type === 'pass'
          ? '例: バリュエーションが想定レンジを上回った / 事業シナジーが薄い / 経営陣への懸念'
          : '例: 追加情報を待つ / 同業他社の動向を確認中 / 社内稟議待ち'}
        onSubmit={submitReason}
        onClose={() => setModal(null)}
        saving={pendingId === modal?.deal?.id}
      />
    </div>
  )
}

function Tab({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 30, padding: '0 12px', fontSize: 12,
        background: active ? '#032D60' : '#fff',
        color: active ? '#fff' : '#706E6B',
        border: '0.5px solid ' + (active ? '#032D60' : '#E5E5E5'),
        borderRadius: 6, cursor: 'pointer', fontWeight: active ? 500 : 400,
      }}>{children}</button>
  )
}

function MiniRec({ label, n, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 16, fontWeight: 600, color }}>{n}</span>
      <span style={{ fontSize: 10, color: '#706E6B', letterSpacing: '0.3px' }}>{label}</span>
    </div>
  )
}

const kpi = {
  background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: '12px 14px',
}
const kpiLabel = { fontSize: 11, color: '#706E6B', fontWeight: 500 }
const kpiValue = { fontSize: 22, fontWeight: 600, color: '#FFFFFF', marginTop: 4 }
const kpiSub   = { fontSize: 10, color: '#A0A0A0', marginTop: 2 }

const PACE_STYLE = {
  over:     { color: '#EA001E', bg: '#fbeaea', label: '🔴' },
  good:     { color: '#2E844A', bg: '#e8f3e8', label: '🟢' },
  ok:       { color: '#2E844A', bg: '#e8f3e8', label: '🟢' },
  low:      { color: '#8a5010', bg: '#fff4e0', label: '🟡' },
  building: { color: '#706E6B', bg: '#eef3f8', label: '⚪' },
}

function BudgetSection() {
  const { data, isLoading } = useBudgetForecast()

  if (isLoading) return null

  if (!data?.configured) {
    return (
      <div style={{
        background: '#fff', border: '0.5px dashed #E5E5E5', borderRadius: 12,
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFF' }}>
          M&A投資方針が未設定です
        </div>
        <div style={{ fontSize: 11, color: '#706E6B', marginTop: 4, lineHeight: 1.6 }}>
          <Link to="/settings" style={{ color: '#032D60', textDecoration: 'none' }}>設定 → M&A投資方針</Link>
          {' '}から年間予算・会計年度を登録すると、当期の予算消化ペースが表示されます。
        </div>
      </div>
    )
  }

  const { budget, committed, remaining, committedRatio, fyLabel,
          fyRemainingDays, fyTotalDays, pace, paceMessage, activeDealCount,
          mandate } = data
  const pct = Math.max(0, Math.min(100, committedRatio * 100))
  const p = PACE_STYLE[pace] || PACE_STYLE.building
  const targetCount = mandate?.annual_target_deal_count

  return (
    <div style={{
      background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12,
      padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}>
          当期M&A投資枠 <span style={{ fontSize: 11, color: '#A0A0A0', marginLeft: 6 }}>{fyLabel}</span>
        </div>
        <div style={{ fontSize: 11, color: '#706E6B' }}>
          残り {fyRemainingDays}日 / {fyTotalDays}日
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={kpiLabel}>年間予算</div>
          <div style={kpiValue}>{fmtOku(budget)}</div>
          {targetCount ? <div style={kpiSub}>年間目標 {targetCount}件 / 現在 {activeDealCount}件進行中</div> : <div style={kpiSub}>現在 {activeDealCount}件進行中</div>}
        </div>
        <div>
          <div style={kpiLabel}>加重コミット</div>
          <div style={{ ...kpiValue, color: '#032D60' }}>{fmtOku(committed)}</div>
          <div style={kpiSub}>{(committedRatio * 100).toFixed(0)}% / 予算比</div>
        </div>
        <div>
          <div style={kpiLabel}>残枠</div>
          <div style={{ ...kpiValue, color: remaining < 0 ? '#EA001E' : '#2E844A' }}>{fmtOku(remaining)}</div>
          <div style={kpiSub}>{budget > 0 ? `${(100 - committedRatio * 100).toFixed(0)}% / 予算比` : '—'}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 8, background: '#eef3f8', borderRadius: 4, overflow: 'hidden', marginBottom: 10,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: committedRatio > 1 ? '#EA001E' : '#032D60',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Pace message */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: p.bg, borderRadius: 6,
      }}>
        <span style={{ fontSize: 14 }}>{p.label}</span>
        <span style={{ fontSize: 12, color: p.color, lineHeight: 1.5 }}>{paceMessage}</span>
      </div>
    </div>
  )
}
