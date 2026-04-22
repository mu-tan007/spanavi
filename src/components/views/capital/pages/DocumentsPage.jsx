import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/miniRouter'
import { useAuth } from '../hooks/useAuth'

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }

const CONTRACT_TYPE_STYLE = {
  nda: { bg: '#F8F8F8', color: '#032D60', label: 'NDA' },
  advisory: { bg: '#E1F5EE', color: '#2E844A', label: 'アドバイザリー契約' },
  loi: { bg: '#FAF3E0', color: '#A08040', label: 'LOI' },
  mou: { bg: '#f4f0f8', color: '#5a2a8a', label: 'MOU' },
  spa: { bg: '#032D60', color: '#fff', label: 'SPA' },
  other: { bg: '#F3F2F2', color: '#706E6B', label: 'その他' },
}
const FILE_TYPE_STYLE = {
  im: { bg: '#032D60', color: '#fff', label: 'IM' },
  financial: { bg: '#F8F8F8', color: '#032D60', label: '財務資料' },
  nda: { bg: '#E1F5EE', color: '#2E844A', label: 'NDA' },
  loi: { bg: '#FAF3E0', color: '#A08040', label: 'LOI' },
  spa: { bg: '#f4f0f8', color: '#5a2a8a', label: 'SPA' },
  other: { bg: '#F3F2F2', color: '#706E6B', label: 'その他' },
}
const TEMPLATE_CATEGORIES = [
  { value: 'nonname', label: 'ノンネームシート' },
  { value: 'im', label: '企業概要書（IM）' },
  { value: 'loi', label: '意向表明書（LOI）' },
  { value: 'valuation_report', label: 'バリュエーションレポート' },
  { value: 'dd_checklist', label: 'DDチェックリスト' },
  { value: 'investment_memo', label: '投資委員会資料' },
  { value: 'other', label: 'その他' },
]
const VARIABLES = [
  { key: '{{deal_name}}', label: '案件名' },
  { key: '{{seller_name}}', label: '売り手企業名' },
  { key: '{{industry}}', label: '業種' },
  { key: '{{ev_estimate}}', label: '想定EV' },
  { key: '{{revenue}}', label: '売上高' },
  { key: '{{ebitda}}', label: 'EBITDA' },
  { key: '{{employees}}', label: '従業員数' },
  { key: '{{hq_address}}', label: '所在地' },
  { key: '{{business_summary}}', label: '事業概要' },
  { key: '{{date_today}}', label: '本日の日付' },
  { key: '{{intermediary_name}}', label: '仲介会社名' },
  { key: '{{contact_name}}', label: '担当者名' },
]

export default function DocumentsPage() {
  const qc = useQueryClient()
  const { tenantId } = useAuth()
  const [tab, setTab] = useState('files')
  const [search, setSearch] = useState('')
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplCategory, setTplCategory] = useState('other')
  const [tplDesc, setTplDesc] = useState('')
  const [tplFile, setTplFile] = useState(null)
  const [showGenerate, setShowGenerate] = useState(null) // template obj
  const [selectedDeal, setSelectedDeal] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState('')

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ['all-files', search],
    queryFn: async () => {
      let q = supabase.from('cap_deal_files').select('*, deals(id, name)').order('uploaded_at', { ascending: false }).limit(100)
      if (search) q = q.ilike('file_name', `%${search}%`)
      const { data } = await q; return data || []
    },
  })
  const { data: contracts = [], isLoading: contractsLoading } = useQuery({
    queryKey: ['all-contracts'],
    queryFn: async () => {
      const { data } = await supabase.from('cap_deal_contracts').select('*, deals(id, name)').order('created_at', { ascending: false }).limit(100)
      return data || []
    },
  })
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data } = await supabase.from('cap_templates').select('*').order('created_at', { ascending: false })
      return data || []
    },
  })
  const { data: deals = [] } = useQuery({
    queryKey: ['deals-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('cap_deals').select('id, name').order('name')
      return data || []
    },
  })

  async function uploadTemplate(e) {
    e.preventDefault()
    if (!tplFile || !tplName.trim() || false) return
    setUploading(true)
    try {
      const safeName = tplFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `templates/masp/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('caesar-files').upload(path, tplFile)
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('cap_templates').insert({
                name: tplName.trim(),
        category: tplCategory,
        description: tplDesc,
        file_type: tplFile.name.split('.').pop().toLowerCase(),
        storage_path: path,
        file_size: tplFile.size,
      })
      if (dbErr) throw dbErr
      qc.invalidateQueries({ queryKey: ['templates'] })
      setShowUpload(false); setTplName(''); setTplDesc(''); setTplFile(null)
    } catch (err) {
      alert('アップロードエラー: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function downloadTemplate(tpl) {
    const { data } = await supabase.storage.from('caesar-files').download(tpl.storage_path)
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a'); a.href = url; a.download = `${tpl.name}.${tpl.file_type}`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  async function generateFromTemplate() {
    if (!showGenerate || !selectedDeal) return
    setGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('template-fill', {
        body: { template_id: showGenerate.id, deal_id: selectedDeal,  },
      })
      if (error) throw error
      setGeneratedContent(data.content || '生成に失敗しました')
    } catch (err) {
      alert('生成エラー: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  function copyContent() {
    navigator.clipboard.writeText(generatedContent)
    alert('クリップボードにコピーしました')
  }

  function downloadAsText() {
    const blob = new Blob([generatedContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${showGenerate?.name || 'output'}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  const isLoading = tab === 'files' ? filesLoading : tab === 'contracts' ? contractsLoading : templatesLoading

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: '#032D60' }}>書類管理</h1>
          <p style={{ fontSize: 12, color: '#706E6B', marginTop: 3 }}>
            {tab === 'files' ? `ファイル ${files.length}件` : tab === 'contracts' ? `契約書 ${contracts.length}件` : `テンプレート ${templates.length}件`}
          </p>
        </div>
        {tab === 'templates' && (
          <button onClick={() => setShowUpload(true)} style={{
            height: 36, padding: '0 16px', background: '#032D60', border: 'none',
            borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>+ テンプレート追加</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '0.5px solid #E5E5E5' }}>
        <div style={{ display: 'flex' }}>
          {[['files','ファイル一覧'],['contracts','契約書'],['templates','テンプレート']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '7px 16px', border: 'none', background: 'transparent', fontSize: 13,
              fontWeight: tab===k ? 500 : 400, color: tab===k ? '#032D60' : '#706E6B',
              borderBottom: tab===k ? '2px solid #032D60' : '2px solid transparent', cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>
        {tab === 'files' && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ファイル名で検索..."
            style={{ height: 32, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none', width: 200, marginBottom: 2 }} />
        )}
      </div>

      {/* Files tab */}
      {tab === 'files' && (
        <div style={card}>
          {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: '#706E6B', fontSize: 13 }}>読み込み中...</div>
          : files.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#706E6B', fontSize: 13 }}>{search ? '該当するファイルがありません' : 'ファイルがありません'}</div>
          : <>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 120px 100px', padding: '6px 12px', background: '#edf2fa', borderRadius: '6px 6px 0 0' }}>
              {['種別','ファイル名','案件','アップロード元','日付'].map(h => <div key={h} style={{ fontSize: 10, color: '#706E6B', fontWeight: 500 }}>{h}</div>)}
            </div>
            {files.map((f, i) => {
              const ts = FILE_TYPE_STYLE[f.file_type] || FILE_TYPE_STYLE.other
              return (
                <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 120px 100px', padding: '9px 12px', alignItems: 'center', borderTop: '0.5px solid #E5E5E5', background: i%2===0?'#fff':'#FAFAFA' }}>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: ts.bg, color: ts.color, display: 'inline-block' }}>{ts.label}</span>
                  <div style={{ fontSize: 12, color: '#032D60', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{f.file_name}</div>
                  <div style={{ fontSize: 11, color: '#706E6B' }}>{f.deals ? <Link to={`/deals/${f.deals.id}`} style={{ color: '#032D60' }}>{f.deals.name}</Link> : '—'}</div>
                  <div style={{ fontSize: 11, color: '#706E6B' }}>{f.uploaded_via === 'advisor_portal' ? '担当者' : f.uploaded_via === 'email' ? 'メール' : '内部'}</div>
                  <div style={{ fontSize: 11, color: '#706E6B' }}>{new Date(f.uploaded_at).toLocaleDateString('ja-JP')}</div>
                </div>
              )
            })}
          </>}
        </div>
      )}

      {/* Contracts tab */}
      {tab === 'contracts' && (
        <div style={card}>
          {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: '#706E6B', fontSize: 13 }}>読み込み中...</div>
          : contracts.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#706E6B', fontSize: 13 }}>契約書がありません</div>
          : <>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 160px 120px 100px', padding: '6px 12px', background: '#edf2fa', borderRadius: '6px 6px 0 0' }}>
              {['種別','案件','署名日','注意点','登録日'].map(h => <div key={h} style={{ fontSize: 10, color: '#706E6B', fontWeight: 500 }}>{h}</div>)}
            </div>
            {contracts.map((c, i) => {
              const ts = CONTRACT_TYPE_STYLE[c.contract_type] || CONTRACT_TYPE_STYLE.other
              const cautions = Array.isArray(c.caution_points) ? c.caution_points : []
              return (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 160px 120px 100px', padding: '9px 12px', alignItems: 'center', borderTop: '0.5px solid #E5E5E5', background: i%2===0?'#fff':'#FAFAFA' }}>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: ts.bg, color: ts.color, display: 'inline-block' }}>{ts.label}</span>
                  <div style={{ fontSize: 12, color: '#032D60', paddingRight: 12 }}>{c.deals ? <Link to={`/deals/${c.deals.id}`} style={{ color: '#032D60' }}>{c.deals.name}</Link> : '—'}</div>
                  <div style={{ fontSize: 11, color: '#706E6B' }}>{c.signed_at ? new Date(c.signed_at).toLocaleDateString('ja-JP') : '未署名'}</div>
                  <div style={{ fontSize: 11, color: cautions.length > 0 ? '#A08040' : '#706E6B' }}>{cautions.length > 0 ? `${cautions.length}件` : 'なし'}</div>
                  <div style={{ fontSize: 11, color: '#706E6B' }}>{new Date(c.created_at).toLocaleDateString('ja-JP')}</div>
                </div>
              )
            })}
          </>}
        </div>
      )}

      {/* Templates tab */}
      {tab === 'templates' && (
        <div>
          {/* 使い方ガイド */}
          {templates.length === 0 && !isLoading && (
            <div style={{ ...card, textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 15, color: '#032D60', fontWeight: 500, marginBottom: 8 }}>テンプレートを登録してください</div>
              <div style={{ fontSize: 12, color: '#706E6B', lineHeight: 1.8, marginBottom: 20 }}>
                自社のPPTX・PDFをアップロードすると、案件データを差し込んで資料を自動生成できます。<br/>
                ノンネームシート、IM、LOI、バリュエーションレポートなど、買収プロセスで必要な資料に対応しています。
              </div>
              <button onClick={() => setShowUpload(true)} style={{
                height: 40, padding: '0 24px', background: '#032D60', border: 'none',
                borderRadius: 6, color: '#FFFFFF', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}>+ テンプレートを追加</button>
            </div>
          )}

          {/* 差し込み変数リファレンス */}
          {templates.length === 0 && !isLoading && (
            <div style={{ ...card, marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#032D60', marginBottom: 12 }}>差し込み変数リファレンス</div>
              <div style={{ fontSize: 12, color: '#706E6B', marginBottom: 10 }}>
                テンプレート内に以下の変数を記載すると、案件データに自動で置き換わります。
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 16px' }}>
                {VARIABLES.map(v => (
                  <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <code style={{ fontSize: 11, background: '#F8F8F8', color: '#032D60', padding: '2px 6px', borderRadius: 3 }}>{v.key}</code>
                    <span style={{ fontSize: 11, color: '#706E6B' }}>{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* テンプレート一覧 */}
          {templates.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {templates.map(tpl => {
                const cat = TEMPLATE_CATEGORIES.find(c => c.value === tpl.category)
                return (
                  <div key={tpl.id} style={card}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#032D60', marginBottom: 4 }}>{tpl.name}</div>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#F8F8F8', color: '#032D60' }}>
                          {cat?.label || tpl.category}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: '#F3F2F2', color: '#706E6B', textTransform: 'uppercase' }}>
                        {tpl.file_type}
                      </span>
                    </div>
                    {tpl.description && <div style={{ fontSize: 12, color: '#706E6B', lineHeight: 1.6, marginBottom: 10 }}>{tpl.description}</div>}
                    <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 12 }}>
                      {new Date(tpl.created_at).toLocaleDateString('ja-JP')} 登録
                      {tpl.file_size && ` · ${(tpl.file_size / 1024).toFixed(0)} KB`}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setShowGenerate(tpl); setSelectedDeal(''); setGeneratedContent('') }} style={{
                        flex: 1, height: 32, background: '#032D60', border: 'none', borderRadius: 5,
                        color: '#FFFFFF', fontSize: 12, cursor: 'pointer', fontWeight: 500,
                      }}>案件で使う</button>
                      <button onClick={() => downloadTemplate(tpl)} style={{
                        height: 32, padding: '0 12px', background: '#F3F2F2', border: '0.5px solid #E5E5E5',
                        borderRadius: 5, color: '#706E6B', fontSize: 11, cursor: 'pointer',
                      }}>DL</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* テンプレートアップロードモーダル */}
      {showUpload && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowUpload(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 480 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#032D60', marginBottom: 20 }}>テンプレートを追加</h2>
            <form onSubmit={uploadTemplate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>テンプレート名 *</div>
                <input value={tplName} onChange={e => setTplName(e.target.value)} required placeholder="例：ノンネームシート_v1"
                  style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>カテゴリ</div>
                <select value={tplCategory} onChange={e => setTplCategory(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                  {TEMPLATE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>説明（任意）</div>
                <textarea value={tplDesc} onChange={e => setTplDesc(e.target.value)} rows={2} placeholder="使用用途やメモ"
                  style={{ width: '100%', padding: '8px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>ファイル *（pptx / pdf / docx）</div>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '1.5px dashed #E5E5E5', borderRadius: 8, padding: '20px 16px',
                    textAlign: 'center', cursor: 'pointer', background: '#FAFAFA',
                  }}>
                  {tplFile ? (
                    <div style={{ fontSize: 12, color: '#032D60' }}>{tplFile.name}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#706E6B' }}>クリックしてファイルを選択</div>
                  )}
                  <input ref={fileRef} type="file" accept=".pptx,.pdf,.docx,.xlsx" style={{ display: 'none' }}
                    onChange={e => setTplFile(e.target.files[0])} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowUpload(false)} style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>キャンセル</button>
                <button type="submit" disabled={uploading} style={{ flex: 1, height: 36, background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>{uploading ? 'アップロード中...' : '追加'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 資料生成モーダル */}
      {showGenerate && (
        <div onClick={e => { if (e.target === e.currentTarget) { setShowGenerate(null); setGeneratedContent('') } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 700, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#032D60', marginBottom: 4 }}>
              {showGenerate.name} — 資料生成
            </h2>
            <p style={{ fontSize: 12, color: '#706E6B', marginBottom: 16 }}>
              案件を選択すると、テンプレートに案件データを差し込んで資料を生成します。
            </p>

            {!generatedContent ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>案件を選択 *</div>
                  <select value={selectedDeal} onChange={e => setSelectedDeal(e.target.value)}
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                    <option value="">選択してください</option>
                    {deals.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowGenerate(null); setGeneratedContent('') }} style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>キャンセル</button>
                  <button onClick={generateFromTemplate} disabled={generating || !selectedDeal} style={{
                    flex: 1, height: 36, background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer',
                    opacity: !selectedDeal ? 0.4 : 1,
                  }}>{generating ? 'AI生成中...' : '生成する'}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 8, padding: 16, marginBottom: 16, maxHeight: 400, overflowY: 'auto' }}>
                  <pre style={{ fontSize: 13, color: '#032D60', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    {generatedContent}
                  </pre>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setGeneratedContent('')} style={{ height: 36, padding: '0 16px', background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>別の案件で再生成</button>
                  <button onClick={copyContent} style={{ height: 36, padding: '0 16px', background: '#F8F8F8', border: 'none', borderRadius: 6, fontSize: 13, color: '#032D60', cursor: 'pointer', fontWeight: 500 }}>コピー</button>
                  <button onClick={downloadAsText} style={{ height: 36, padding: '0 16px', background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Markdownでダウンロード</button>
                  <button onClick={() => { setShowGenerate(null); setGeneratedContent('') }} style={{ marginLeft: 'auto', height: 36, padding: '0 16px', background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>閉じる</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
