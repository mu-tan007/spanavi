import { useState, useCallback, useRef } from 'react'
import { useNavigate } from '../lib/miniRouter'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAudit } from '../lib/audit'

const STATUS_LABELS = {
  nn_review: 'NN精査', im_review: 'IM精査', top_meeting: 'トップ面談',
  loi_prep: 'LOI準備', dd: 'DD実施', spa_negotiation: 'SPA・最終交渉',
}
const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' }

export default function IntakePage() {
  const navigate = useNavigate()
  const { user, tenantId } = useAuth()
  const fileRef = useRef()
  const [tab, setTab] = useState('file') // file | text
  const [files, setFiles] = useState([])
  const [text, setText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [editedDeal, setEditedDeal] = useState(null)
  const [editedIntermediary, setEditedIntermediary] = useState(null)
  const [editedContact, setEditedContact] = useState(null)
  const [step, setStep] = useState('input') // input | confirm | done
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [registerDeal, setRegisterDeal] = useState(true)
  const [registerFirm, setRegisterFirm] = useState(true)
  const [registerContact, setRegisterContact] = useState(true)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    setFiles(prev => [...prev, ...dropped])
  }, [])

  async function analyze() {
    setAnalyzing(true)
    try {
      let fileBase64 = null
      let mimeType = null

      if (files.length > 0) {
        const file = files[0]
        mimeType = file.type
        const reader = new FileReader()
        fileBase64 = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }

      const { data, error } = await supabase.functions.invoke('intake-analyze', {
        body: { text, fileBase64, mimeType },
      })

      if (error) throw error
      const ext = data.extracted
      setExtracted(ext)
      setEditedDeal(ext.deal || {})
      setEditedIntermediary(ext.intermediary || {})
      setEditedContact(ext.contact || {})
      setRegisterDeal(!!(ext.deal?.name))
      setRegisterFirm(!!(ext.intermediary?.name))
      setRegisterContact(!!(ext.contact?.name))
      setStep('confirm')
    } catch (err) {
      alert('解析エラー: ' + err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      let firmId = null
      let contactId = null

      // 仲介会社登録
      if (registerFirm && editedIntermediary?.name) {
        const { data: existing } = await supabase
          .from('cap_intermediaries')
          .select('id')
          
          .ilike('name', editedIntermediary.name)
          .maybeSingle()

        if (existing) {
          firmId = existing.id
        } else {
          const { data: newFirm, error } = await supabase
            .from('cap_intermediaries')
            .insert({
                            name: editedIntermediary.name,
              type: editedIntermediary.type || 'intermediary',
              website: editedIntermediary.website,
            })
            .select('id')
            .single()
          if (error) throw error
          firmId = newFirm.id
        }
      }

      // 担当者登録
      if (registerContact && editedContact?.name && firmId) {
        const { data: existing } = await supabase
          .from('cap_contacts')
          .select('id')
          
          .ilike('name', editedContact.name)
          .maybeSingle()

        if (existing) {
          contactId = existing.id
        } else {
          const { data: newContact, error } = await supabase
            .from('cap_contacts')
            .insert({
                            intermediary_id: firmId,
              name: editedContact.name,
              email: editedContact.email,
              phone: editedContact.phone,
              title: editedContact.title,
            })
            .select('id')
            .single()
          if (error) throw error
          contactId = newContact.id
        }
      }

      // 案件登録
      let dealId = null
      if (registerDeal && editedDeal?.name) {
        const evMid = editedDeal.ev_min && editedDeal.ev_max
          ? Math.round((Number(editedDeal.ev_min) + Number(editedDeal.ev_max)) / 2)
          : Number(editedDeal.ev_min) || Number(editedDeal.ev_max) || null

        const { data: newDeal, error } = await supabase
          .from('cap_deals')
          .insert({
                        name: editedDeal.name,
            industry_label: editedDeal.industry,
            ev_estimate: evMid ? evMid * 1000 : null,
            status: editedDeal.status || 'nn_review',
            priority: editedDeal.priority === 'high' ? 1 : editedDeal.priority === 'low' ? 3 : 2,
            source_type: firmId ? 'intermediary' : 'self',
            intermediary_id: firmId,
            contact_id: contactId,
          })
          .select('id')
          .single()
        if (error) throw error
        dealId = newDeal.id
        logAudit({ action: 'create', resourceType: 'deal', resourceId: dealId, resourceName: editedDeal.name, metadata: { via: 'intake' } })

        // deal_companies にも登録
        if (editedDeal.company_name || editedDeal.description || editedDeal.location) {
          await supabase.from('cap_deal_companies').insert({
            deal_id: dealId,
            seller_name: editedDeal.company_name,
            hq_address: editedDeal.location,
            business_summary: editedDeal.description,
            employees: editedDeal.employees ? Number(editedDeal.employees) : null,
            founded_year: editedDeal.founded_year ? Number(editedDeal.founded_year) : null,
          })
        }
      }

      setResult({ dealId, firmId, contactId })
      setStep('done')
    } catch (err) {
      alert('登録エラー: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const card = {
    background: '#ffffff',
    border: '0.5px solid #E5E5E5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  }

  const input = {
    width: '100%',
    height: 36,
    border: '0.5px solid #E5E5E5',
    borderRadius: 6,
    padding: '0 12px',
    fontSize: 13,
    color: '#032D60',
    background: '#FAFAFA',
    outline: 'none',
  }

  const labelStyle = {
    fontSize: 11,
    color: '#706E6B',
    marginBottom: 4,
    display: 'block',
  }

  const fieldEl = (l, val, key, obj, setter, type = 'text') => (
    <div style={{ marginBottom: 12 }}>
      <span style={labelStyle}>{l}</span>
      <input
        type={type}
        value={val || ''}
        onChange={e => setter({ ...obj, [key]: e.target.value })}
        style={input}
      />
    </div>
  )

  const selectField = (l, val, key, obj, setter, options) => (
    <div style={{ marginBottom: 12 }}>
      <span style={labelStyle}>{l}</span>
      <select
        value={val || ''}
        onChange={e => setter({ ...obj, [key]: e.target.value })}
        style={{ ...input, height: 36 }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )

  return (
    <div style={{ padding: '20px 24px', maxWidth: 840, margin: '0 auto' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: '#032D60', marginBottom: 4 }}>
          Quick Intake
        </h1>
        <p style={{ fontSize: 12, color: '#706E6B' }}>
          ファイル・メール本文・テキストから案件・仲介会社・担当者を自動登録します
        </p>
      </div>

      {/* Step 1: 入力 */}
      {step === 'input' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[['file', 'ファイル・画像'], ['text', 'テキスト貼り付け']].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                border: tab === t ? 'none' : '0.5px solid #E5E5E5',
                background: tab === t ? '#032D60' : 'transparent',
                color: tab === t ? '#FFFFFF' : '#706E6B',
              }}>{l}</button>
            ))}
          </div>

          {tab === 'file' && (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#032D60' : '#E5E5E5'}`,
                borderRadius: 12, padding: '48px 24px',
                textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#f0f6ff' : '#FAFAFA',
                marginBottom: 16, transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 13, color: '#706E6B', marginBottom: 8 }}>
                ノンネームシート・IM・メールのスクリーンショット・PDFをドロップ
              </div>
              <div style={{ fontSize: 11, color: '#706E6B' }}>
                対応形式: PDF / PNG / JPG / JPEG
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: 'none' }} multiple
                onChange={e => setFiles(Array.from(e.target.files))} />
            </div>
          )}

          {files.length > 0 && (
            <div style={{ ...card, padding: 12, marginBottom: 16 }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 12, color: '#032D60' }}>{f.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ fontSize: 11, color: '#F0B4B4', background: 'none', border: 'none', cursor: 'pointer' }}>
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'text' && (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="メール本文・ノンネームシートの内容・案件情報などを貼り付けてください..."
              style={{
                width: '100%', minHeight: 200, border: '0.5px solid #E5E5E5',
                borderRadius: 8, padding: 14, fontSize: 13, color: '#032D60',
                background: '#FAFAFA', outline: 'none', resize: 'vertical',
                marginBottom: 16, lineHeight: 1.7,
              }}
            />
          )}

          <button
            onClick={analyze}
            disabled={analyzing || (files.length === 0 && !text.trim())}
            style={{
              width: '100%', height: 44, background: '#FFFFFF',
              border: 'none', borderRadius: 8, color: '#181818',
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
              opacity: (files.length === 0 && !text.trim()) ? 0.4 : 1,
            }}
          >
            {analyzing ? 'AI解析中...' : 'AIで解析する'}
          </button>
        </>
      )}

      {/* Step 2: 確認 */}
      {step === 'confirm' && extracted && (
        <>
          <div style={{
            background: '#E1F5EE', border: '0.5px solid #a8d4b0',
            borderRadius: 8, padding: '10px 16px', marginBottom: 20,
            fontSize: 12, color: '#2E844A',
          }}>
            AIが解析しました。内容を確認・修正してから登録してください。
            信頼度: {Math.round((extracted.confidence || 0) * 100)}%
          </div>

          {/* 案件 */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#032D60' }}>案件</span>
                {!editedDeal?.name && (
                  <span style={{ fontSize: 10, background: '#fce8e8', color: '#EA001E', padding: '2px 8px', borderRadius: 10 }}>未検出</span>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={registerDeal} onChange={e => setRegisterDeal(e.target.checked)} />
                <span style={{ fontSize: 12, color: '#706E6B' }}>登録する</span>
              </label>
            </div>
            {registerDeal && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                {fieldEl('案件名 *', editedDeal?.name, 'name', editedDeal, setEditedDeal)}
                {fieldEl('売り手企業名', editedDeal?.company_name, 'company_name', editedDeal, setEditedDeal)}
                {fieldEl('業種', editedDeal?.industry, 'industry', editedDeal, setEditedDeal)}
                {fieldEl('所在地', editedDeal?.location, 'location', editedDeal, setEditedDeal)}
                {fieldEl('EV下限（千円）', editedDeal?.ev_min, 'ev_min', editedDeal, setEditedDeal, 'number')}
                {fieldEl('EV上限（千円）', editedDeal?.ev_max, 'ev_max', editedDeal, setEditedDeal, 'number')}
                {fieldEl('売上高（千円）', editedDeal?.revenue, 'revenue', editedDeal, setEditedDeal, 'number')}
                {fieldEl('EBITDA（千円）', editedDeal?.ebitda, 'ebitda', editedDeal, setEditedDeal, 'number')}
                {selectField('ステータス', editedDeal?.status, 'status', editedDeal, setEditedDeal,
                  Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })))}
                {selectField('優先度', editedDeal?.priority, 'priority', editedDeal, setEditedDeal,
                  Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l })))}
                <div style={{ gridColumn: '1/-1', marginBottom: 12 }}>
                  <span style={labelStyle}>事業概要</span>
                  <textarea value={editedDeal?.description || ''} rows={3}
                    onChange={e => setEditedDeal({ ...editedDeal, description: e.target.value })}
                    style={{ ...input, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
                </div>
              </div>
            )}
          </div>

          {/* 仲介会社 */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#032D60' }}>仲介会社・FA</span>
                {!editedIntermediary?.name && (
                  <span style={{ fontSize: 10, background: '#fce8e8', color: '#EA001E', padding: '2px 8px', borderRadius: 10 }}>未検出</span>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={registerFirm} onChange={e => setRegisterFirm(e.target.checked)} />
                <span style={{ fontSize: 12, color: '#706E6B' }}>登録する</span>
              </label>
            </div>
            {registerFirm && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                {fieldEl('会社名 *', editedIntermediary?.name, 'name', editedIntermediary, setEditedIntermediary)}
                {selectField('種別', editedIntermediary?.type, 'type', editedIntermediary, setEditedIntermediary,
                  [{ value: 'intermediary', label: 'M&A仲介' }, { value: 'fa', label: 'FA' }])}
                {fieldEl('電話番号', editedIntermediary?.phone, 'phone', editedIntermediary, setEditedIntermediary)}
                {fieldEl('ウェブサイト', editedIntermediary?.website, 'website', editedIntermediary, setEditedIntermediary)}
              </div>
            )}
          </div>

          {/* 担当者 */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#032D60' }}>担当者</span>
                {!editedContact?.name && (
                  <span style={{ fontSize: 10, background: '#fce8e8', color: '#EA001E', padding: '2px 8px', borderRadius: 10 }}>未検出</span>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={registerContact} onChange={e => setRegisterContact(e.target.checked)} />
                <span style={{ fontSize: 12, color: '#706E6B' }}>登録する</span>
              </label>
            </div>
            {registerContact && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                {fieldEl('氏名 *', editedContact?.name, 'name', editedContact, setEditedContact)}
                {fieldEl('役職', editedContact?.title, 'title', editedContact, setEditedContact)}
                {fieldEl('メール', editedContact?.email, 'email', editedContact, setEditedContact)}
                {fieldEl('電話番号', editedContact?.phone, 'phone', editedContact, setEditedContact)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('input')} style={{
              flex: 1, height: 44, background: 'transparent',
              border: '0.5px solid #E5E5E5', borderRadius: 8,
              color: '#706E6B', fontSize: 13, cursor: 'pointer',
            }}>戻る</button>
            <button onClick={save} disabled={saving} style={{
              flex: 2, height: 44, background: '#FFFFFF',
              border: 'none', borderRadius: 8, color: '#181818',
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}>{saving ? '登録中...' : 'この内容で登録する'}</button>
          </div>
        </>
      )}

      {/* Step 3: 完了 */}
      {step === 'done' && result && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#E1F5EE', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a6a3a" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#032D60', marginBottom: 8 }}>登録完了</div>
          <div style={{ fontSize: 13, color: '#706E6B', marginBottom: 32, lineHeight: 1.8 }}>
            {result.dealId && '案件を登録しました。'}
            {result.firmId && ' 仲介会社を登録しました。'}
            {result.contactId && ' 担当者を登録しました。'}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {result.dealId && (
              <button onClick={() => navigate(`/deals/${result.dealId}`)} style={{
                padding: '10px 24px', background: '#FFFFFF', border: 'none',
                borderRadius: 8, color: '#181818', fontSize: 13, cursor: 'pointer',
              }}>案件を開く</button>
            )}
            <button onClick={() => { setStep('input'); setFiles([]); setText(''); setExtracted(null) }} style={{
              padding: '10px 24px', background: 'transparent',
              border: '0.5px solid #E5E5E5', borderRadius: 8,
              color: '#706E6B', fontSize: 13, cursor: 'pointer',
            }}>続けて登録</button>
            <button onClick={() => navigate('/dashboard')} style={{
              padding: '10px 24px', background: 'transparent',
              border: '0.5px solid #E5E5E5', borderRadius: 8,
              color: '#706E6B', fontSize: 13, cursor: 'pointer',
            }}>ダッシュボードへ</button>
          </div>
        </div>
      )}
    </div>
  )
}
