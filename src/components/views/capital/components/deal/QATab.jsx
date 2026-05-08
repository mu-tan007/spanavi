import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'
import { invokeFn } from '../../lib/invokeFn'
import { onEnterSubmit } from '../../lib/keyboard'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Card, Badge } from '../../../../ui'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const inp = { width: '100%', padding: '8px 12px', border: `0.5px solid ${color.border}`, borderRadius: radius.lg, fontSize: font.size.base, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, background: color.white, color: color.textDark }

const SOURCE_LABEL = {
  manual: '手動',
  chat_extracted: 'チャット抽出',
  ai_suggested: 'AI提案',
}
const SOURCE_VARIANT = {
  manual: 'neutral',
  chat_extracted: 'primary',
  ai_suggested: 'info',
}

export default function QATab({ dealId }) {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [newQ, setNewQ] = useState('')
  const [editing, setEditing] = useState(null) // qa.id
  const [editForm, setEditForm] = useState({})
  const [syncing, setSyncing] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['deal-qa', dealId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_deal_qa')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  async function addManual() {
    if (!newQ.trim() || false) return
    await supabase.from('cap_deal_qa').insert({
      deal_id: dealId,       question: newQ, status: 'open',
      asked_at: new Date().toISOString(),
      source: 'manual',
    })
    logAudit({ action: 'create', resourceType: 'qa', metadata: { deal_id: dealId, source: 'manual' } })
    setNewQ('')
    qc.invalidateQueries({ queryKey: ['deal-qa', dealId] })
  }

  async function saveEdit(q) {
    const update = { ...editForm }
    if (editForm.answer && !q.answered_at) {
      update.answered_at = new Date().toISOString()
      update.status = 'answered'
    }
    await supabase.from('cap_deal_qa').update(update).eq('id', q.id)
    logAudit({ action: 'update', resourceType: 'qa', resourceId: q.id })
    setEditing(null); setEditForm({})
    qc.invalidateQueries({ queryKey: ['deal-qa', dealId] })
  }

  async function deleteQA(q) {
    if (!confirm('この QA を削除しますか？')) return
    await supabase.from('cap_deal_qa').delete().eq('id', q.id)
    logAudit({ action: 'delete', resourceType: 'qa', resourceId: q.id })
    qc.invalidateQueries({ queryKey: ['deal-qa', dealId] })
  }

  async function callFn(mode) {
    const setLoading = mode === 'extract' ? setSyncing : setSuggesting
    setLoading(true); setSyncMsg('')
    try {
      const data = await invokeFn('deal-qa-sync', { deal_id: dealId, mode })
      logAudit({ action: 'ai_call', resourceType: 'qa', metadata: { deal_id: dealId, mode, added: data.added } })
      setSyncMsg(`${mode === 'extract' ? 'チャットから' : 'AI提案として'} ${data.added || 0} 件追加しました`)
      qc.invalidateQueries({ queryKey: ['deal-qa', dealId] })
      setTimeout(() => setSyncMsg(''), 4000)
    } catch (e) {
      setSyncMsg('エラー: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <Card padding="lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.medium, color: color.navy }}>Q&A シート ({items.length}件)</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2, lineHeight: 1.7 }}>
            AIチャット履歴から抽出 / 追加で確認すべき質問を AI が提案 / 手動追加も可能
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => callFn('extract')} disabled={syncing || suggesting} loading={syncing}>
            {syncing ? '抽出中…' : 'チャットから抽出'}
          </Button>
          <Button size="sm" onClick={() => callFn('suggest')} disabled={syncing || suggesting} loading={suggesting}>
            {suggesting ? '提案中…' : '追加質問をAI提案'}
          </Button>
        </div>
      </Card>
      {syncMsg && <div style={{ padding: '8px 14px', background: color.successSoft, borderRadius: radius.lg, fontSize: font.size.sm, color: color.success }}>{syncMsg}</div>}

      {/* Add new */}
      <Card padding="lg">
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textLight, marginBottom: 10 }}>新規質問を追加</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea value={newQ} onChange={e => setNewQ(e.target.value)} rows={2}
            onKeyDown={onEnterSubmit(addManual)}
            placeholder="例: 過去3期の主要取引先トップ5の売上構成比は? (Enterで追加 / Shift+Enterで改行)"
            style={{ ...inp, flex: 1 }} />
          <Button onClick={addManual} disabled={!newQ.trim()} style={{ height: 60 }}>
            追加
          </Button>
        </div>
      </Card>

      {/* List */}
      {isLoading ? (
        <Card padding="lg" style={{ textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>読み込み中...</Card>
      ) : items.length === 0 ? (
        <Card padding="lg" style={{ textAlign: 'center', color: color.textLight, padding: '40px 20px' }}>
          <div style={{ fontSize: font.size.base, marginBottom: 8 }}>QAがまだありません</div>
          <div style={{ fontSize: font.size.xs }}>「チャットから抽出」または「追加質問をAI提案」で自動追加できます</div>
        </Card>
      ) : items.map(q => (
        <Card key={q.id} padding="lg">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: font.size.xs, color: color.textLight }}>
            <Badge variant={SOURCE_VARIANT[q.source] || 'neutral'} size="sm">
              {SOURCE_LABEL[q.source] || q.source || '—'}
            </Badge>
            <span>質問日: {q.asked_at ? new Date(q.asked_at).toLocaleDateString('ja-JP') : '—'}</span>
            <span>回答日: {q.answered_at ? new Date(q.answered_at).toLocaleDateString('ja-JP') : '—'}</span>
            <Badge variant={q.status === 'answered' ? 'success' : 'warn'} size="sm" style={{ marginLeft: 'auto' }}>
              {q.status === 'answered' ? '回答済' : '未回答'}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(q.id); setEditForm({ question: q.question, answer: q.answer || '', status: q.status }) }}>
              編集
            </Button>
            <Button variant="ghost" size="sm" onClick={() => deleteQA(q)} style={{ color: color.danger }}>削除</Button>
          </div>

          {editing === q.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 4 }}>質問</div>
                <textarea value={editForm.question} onChange={e => setEditForm(f => ({ ...f, question: e.target.value }))} rows={2} style={inp} />
              </div>
              <div>
                <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 4 }}>回答</div>
                <textarea value={editForm.answer} onChange={e => setEditForm(f => ({ ...f, answer: e.target.value }))} rows={3} style={inp} placeholder="回答を入力..." />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="outline" size="sm" onClick={() => { setEditing(null); setEditForm({}) }}>
                  キャンセル
                </Button>
                <Button size="sm" onClick={() => saveEdit(q)}>
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                <Badge variant="primary" size="sm">Q</Badge>
                <div style={{ fontSize: font.size.base, color: color.navy, lineHeight: 1.8, flex: 1 }}>{q.question}</div>
              </div>
              {q.answer ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Badge variant="success" size="sm">A</Badge>
                  <div style={{ fontSize: font.size.base, color: color.textLight, lineHeight: 1.8, flex: 1, whiteSpace: 'pre-wrap' }}>{q.answer}</div>
                </div>
              ) : (
                <div style={{ fontSize: font.size.xs, color: color.textLight, paddingLeft: 32 }}>回答待ち</div>
              )}
            </>
          )}
        </Card>
      ))}
    </div>
  )
}
