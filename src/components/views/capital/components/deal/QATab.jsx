import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'
import { invokeFn } from '../../lib/invokeFn'
import { onEnterSubmit } from '../../lib/keyboard'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }
const inp = { width: '100%', padding: '8px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7 }

const SOURCE_LABEL = {
  manual: '手動',
  chat_extracted: 'チャット抽出',
  ai_suggested: 'AI提案',
}
const SOURCE_COLOR = {
  manual: { bg: '#F3F2F2', color: '#706E6B' },
  chat_extracted: { bg: '#F8F8F8', color: '#032D60' },
  ai_suggested: { bg: '#f5ecf8', color: '#6830a0' },
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
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#032D60' }}>Q&A シート ({items.length}件)</div>
          <div style={{ fontSize: 11, color: '#706E6B', marginTop: 2, lineHeight: 1.7 }}>
            AIチャット履歴から抽出 / 追加で確認すべき質問を AI が提案 / 手動追加も可能
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => callFn('extract')} disabled={syncing || suggesting}
            style={{ height: 32, padding: '0 14px', background: '#fff', color: '#032D60', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {syncing ? '抽出中…' : 'チャットから抽出'}
          </button>
          <button onClick={() => callFn('suggest')} disabled={syncing || suggesting}
            style={{ height: 32, padding: '0 14px', background: '#032D60', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {suggesting ? '提案中…' : '追加質問をAI提案'}
          </button>
        </div>
      </div>
      {syncMsg && <div style={{ padding: '8px 14px', background: '#E1F5EE', borderRadius: 6, fontSize: 12, color: '#2E844A' }}>{syncMsg}</div>}

      {/* Add new */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 10 }}>新規質問を追加</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea value={newQ} onChange={e => setNewQ(e.target.value)} rows={2}
            onKeyDown={onEnterSubmit(addManual)}
            placeholder="例: 過去3期の主要取引先トップ5の売上構成比は? (Enterで追加 / Shift+Enterで改行)"
            style={{ ...inp, flex: 1 }} />
          <button onClick={addManual} disabled={!newQ.trim()}
            style={{ height: 60, padding: '0 20px', background: newQ.trim() ? '#032D60' : '#A0A0A0', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
            追加
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ ...card, textAlign: 'center', color: '#706E6B', fontSize: 12 }}>読み込み中...</div>
      ) : items.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: '#706E6B', padding: '40px 20px' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>QAがまだありません</div>
          <div style={{ fontSize: 11 }}>「チャットから抽出」または「追加質問をAI提案」で自動追加できます</div>
        </div>
      ) : items.map(q => (
        <div key={q.id} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 11, color: '#706E6B' }}>
            <span style={{ padding: '2px 8px', background: SOURCE_COLOR[q.source]?.bg || '#F3F2F2', color: SOURCE_COLOR[q.source]?.color || '#706E6B', borderRadius: 3, fontSize: 10 }}>
              {SOURCE_LABEL[q.source] || q.source || '—'}
            </span>
            <span>質問日: {q.asked_at ? new Date(q.asked_at).toLocaleDateString('ja-JP') : '—'}</span>
            <span>回答日: {q.answered_at ? new Date(q.answered_at).toLocaleDateString('ja-JP') : '—'}</span>
            <span style={{ marginLeft: 'auto', padding: '2px 8px', background: q.status === 'answered' ? '#E1F5EE' : '#FAF3E0', color: q.status === 'answered' ? '#2E844A' : '#A08040', borderRadius: 3, fontSize: 10 }}>
              {q.status === 'answered' ? '回答済' : '未回答'}
            </span>
            <button onClick={() => { setEditing(q.id); setEditForm({ question: q.question, answer: q.answer || '', status: q.status }) }}
              style={{ background: 'none', border: 'none', color: '#032D60', cursor: 'pointer', fontSize: 11 }}>
              編集
            </button>
            <button onClick={() => deleteQA(q)} style={{ background: 'none', border: 'none', color: '#EA001E', cursor: 'pointer', fontSize: 11 }}>削除</button>
          </div>

          {editing === q.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>質問</div>
                <textarea value={editForm.question} onChange={e => setEditForm(f => ({ ...f, question: e.target.value }))} rows={2} style={inp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>回答</div>
                <textarea value={editForm.answer} onChange={e => setEditForm(f => ({ ...f, answer: e.target.value }))} rows={3} style={inp} placeholder="回答を入力..." />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setEditing(null); setEditForm({}) }}
                  style={{ height: 32, padding: '0 14px', background: '#fff', color: '#706E6B', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, cursor: 'pointer' }}>
                  キャンセル
                </button>
                <button onClick={() => saveEdit(q)}
                  style={{ height: 32, padding: '0 14px', background: '#032D60', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, cursor: 'pointer' }}>
                  保存
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: 11, padding: '3px 8px', background: '#F8F8F8', color: '#032D60', borderRadius: 3, flexShrink: 0 }}>Q</span>
                <div style={{ fontSize: 13, color: '#032D60', lineHeight: 1.8, flex: 1 }}>{q.question}</div>
              </div>
              {q.answer ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', background: '#E1F5EE', color: '#2E844A', borderRadius: 3, flexShrink: 0 }}>A</span>
                  <div style={{ fontSize: 13, color: '#706E6B', lineHeight: 1.8, flex: 1, whiteSpace: 'pre-wrap' }}>{q.answer}</div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#706E6B', paddingLeft: 32 }}>回答待ち</div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
