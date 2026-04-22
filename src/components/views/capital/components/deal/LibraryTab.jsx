import { useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'
import Icon from '../ui/Icon'

// PE 仕様のライブラリ: DDカテゴリ分類 + バージョン管理 + スター + プレビュー
const CATEGORIES = [
  { key: 'all',        label: 'すべて',       icon: 'folder',      tone: '#032D60' },
  { key: 'starred',    label: '重要',         icon: 'star',        tone: '#C8A84B' },
  { key: 'recent',     label: '直近7日',       icon: 'clock',       tone: '#032D60' },
  { key: 'commercial', label: '商業DD',        icon: 'trending-up', tone: '#032D60' },
  { key: 'financial',  label: '財務DD',        icon: 'yen',         tone: '#2E844A' },
  { key: 'legal',      label: '法務DD',        icon: 'scales',      tone: '#6830a0' },
  { key: 'hr',         label: '人事DD',        icon: 'users',       tone: '#a06020' },
  { key: 'it_ops',     label: 'IT/オペDD',     icon: 'server',      tone: '#032D60' },
  { key: 'tax',        label: '税務DD',        icon: 'receipt',     tone: '#806020' },
  { key: 'esg',        label: 'ESG',          icon: 'leaf',        tone: '#2E844A' },
  { key: 'contracts',  label: '契約書',         icon: 'scroll',      tone: '#032D60' },
  { key: 'general',    label: '概要・IM系',     icon: 'document',    tone: '#706E6B' },
]

// file_type → dd_category 自動マッピング (dd_categoryが未設定の場合のフォールバック)
const TYPE_TO_CATEGORY = {
  nonname: 'general', im: 'general', financial: 'financial',
  qa_answer: 'general', meeting_notes: 'general', supplementary: 'general',
  nda: 'contracts', loi: 'contracts', spa: 'contracts', other: 'general',
}

const FILE_TYPE_LABEL = {
  nonname: 'ノンネーム', im: 'IM', financial: '財務',
  qa_answer: 'QAアンサー', meeting_notes: '議事録', supplementary: '追加資料',
  nda: 'NDA', loi: 'LOI', spa: 'SPA', other: 'その他',
}

function iconFor(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return { name: 'file-pdf', color: '#a03020' }
  if (['xlsx', 'xls', 'csv'].includes(ext)) return { name: 'file-xls', color: '#2E844A' }
  if (['docx', 'doc'].includes(ext)) return { name: 'file-doc', color: '#032D60' }
  if (['pptx', 'ppt'].includes(ext)) return { name: 'file-ppt', color: '#a03020' }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return { name: 'image', color: '#6830a0' }
  return { name: 'file', color: '#706E6B' }
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = (now - d) / (1000 * 60 * 60 * 24)
  if (diff < 1) return '今日'
  if (diff < 2) return '昨日'
  if (diff < 7) return `${Math.floor(diff)}日前`
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

// ファイル名からバージョン推定 (v1, v2, final, 改定 等)
function extractVersionGroup(fileName) {
  if (!fileName) return { base: fileName, version: null }
  const stem = fileName.replace(/\.[^.]+$/, '') // 拡張子除去
  // v1, v2, ver2, 改定1, 第2版, final, ファイナル パターン
  const m = stem.match(/^(.+?)[\s_\-]*(v\d+|ver\d+|版\d+|改定\d*|第\d+版|final|ファイナル)$/i)
  if (m) return { base: m[1].trim().replace(/[\s_\-]+$/, ''), version: m[2] }
  return { base: stem, version: null }
}

export default function LibraryTab({ dealId }) {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const fileRef = useRef()
  const [activeCategory, setActiveCat] = useState('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('grid') // 'grid' | 'list'
  const [selected, setSelected] = useState(null) // file object for detail drawer
  const [uploading, setUploading] = useState(false)
  const [pendingType, setPendingType] = useState('other')
  const [pendingCat, setPendingCat] = useState('general')

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['deal-files', dealId],
    queryFn: async () => {
      const { data } = await supabase.from('cap_deal_files').select('*').eq('deal_id', dealId).order('uploaded_at', { ascending: false })
      return data || []
    },
  })

  // バージョングループ化
  const groupedByVersion = useMemo(() => {
    const groups = new Map() // base -> [files sorted by uploaded_at desc]
    files.forEach(f => {
      const groupKey = f.version_group || extractVersionGroup(f.file_name).base
      if (!groups.has(groupKey)) groups.set(groupKey, [])
      groups.get(groupKey).push(f)
    })
    // 各グループ内でソート
    groups.forEach((arr, key) => {
      arr.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
    })
    return groups
  }, [files])

  // カテゴリ別カウント
  const counts = useMemo(() => {
    const c = { all: files.length, starred: 0, recent: 0 }
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    files.forEach(f => {
      if (f.starred) c.starred = (c.starred || 0) + 1
      if (new Date(f.uploaded_at).getTime() > weekAgo) c.recent = (c.recent || 0) + 1
      const cat = f.dd_category || TYPE_TO_CATEGORY[f.file_type] || 'general'
      c[cat] = (c[cat] || 0) + 1
    })
    return c
  }, [files])

  // フィルタ適用
  const filtered = useMemo(() => {
    let list = files
    if (activeCategory === 'starred') list = list.filter(f => f.starred)
    else if (activeCategory === 'recent') {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      list = list.filter(f => new Date(f.uploaded_at).getTime() > weekAgo)
    }
    else if (activeCategory !== 'all') {
      list = list.filter(f => (f.dd_category || TYPE_TO_CATEGORY[f.file_type] || 'general') === activeCategory)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(f => (f.file_name || '').toLowerCase().includes(q))
    }
    return list
  }, [files, activeCategory, search])

  // 表示用: グループごとの最新版を代表にしたリスト + スターは個別表示
  const displayList = useMemo(() => {
    const seen = new Set()
    const result = []
    filtered.forEach(f => {
      const groupKey = f.version_group || extractVersionGroup(f.file_name).base
      if (seen.has(groupKey)) return
      seen.add(groupKey)
      const group = groupedByVersion.get(groupKey) || [f]
      result.push({ representative: f, versions: group })
    })
    return result
  }, [filtered, groupedByVersion])

  async function handleUpload(e) {
    const list = Array.from(e.target.files || [])
    if (!list.length || false) return
    setUploading(true)
    try {
      for (const file of list) {
        if (file.size > 30 * 1024 * 1024) { alert(`${file.name} は30MBを超えています`); continue }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `deals/${dealId}/${Date.now()}_${safeName}`
        const { error: upErr } = await supabase.storage.from('caesar-files').upload(path, file, { cacheControl: '3600', upsert: false })
        if (upErr) { alert('アップロード失敗: ' + upErr.message); continue }
        const { version, base } = { version: extractVersionGroup(file.name).version, base: extractVersionGroup(file.name).base }
        const { data: fileRec } = await supabase.from('cap_deal_files').insert({
          deal_id: dealId,
          file_name: file.name,
          file_type: pendingType,
          dd_category: pendingCat,
          file_size: file.size,
          storage_path: path,
          uploaded_via: 'internal',
          version_group: base,
          version_label: version,
        }).select().single()
        logAudit({ action: 'create', resourceType: 'file', resourceId: fileRec?.id, resourceName: file.name, metadata: { via: 'library', dd_category: pendingCat } })
      }
      qc.invalidateQueries({ queryKey: ['deal-files', dealId] })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function toggleStar(f) {
    await supabase.from('cap_deal_files').update({ starred: !f.starred }).eq('id', f.id)
    qc.invalidateQueries({ queryKey: ['deal-files', dealId] })
  }

  async function updateCategory(f, cat) {
    await supabase.from('cap_deal_files').update({ dd_category: cat }).eq('id', f.id)
    qc.invalidateQueries({ queryKey: ['deal-files', dealId] })
  }

  async function download(f) {
    try {
      const { data, error } = await supabase.storage.from('caesar-files').createSignedUrl(f.storage_path, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank')
      logAudit({ action: 'view', resourceType: 'file', resourceId: f.id, resourceName: f.file_name, metadata: { via: 'library' } })
    } catch (e) { alert('DLエラー: ' + e.message) }
  }

  async function deleteFile(f) {
    if (!confirm(`${f.file_name} を削除しますか？`)) return
    await supabase.storage.from('caesar-files').remove([f.storage_path])
    await supabase.from('cap_deal_files').delete().eq('id', f.id)
    logAudit({ action: 'delete', resourceType: 'file', resourceId: f.id, resourceName: f.file_name })
    qc.invalidateQueries({ queryKey: ['deal-files', dealId] })
    if (selected?.id === f.id) setSelected(null)
  }

  async function openPreview(f) {
    setSelected(f)
    try {
      const { data } = await supabase.storage.from('caesar-files').createSignedUrl(f.storage_path, 300)
      setSelected(s => s && s.id === f.id ? { ...s, _previewUrl: data?.signedUrl } : s)
      logAudit({ action: 'view', resourceType: 'file', resourceId: f.id, resourceName: f.file_name, metadata: { via: 'library_preview' } })
    } catch (e) { console.error(e) }
  }

  const btnSmall = { height: 26, padding: '0 10px', fontSize: 11, border: '0.5px solid #E5E5E5', borderRadius: 5, background: '#fff', cursor: 'pointer' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '200px 1fr 360px' : '200px 1fr', gap: 14, height: 'calc(100vh - 280px)', minHeight: 560 }}>

      {/* 左サイドバー: カテゴリ */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: '10px 0', overflowY: 'auto' }}>
        {CATEGORIES.map((c, i) => {
          const count = counts[c.key] || 0
          const active = activeCategory === c.key
          return (
            <div key={c.key}>
              {(i === 3 || i === 10 || i === 11) && <div style={{ height: 0.5, background: '#E5E5E5', margin: '6px 14px' }} />}
              <div onClick={() => setActiveCat(c.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 12,
                  color: active ? '#032D60' : '#706E6B',
                  background: active ? '#FAFAFA' : 'transparent',
                  fontWeight: active ? 500 : 400,
                  borderLeft: active ? `3px solid ${c.tone}` : '3px solid transparent',
                }}>
                <Icon name={c.icon} size={15} color={active ? c.tone : '#706E6B'} />
                <span style={{ flex: 1 }}>{c.label}</span>
                {count > 0 && <span style={{ fontSize: 10, color: active ? '#032D60' : '#A0A0A0', fontWeight: 400 }}>{count}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* メイン: ファイル一覧 */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ツールバー */}
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #E5E5E5', display: 'flex', gap: 10, alignItems: 'center', background: '#FAFAFA' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ファイル名で検索..."
            style={{ flex: 1, height: 32, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }} />

          <div style={{ display: 'flex', gap: 2, background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 5, padding: 2 }}>
            <button onClick={() => setView('grid')} title="カード表示"
              style={{ border: 'none', background: view === 'grid' ? '#032D60' : 'transparent', color: view === 'grid' ? '#fff' : '#706E6B', height: 24, width: 28, padding: 0, cursor: 'pointer', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="grid-view" size={13} />
            </button>
            <button onClick={() => setView('list')} title="リスト表示"
              style={{ border: 'none', background: view === 'list' ? '#032D60' : 'transparent', color: view === 'list' ? '#fff' : '#706E6B', height: 24, width: 28, padding: 0, cursor: 'pointer', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="list-view" size={13} />
            </button>
          </div>

          <select value={pendingType} onChange={e => setPendingType(e.target.value)}
            style={{ height: 32, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 11, outline: 'none', background: '#fff' }}>
            {Object.entries(FILE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={pendingCat} onChange={e => setPendingCat(e.target.value)}
            style={{ height: 32, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 11, outline: 'none', background: '#fff' }}>
            {CATEGORIES.filter(c => !['all', 'starred', 'recent'].includes(c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>

          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ height: 32, padding: '0 14px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 12, color: '#fff', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="upload" size={13} />
            {uploading ? 'アップロード中...' : 'アップロード'}
          </button>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </div>

        {/* 一覧領域 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', color: '#706E6B', padding: 40, fontSize: 13 }}>読み込み中...</div>
          ) : displayList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 24px', color: '#706E6B' }}>
              <div style={{ color: '#706E6B', marginBottom: 16 }}>
                <Icon name="folder-open" size={48} />
              </div>
              <div style={{ fontSize: 13, marginBottom: 6, color: '#706E6B' }}>
                {files.length === 0 ? 'ファイルがまだありません' : '該当するファイルがありません'}
              </div>
              {files.length === 0 && (
                <div style={{ fontSize: 11, color: '#706E6B', lineHeight: 1.7 }}>
                  AIチャットタブから資料をアップロードすると、自動的にここに蓄積されます。<br/>
                  または右上の「アップロード」から直接追加できます。
                </div>
              )}
            </div>
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {displayList.map(({ representative: f, versions }) => (
                <FileCard key={f.id} file={f} versions={versions}
                  onStar={() => toggleStar(f)} onDownload={() => download(f)} onDelete={() => deleteFile(f)}
                  onClick={() => openPreview(f)}
                  selected={selected?.id === f.id} />
              ))}
            </div>
          ) : (
            <div>
              {displayList.map(({ representative: f, versions }, i) => (
                <FileRow key={f.id} file={f} versions={versions}
                  onStar={() => toggleStar(f)} onDownload={() => download(f)} onDelete={() => deleteFile(f)}
                  onClick={() => openPreview(f)}
                  selected={selected?.id === f.id}
                  isLast={i === displayList.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右ドロワー: プレビュー + 詳細 */}
      {selected && (
        <FileDetailDrawer file={selected}
          versions={groupedByVersion.get(selected.version_group || extractVersionGroup(selected.file_name).base) || [selected]}
          onClose={() => setSelected(null)}
          onStar={() => toggleStar(selected)}
          onDownload={() => download(selected)}
          onDelete={() => deleteFile(selected)}
          onCategoryChange={cat => updateCategory(selected, cat)}
          onSelectVersion={openPreview}
        />
      )}
    </div>
  )
}

function FileCard({ file: f, versions, onStar, onDownload, onDelete, onClick, selected }) {
  const { name: iconName, color } = iconFor(f.file_name)
  const hasVersions = versions.length > 1
  const parsed = f.parsed_data && Object.keys(f.parsed_data || {}).length > 0
  return (
    <div onClick={onClick}
      style={{
        border: selected ? '1.5px solid #032D60' : '0.5px solid #E5E5E5',
        borderRadius: 10, padding: 12, cursor: 'pointer', background: '#fff',
        transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ color }}>
          <Icon name={iconName} size={32} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#032D60', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
          <div style={{ fontSize: 10, color: '#706E6B', marginTop: 2 }}>{fmtDate(f.uploaded_at)}{f.file_size ? ` · ${fmtSize(f.file_size)}` : ''}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onStar() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: f.starred ? '#C8A84B' : '#E5E5E5', display: 'flex', alignItems: 'center', padding: 2 }}>
          <Icon name={f.starred ? 'star-fill' : 'star'} size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, padding: '1px 6px', background: '#F8F8F8', color: '#032D60', borderRadius: 3 }}>
          {FILE_TYPE_LABEL[f.file_type] || f.file_type}
        </span>
        {hasVersions && (
          <span style={{ fontSize: 9, padding: '1px 6px', background: '#FAF3E0', color: '#A08040', borderRadius: 3 }}>
            全{versions.length}版 ({f.version_label || '最新'})
          </span>
        )}
        {parsed && (
          <span style={{ fontSize: 9, padding: '1px 6px', background: '#E1F5EE', color: '#2E844A', borderRadius: 3 }}>解析済</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
        <button onClick={e => { e.stopPropagation(); onDownload() }}
          style={{ flex: 1, height: 26, fontSize: 10, background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 4, color: '#032D60', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Icon name="download" size={11} /> ダウンロード
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          style={{ width: 32, height: 26, background: '#fff', border: '0.5px solid #e0c0c0', borderRadius: 4, color: '#EA001E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="trash" size={12} />
        </button>
      </div>
    </div>
  )
}

function FileRow({ file: f, versions, onStar, onDownload, onDelete, onClick, selected, isLast }) {
  const { name: iconName, color } = iconFor(f.file_name)
  const hasVersions = versions.length > 1
  const parsed = f.parsed_data && Object.keys(f.parsed_data || {}).length > 0
  return (
    <div onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
        borderBottom: isLast ? 'none' : '0.5px solid #f0f2f5',
        cursor: 'pointer',
        background: selected ? '#FAFAFA' : 'transparent',
        borderLeft: selected ? '2px solid #032D60' : '2px solid transparent',
      }}>
      <button onClick={e => { e.stopPropagation(); onStar() }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: f.starred ? '#C8A84B' : '#E5E5E5', flexShrink: 0, display: 'flex', alignItems: 'center', padding: 2 }}>
        <Icon name={f.starred ? 'star-fill' : 'star'} size={14} />
      </button>
      <div style={{ color, flexShrink: 0 }}>
        <Icon name={iconName} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#032D60', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
        <div style={{ fontSize: 10, color: '#706E6B', marginTop: 2, display: 'flex', gap: 8 }}>
          <span>{fmtDate(f.uploaded_at)}</span>
          {f.file_size && <span>{fmtSize(f.file_size)}</span>}
          {hasVersions && <span>全{versions.length}版</span>}
        </div>
      </div>
      <span style={{ fontSize: 10, padding: '2px 8px', background: '#F8F8F8', color: '#032D60', borderRadius: 3, flexShrink: 0 }}>
        {FILE_TYPE_LABEL[f.file_type] || f.file_type}
      </span>
      {parsed && <span style={{ fontSize: 10, color: '#2E844A', flexShrink: 0, display: 'flex', alignItems: 'center' }}><Icon name="check" size={12} /></span>}
      <button onClick={e => { e.stopPropagation(); onDownload() }}
        style={{ height: 26, padding: '0 10px', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 4, color: '#032D60', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        <Icon name="download" size={12} />
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete() }}
        style={{ background: 'none', border: 'none', color: '#EA001E', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  )
}

function FileDetailDrawer({ file: f, versions, onClose, onStar, onDownload, onDelete, onCategoryChange, onSelectVersion }) {
  const { name: iconName, color } = iconFor(f.file_name)
  const ext = f.file_name?.split('.').pop()?.toLowerCase() || ''
  const canPreview = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #E5E5E5', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color }}>
          <Icon name={iconName} size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#032D60', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
          <div style={{ fontSize: 10, color: '#706E6B', marginTop: 2 }}>{fmtDate(f.uploaded_at)}{f.file_size ? ` · ${fmtSize(f.file_size)}` : ''}</div>
        </div>
        <button onClick={onStar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: f.starred ? '#C8A84B' : '#E5E5E5', display: 'flex', alignItems: 'center', padding: 4 }}>
          <Icon name={f.starred ? 'star-fill' : 'star'} size={16} />
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#706E6B', display: 'flex', alignItems: 'center', padding: 4 }}>
          <Icon name="close" size={14} />
        </button>
      </div>

      {/* プレビュー */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: '#FAFAFA' }}>
        {canPreview && f._previewUrl ? (
          ext === 'pdf' ? (
            <iframe src={f._previewUrl} style={{ width: '100%', height: 400, border: '0.5px solid #E5E5E5', borderRadius: 6, background: '#fff' }} />
          ) : (
            <img src={f._previewUrl} alt={f.file_name} style={{ maxWidth: '100%', borderRadius: 6 }} />
          )
        ) : (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#706E6B', fontSize: 11 }}>
            {canPreview ? 'プレビューを準備中...' : 'このファイル形式はプレビュー非対応。ダウンロードしてください。'}
          </div>
        )}

        {/* メタ情報 */}
        <div style={{ marginTop: 14, padding: 12, background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#706E6B', fontWeight: 500, marginBottom: 8 }}>ファイル情報</div>
          <Meta label="種別" value={FILE_TYPE_LABEL[f.file_type] || f.file_type} />
          <Meta label="DDカテゴリ">
            <select value={f.dd_category || TYPE_TO_CATEGORY[f.file_type] || 'general'}
              onChange={e => onCategoryChange(e.target.value)}
              style={{ fontSize: 11, padding: '2px 6px', border: '0.5px solid #E5E5E5', borderRadius: 4, background: '#fff' }}>
              {CATEGORIES.filter(c => !['all', 'starred', 'recent'].includes(c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Meta>
          <Meta label="経路" value={f.uploaded_via === 'advisor_portal' ? '担当者アップ' : f.uploaded_via === 'email' ? 'メール' : '内部'} />
          {f.version_label && <Meta label="版" value={f.version_label} />}
          {f.parsed_data && Object.keys(f.parsed_data).length > 0 && <Meta label="AI解析" value="完了" />}
        </div>

        {/* バージョン履歴 */}
        {versions.length > 1 && (
          <div style={{ marginTop: 12, padding: 12, background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#706E6B', fontWeight: 500, marginBottom: 8 }}>バージョン履歴 ({versions.length}版)</div>
            {versions.map((v, i) => (
              <div key={v.id} onClick={() => v.id !== f.id && onSelectVersion(v)}
                style={{ padding: '6px 0', borderBottom: i < versions.length - 1 ? '0.5px solid #f0f2f5' : 'none', cursor: v.id === f.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, padding: '1px 6px', background: v.id === f.id ? '#032D60' : '#F3F2F2', color: v.id === f.id ? '#fff' : '#706E6B', borderRadius: 3 }}>
                  {v.version_label || `v${versions.length - i}`}
                </span>
                <div style={{ flex: 1, fontSize: 11, color: v.id === f.id ? '#032D60' : '#706E6B', fontWeight: v.id === f.id ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.file_name}
                </div>
                <span style={{ fontSize: 10, color: '#706E6B' }}>{fmtDate(v.uploaded_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* フッター: アクション */}
      <div style={{ padding: 10, borderTop: '0.5px solid #E5E5E5', background: '#FAFAFA', display: 'flex', gap: 6 }}>
        <button onClick={onDownload}
          style={{ flex: 1, height: 32, background: '#032D60', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="download" size={13} /> ダウンロード
        </button>
        <button onClick={onDelete}
          style={{ height: 32, padding: '0 14px', background: '#fff', border: '0.5px solid #e0c0c0', borderRadius: 5, fontSize: 11, color: '#EA001E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="trash" size={12} /> 削除
        </button>
      </div>
    </div>
  )
}

function Meta({ label, value, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 11 }}>
      <div style={{ width: 80, color: '#706E6B' }}>{label}</div>
      <div style={{ flex: 1, color: '#032D60' }}>{children || value || '—'}</div>
    </div>
  )
}
