import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'
import { invokeFn, SessionExpiredError } from '../../lib/invokeFn'
import MarkdownBody from '../ui/MarkdownBody'
import { onEnterSubmit } from '../../lib/keyboard'
import Icon from '../ui/Icon'

const MODELS = [
  { value: 'claude-opus-4-6', label: 'Opus 4.6（高品質・推奨）' },
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4（高速）' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5（即答）' },
]

const FILE_TYPES = [
  { value: 'nonname',       label: 'ノンネーム' },
  { value: 'im',            label: '企業概要書（IM）' },
  { value: 'financial',     label: '財務資料' },
  { value: 'qa_answer',     label: 'Q&Aアンサー' },
  { value: 'meeting_notes', label: '議事録' },
  { value: 'supplementary', label: '追加資料' },
  { value: 'other',         label: 'その他' },
]

const FILE_TYPE_LABEL = Object.fromEntries(FILE_TYPES.map(t => [t.value, t.label]))

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function ChatTab({ dealId }) {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const fileRef = useRef()
  const scrollRef = useRef()
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState([]) // { name, mimeType, base64, file, fileType }
  const [sending, setSending] = useState(false)
  const [model, setModel] = useState('claude-opus-4-6')
  const [showFiles, setShowFiles] = useState(true)
  const [uploadingFiles, setUploadingFiles] = useState([]) // { name, status: 'uploading'|'done'|'error' }
  const [sessionExpired, setSessionExpired] = useState(false)

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['deal-chat', dealId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_deal_chat_messages')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true })
      return data || []
    },
  })

  // 案件に紐づく全ファイル (資料棚)
  const { data: files = [] } = useQuery({
    queryKey: ['deal-files', dealId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_deal_files')
        .select('*')
        .eq('deal_id', dealId)
        .order('uploaded_at', { ascending: false })
      return data || []
    },
  })

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  async function handleFileSelect(e) {
    const selected = Array.from(e.target.files || [])
    for (const file of selected) {
      if (file.size > 30 * 1024 * 1024) { alert(`${file.name} は30MBを超えています`); continue }
      const reader = new FileReader()
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = (ev) => resolve(ev.target.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setAttachments(prev => [...prev, { name: file.name, mimeType: file.type, base64, file, fileType: 'other' }])
    }
    e.target.value = ''
  }

  function removeAttachment(i) {
    setAttachments(prev => prev.filter((_, j) => j !== i))
  }

  function updateAttachmentType(i, fileType) {
    setAttachments(prev => prev.map((a, j) => j === i ? { ...a, fileType } : a))
  }

  // 1添付 → Storage upload + deal_files 登録 + 種別に応じた解析チェーン
  async function persistAttachment(att) {
    const safeName = att.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `deals/${dealId}/${Date.now()}_${safeName}`
    setUploadingFiles(prev => [...prev, { name: att.file.name, status: 'uploading' }])
    try {
      const { error: upErr } = await supabase.storage.from('caesar-files').upload(path, att.file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr
      // file_type から dd_category を自動決定
      const typeToCategory = {
        nonname: 'general', im: 'general', financial: 'financial',
        qa_answer: 'general', meeting_notes: 'general', supplementary: 'general',
        nda: 'contracts', loi: 'contracts', spa: 'contracts', other: 'general',
      }
      // ファイル名からバージョン推定
      const stem = att.file.name.replace(/\.[^.]+$/, '')
      const versionMatch = stem.match(/^(.+?)[\s_\-]*(v\d+|ver\d+|版\d+|改定\d*|第\d+版|final|ファイナル)$/i)
      const versionGroup = versionMatch ? versionMatch[1].trim().replace(/[\s_\-]+$/, '') : stem
      const versionLabel = versionMatch ? versionMatch[2] : null

      const { data: fileRec, error: dbErr } = await supabase.from('cap_deal_files').insert({
        deal_id: dealId,
        file_name: att.file.name,
        file_type: att.fileType || 'other',
        dd_category: typeToCategory[att.fileType || 'other'] || 'general',
        file_size: att.file.size,
        storage_path: path,
        uploaded_via: 'internal',
        version_group: versionGroup,
        version_label: versionLabel,
      }).select().single()
      if (dbErr) throw dbErr

      logAudit({ action: 'create', resourceType: 'file', resourceId: fileRec?.id, resourceName: att.file.name, metadata: { deal_id: dealId, file_type: att.fileType, via: 'chat' } })
      setUploadingFiles(prev => prev.map(u => u.name === att.file.name ? { ...u, status: 'analyzing' } : u))

      // IM / 財務資料 → 財務・SWOT・スコア抽出 (直列で順次実行して並行競合を避ける)
      if (fileRec && (att.fileType === 'im' || att.fileType === 'financial')) {
        try { await invokeFn('ai-analyze-file', { file_id: fileRec.id, deal_id: dealId }) } catch (e) { console.error('ai-analyze-file:', e) }
      }

      // IM → 案件詳細 / バリュエーション / Q&A 追加提案を直列で連鎖
      if (fileRec && att.fileType === 'im') {
        try { await invokeFn('deal-summary-generate', { deal_id: dealId }) } catch (e) { console.error('summary:', e) }
        try { await invokeFn('deal-valuation-auto', { deal_id: dealId }) } catch (e) { console.error('valuation:', e) }
        try { await invokeFn('deal-qa-sync', { deal_id: dealId, mode: 'suggest' }) } catch (e) { console.error('qa-sync:', e) }
      }

      // 財務資料 → バリュエーション再計算
      if (fileRec && att.fileType === 'financial') {
        try { await invokeFn('deal-valuation-auto', { deal_id: dealId }) } catch (e) { console.error('valuation-auto:', e) }
      }

      // Q&Aアンサー → 案件詳細を再生成
      if (fileRec && att.fileType === 'qa_answer') {
        try { await invokeFn('deal-qa-sync', { deal_id: dealId, mode: 'extract' }) } catch (e) { console.error('qa-extract:', e) }
        try { await invokeFn('deal-summary-generate', { deal_id: dealId }) } catch (e) { console.error('summary:', e) }
      }

      setUploadingFiles(prev => prev.map(u => u.name === att.file.name ? { ...u, status: 'done' } : u))
    } catch (err) {
      console.error('persistAttachment error:', err)
      setUploadingFiles(prev => prev.map(u => u.name === att.file.name ? { ...u, status: 'error' } : u))
    }
  }

  async function handleSend() {
    if (!message.trim() && attachments.length === 0) return
    if (false) return
    setSending(true)
    const sentMessage = message
    const sentAttachments = attachments
    setMessage(''); setAttachments([])

    // 添付を永続化 (Storage + deal_files + 連鎖AI解析) は裏で実行
    if (sentAttachments.length > 0) {
      Promise.all(sentAttachments.map(persistAttachment)).then(() => {
        // 関連する全クエリを無効化して各タブを強制再取得
        qc.invalidateQueries({ queryKey: ['deal-files', dealId] })
        qc.invalidateQueries({ queryKey: ['deal', dealId] })
        qc.invalidateQueries({ queryKey: ['deal-summary', dealId] })
        qc.invalidateQueries({ queryKey: ['deal-qa', dealId] })
        setTimeout(() => setUploadingFiles([]), 4000)
      })
    }

    try {
      await invokeFn('deal-chat', {
        deal_id: dealId,
        message: sentMessage, attachments: sentAttachments, model,
      })
      logAudit({ action: 'ai_call', resourceType: 'chat', resourceId: dealId, metadata: { model, attachments: sentAttachments.length } })
      qc.invalidateQueries({ queryKey: ['deal-chat', dealId] })
    } catch (err) {
      console.error('[ChatTab] send error:', err)
      if (err instanceof SessionExpiredError) {
        setSessionExpired(true)
        setMessage(sentMessage); setAttachments(sentAttachments)
      } else {
        alert('チャットエラー: ' + (err?.message || String(err)))
        setMessage(sentMessage); setAttachments(sentAttachments)
      }
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = onEnterSubmit(handleSend)

  async function clearChat() {
    if (!confirm('このチャット履歴を全て削除しますか？')) return
    await supabase.from('cap_deal_chat_messages').delete().eq('deal_id', dealId)
    logAudit({ action: 'delete', resourceType: 'chat', resourceId: dealId, metadata: { scope: 'all_messages' } })
    qc.invalidateQueries({ queryKey: ['deal-chat', dealId] })
  }

  async function deleteFile(f) {
    if (!confirm(`${f.file_name} を削除しますか？`)) return
    try {
      await supabase.storage.from('caesar-files').remove([f.storage_path])
      await supabase.from('cap_deal_files').delete().eq('id', f.id)
      logAudit({ action: 'delete', resourceType: 'file', resourceId: f.id, resourceName: f.file_name })
      qc.invalidateQueries({ queryKey: ['deal-files', dealId] })
    } catch (e) {
      alert('削除エラー: ' + e.message)
    }
  }

  async function downloadFile(f) {
    try {
      const { data, error } = await supabase.storage.from('caesar-files').createSignedUrl(f.storage_path, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank')
      logAudit({ action: 'view', resourceType: 'file', resourceId: f.id, resourceName: f.file_name })
    } catch (e) {
      alert('ダウンロードエラー: ' + e.message)
    }
  }

  // ドラッグ&ドロップ受付
  function onDragOver(e) { e.preventDefault() }
  async function onDrop(e) {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files || [])
    for (const file of dropped) {
      if (file.size > 30 * 1024 * 1024) { alert(`${file.name} は30MBを超えています`); continue }
      const reader = new FileReader()
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = (ev) => resolve(ev.target.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setAttachments(prev => [...prev, { name: file.name, mimeType: file.type, base64, file, fileType: 'other' }])
    }
  }

  return (
    <div onDragOver={onDragOver} onDrop={onDrop}
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)', minHeight: 500, background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid #E5E5E5', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: '#706E6B' }}>
          AIアシスタント — この案件の情報を踏まえて質問・ファイル解析ができます
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={model} onChange={e => setModel(e.target.value)} style={{
            height: 28, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 11, outline: 'none',
          }}>
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {messages.length > 0 && (
            <button onClick={clearChat} style={{
              height: 28, padding: '0 10px', background: '#fff', border: '0.5px solid #e0c0c0',
              borderRadius: 5, fontSize: 11, color: '#EA001E', cursor: 'pointer',
            }}>履歴削除</button>
          )}
        </div>
      </div>

      {sessionExpired && (
        <div style={{ padding: '10px 16px', background: '#FAECE7', border: '0.5px solid #e0c0c0', borderBottom: '0.5px solid #e0c0c0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#EA001E' }}>
            ⚠ セッションが切れています。入力内容は保持されています。再ログイン後、送信ボタンをもう一度押してください。
          </div>
          <button onClick={() => { window.location.href = '/login' }}
            style={{ height: 28, padding: '0 14px', background: '#EA001E', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            再ログイン
          </button>
        </div>
      )}

      {/* 案件ファイル (資料棚) — collapsible */}
      <div style={{ borderBottom: '0.5px solid #E5E5E5', background: '#FAFAFA' }}>
        <button onClick={() => setShowFiles(s => !s)}
          style={{ width: '100%', padding: '8px 16px', background: 'transparent', border: 'none',
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#706E6B', fontSize: 11,
          }}>
          <span style={{ transform: showFiles ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
          <span>案件ファイル ({files.length})</span>
          <span style={{ fontSize: 10, color: '#706E6B', marginLeft: 8 }}>
            IM/財務資料は自動解析されます
          </span>
        </button>
        {showFiles && (
          <div style={{ padding: '4px 16px 10px', maxHeight: 160, overflowY: 'auto' }}>
            {files.length === 0 ? (
              <div style={{ fontSize: 11, color: '#706E6B', padding: '6px 0' }}>まだファイルはありません。下のクリップアイコンからアップロードするか、ドロップしてください。</div>
            ) : files.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '0.5px solid #f0f2f5' }}>
                <span style={{ fontSize: 10, padding: '2px 6px', background: '#F8F8F8', color: '#032D60', borderRadius: 3, flexShrink: 0 }}>
                  {FILE_TYPE_LABEL[f.file_type] || f.file_type || 'その他'}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: '#032D60', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                  onClick={() => downloadFile(f)} title="クリックでダウンロード">
                  {f.file_name}
                </span>
                {f.parsed_data && Object.keys(f.parsed_data).length > 0 && (
                  <span style={{ fontSize: 10, color: '#2E844A', flexShrink: 0 }}>解析済</span>
                )}
                <span style={{ fontSize: 10, color: '#706E6B', flexShrink: 0 }}>
                  {new Date(f.uploaded_at).toLocaleDateString('ja-JP')}
                </span>
                <button onClick={() => deleteFile(f)}
                  style={{ background: 'none', border: 'none', color: '#EA001E', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))}
            {uploadingFiles.map((u, i) => (
              <div key={`up-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11, color: u.status === 'error' ? '#EA001E' : '#032D60' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.status === 'done' ? '#2E844A' : u.status === 'error' ? '#EA001E' : '#032D60' }} />
                {u.name} — {u.status === 'done' ? '解析・反映完了 (案件詳細/財務/バリュエーション/QA を更新)' : u.status === 'error' ? 'エラー' : u.status === 'analyzing' ? 'AI解析中' : 'アップロード中'}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', color: '#706E6B', fontSize: 12, padding: 40 }}>読み込み中...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#706E6B', padding: '60px 24px' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>この案件についてAIに質問できます</div>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              例: 「この財務データから、買収価格の妥当性を評価して」<br/>
              「DDで重点的に確認すべき項目を10個提案して」<br/>
              「IM・財務資料をアップロードすると、財務データ/SWOT/スコアを自動抽出します」
            </div>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} style={{
              display: 'flex', marginBottom: 14,
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: m.role === 'user' ? '78%' : '92%', padding: '12px 16px', borderRadius: 12,
                background: m.role === 'user' ? '#032D60' : '#f0f6ff',
                color: m.role === 'user' ? '#181818' : '#FFFFFF',
                fontSize: 13, lineHeight: 1.7,
              }}>
                {m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0 && (
                  <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {m.attachments.map((a, i) => (
                      <span key={i} style={{ fontSize: 10, padding: '2px 6px', background: m.role === 'user' ? 'rgba(255,255,255,0.15)' : '#F8F8F8', color: m.role === 'user' ? '#181818' : '#032D60', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="paperclip" size={10} /> {a.name}
                      </span>
                    ))}
                  </div>
                )}
                {m.role === 'assistant'
                  ? <MarkdownBody compact>{m.content}</MarkdownBody>
                  : <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>}
                {m.role === 'assistant' && m.model && (
                  <div style={{ fontSize: 9, color: '#706E6B', marginTop: 6 }}>{m.model}</div>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 14 }}>
            <div style={{ padding: '10px 14px', borderRadius: 12, background: '#f0f6ff', color: '#706E6B', fontSize: 13 }}>
              <span style={{ display: 'inline-block', animation: 'pulse 1s infinite' }}>● ● ●</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ borderTop: '0.5px solid #E5E5E5', padding: 12, background: '#FAFAFA' }}>
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {attachments.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 5, padding: '5px 8px', fontSize: 11 }}>
                <span style={{ color: '#706E6B', display: 'flex', alignItems: 'center' }}><Icon name="paperclip" size={12} /></span>
                <span style={{ color: '#032D60', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <select value={a.fileType} onChange={e => updateAttachmentType(i, e.target.value)}
                  style={{ height: 22, padding: '0 6px', border: '0.5px solid #E5E5E5', borderRadius: 4, fontSize: 10, outline: 'none', background: '#fff' }}>
                  {FILE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button onClick={() => removeAttachment(i)} style={{ background: 'none', border: 'none', color: '#EA001E', cursor: 'pointer', fontSize: 13 }}>×</button>
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#706E6B', paddingLeft: 4 }}>
              種別を選択: IM / 財務資料 は送信後に自動で財務データ・SWOT・スコアを抽出します
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button onClick={() => fileRef.current?.click()} title="ファイルを添付 (最大30MB / PDF・画像)" style={{
            width: 36, height: 36, background: '#fff', border: '0.5px solid #E5E5E5',
            borderRadius: 6, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#706E6B',
          }}>
            <Icon name="paperclip" size={16} />
          </button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={handleFileSelect} />
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="質問を入力... (Enterで送信 / Shift+Enter で改行 / ドラッグ&ドロップでファイル添付)"
            rows={2}
            style={{
              flex: 1, padding: '8px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6,
              fontSize: 13, outline: 'none', resize: 'none', lineHeight: 1.6,
              fontFamily: 'inherit',
            }}
          />
          <button onClick={handleSend} disabled={sending || (!message.trim() && attachments.length === 0)} style={{
            height: 36, padding: '0 18px', background: sending ? '#706E6B' : '#032D60', border: 'none',
            borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            opacity: (!message.trim() && attachments.length === 0) ? 0.4 : 1,
            flexShrink: 0,
          }}>送信</button>
        </div>
      </div>
    </div>
  )
}
