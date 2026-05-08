import { useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'
import Icon from '../ui/Icon'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Input, Select, Card, Badge } from '../../../../ui'

// PE 仕様のライブラリ: DDカテゴリ分類 + バージョン管理 + スター + プレビュー
const CATEGORIES = [
  { key: 'all',        label: 'すべて',       icon: 'folder',      tone: color.navy },
  { key: 'starred',    label: '重要',         icon: 'star',        tone: '#C8A84B' },
  { key: 'recent',     label: '直近7日',       icon: 'clock',       tone: color.navy },
  { key: 'commercial', label: '商業DD',        icon: 'trending-up', tone: color.navy },
  { key: 'financial',  label: '財務DD',        icon: 'yen',         tone: color.success },
  { key: 'legal',      label: '法務DD',        icon: 'scales',      tone: '#6830a0' },
  { key: 'hr',         label: '人事DD',        icon: 'users',       tone: '#a06020' },
  { key: 'it_ops',     label: 'IT/オペDD',     icon: 'server',      tone: color.navy },
  { key: 'tax',        label: '税務DD',        icon: 'receipt',     tone: '#806020' },
  { key: 'esg',        label: 'ESG',          icon: 'leaf',        tone: color.success },
  { key: 'contracts',  label: '契約書',         icon: 'scroll',      tone: color.navy },
  { key: 'general',    label: '概要・IM系',     icon: 'document',    tone: color.textLight },
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
  if (['xlsx', 'xls', 'csv'].includes(ext)) return { name: 'file-xls', color: color.success }
  if (['docx', 'doc'].includes(ext)) return { name: 'file-doc', color: color.navy }
  if (['pptx', 'ppt'].includes(ext)) return { name: 'file-ppt', color: '#a03020' }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return { name: 'image', color: '#6830a0' }
  return { name: 'file', color: color.textLight }
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '200px 1fr 360px' : '200px 1fr', gap: 14, height: 'calc(100vh - 280px)', minHeight: 560 }}>

      {/* 左サイドバー: カテゴリ */}
      <div style={{ background: color.white, border: `0.5px solid ${color.border}`, borderRadius: 12, padding: '10px 0', overflowY: 'auto' }}>
        {CATEGORIES.map((c, i) => {
          const count = counts[c.key] || 0
          const active = activeCategory === c.key
          return (
            <div key={c.key}>
              {(i === 3 || i === 10 || i === 11) && <div style={{ height: 0.5, background: color.border, margin: '6px 14px' }} />}
              <div onClick={() => setActiveCat(c.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', fontSize: font.size.sm,
                  color: active ? color.navy : color.textLight,
                  background: active ? color.gray50 : 'transparent',
                  fontWeight: active ? font.weight.medium : font.weight.normal,
                  borderLeft: active ? `3px solid ${c.tone}` : '3px solid transparent',
                }}>
                <Icon name={c.icon} size={15} color={active ? c.tone : color.textLight} />
                <span style={{ flex: 1 }}>{c.label}</span>
                {count > 0 && <span style={{ fontSize: font.size.xs, color: active ? color.navy : color.gray400, fontWeight: font.weight.normal }}>{count}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* メイン: ファイル一覧 */}
      <div style={{ background: color.white, border: `0.5px solid ${color.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ツールバー */}
        <div style={{ padding: '10px 14px', borderBottom: `0.5px solid ${color.border}`, display: 'flex', gap: 10, alignItems: 'center', background: color.gray50 }}>
          <Input size="sm" type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ファイル名で検索..."
            containerStyle={{ flex: 1 }} />

          <div style={{ display: 'flex', gap: 2, background: color.white, border: `0.5px solid ${color.border}`, borderRadius: radius.lg, padding: 2 }}>
            <button onClick={() => setView('grid')} title="カード表示"
              style={{ border: 'none', background: view === 'grid' ? color.navy : 'transparent', color: view === 'grid' ? color.white : color.textLight, height: 24, width: 28, padding: 0, cursor: 'pointer', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="grid-view" size={13} />
            </button>
            <button onClick={() => setView('list')} title="リスト表示"
              style={{ border: 'none', background: view === 'list' ? color.navy : 'transparent', color: view === 'list' ? color.white : color.textLight, height: 24, width: 28, padding: 0, cursor: 'pointer', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="list-view" size={13} />
            </button>
          </div>

          <Select size="sm" fullWidth={false} value={pendingType} onChange={e => setPendingType(e.target.value)}
            options={Object.entries(FILE_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          <Select size="sm" fullWidth={false} value={pendingCat} onChange={e => setPendingCat(e.target.value)}
            options={CATEGORIES.filter(c => !['all', 'starred', 'recent'].includes(c.key)).map(c => ({ value: c.key, label: c.label }))} />

          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} loading={uploading}
            iconLeft={<Icon name="upload" size={13} />}>
            {uploading ? 'アップロード中...' : 'アップロード'}
          </Button>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </div>

        {/* 一覧領域 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', color: color.textLight, padding: 40, fontSize: font.size.base }}>読み込み中...</div>
          ) : displayList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 24px', color: color.textLight }}>
              <div style={{ color: color.textLight, marginBottom: 16 }}>
                <Icon name="folder-open" size={48} />
              </div>
              <div style={{ fontSize: font.size.base, marginBottom: 6, color: color.textLight }}>
                {files.length === 0 ? 'ファイルがまだありません' : '該当するファイルがありません'}
              </div>
              {files.length === 0 && (
                <div style={{ fontSize: font.size.xs, color: color.textLight, lineHeight: 1.7 }}>
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
  const { name: iconName, color: iconColor } = iconFor(f.file_name)
  const hasVersions = versions.length > 1
  const parsed = f.parsed_data && Object.keys(f.parsed_data || {}).length > 0
  return (
    <div onClick={onClick}
      style={{
        border: selected ? `1.5px solid ${color.navy}` : `0.5px solid ${color.border}`,
        borderRadius: 10, padding: 12, cursor: 'pointer', background: color.white,
        transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ color: iconColor }}>
          <Icon name={iconName} size={32} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.size.sm, color: color.navy, fontWeight: font.weight.medium, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>{fmtDate(f.uploaded_at)}{f.file_size ? ` · ${fmtSize(f.file_size)}` : ''}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onStar() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: f.starred ? '#C8A84B' : color.border, display: 'flex', alignItems: 'center', padding: 2 }}>
          <Icon name={f.starred ? 'star-fill' : 'star'} size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Badge variant="primary" size="sm">
          {FILE_TYPE_LABEL[f.file_type] || f.file_type}
        </Badge>
        {hasVersions && (
          <Badge variant="warn" size="sm">
            全{versions.length}版 ({f.version_label || '最新'})
          </Badge>
        )}
        {parsed && (
          <Badge variant="success" size="sm">解析済</Badge>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
        <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); onDownload() }} style={{ flex: 1, height: 26, fontSize: font.size.xs }}
          iconLeft={<Icon name="download" size={11} />}>
          ダウンロード
        </Button>
        <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); onDelete() }} style={{ width: 32, height: 26, color: color.danger, borderColor: '#e0c0c0', padding: 0 }}>
          <Icon name="trash" size={12} />
        </Button>
      </div>
    </div>
  )
}

function FileRow({ file: f, versions, onStar, onDownload, onDelete, onClick, selected, isLast }) {
  const { name: iconName, color: iconColor } = iconFor(f.file_name)
  const hasVersions = versions.length > 1
  const parsed = f.parsed_data && Object.keys(f.parsed_data || {}).length > 0
  return (
    <div onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
        borderBottom: isLast ? 'none' : `0.5px solid ${color.borderLight}`,
        cursor: 'pointer',
        background: selected ? color.gray50 : 'transparent',
        borderLeft: selected ? `2px solid ${color.navy}` : '2px solid transparent',
      }}>
      <button onClick={e => { e.stopPropagation(); onStar() }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: f.starred ? '#C8A84B' : color.border, flexShrink: 0, display: 'flex', alignItems: 'center', padding: 2 }}>
        <Icon name={f.starred ? 'star-fill' : 'star'} size={14} />
      </button>
      <div style={{ color: iconColor, flexShrink: 0 }}>
        <Icon name={iconName} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: font.size.sm, color: color.navy, fontWeight: font.weight.medium, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2, display: 'flex', gap: 8 }}>
          <span>{fmtDate(f.uploaded_at)}</span>
          {f.file_size && <span>{fmtSize(f.file_size)}</span>}
          {hasVersions && <span>全{versions.length}版</span>}
        </div>
      </div>
      <Badge variant="primary" size="sm">
        {FILE_TYPE_LABEL[f.file_type] || f.file_type}
      </Badge>
      {parsed && <span style={{ fontSize: font.size.xs, color: color.success, flexShrink: 0, display: 'flex', alignItems: 'center' }}><Icon name="check" size={12} /></span>}
      <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); onDownload() }} style={{ height: 26, padding: '0 10px' }}>
        <Icon name="download" size={12} />
      </Button>
      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onDelete() }} style={{ color: color.danger, padding: 2, minHeight: 0 }}>
        <Icon name="trash" size={14} />
      </Button>
    </div>
  )
}

function FileDetailDrawer({ file: f, versions, onClose, onStar, onDownload, onDelete, onCategoryChange, onSelectVersion }) {
  const { name: iconName, color: iconColor } = iconFor(f.file_name)
  const ext = f.file_name?.split('.').pop()?.toLowerCase() || ''
  const canPreview = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)

  return (
    <div style={{ background: color.white, border: `0.5px solid ${color.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: `0.5px solid ${color.border}`, background: color.gray50, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color: iconColor }}>
          <Icon name={iconName} size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>{fmtDate(f.uploaded_at)}{f.file_size ? ` · ${fmtSize(f.file_size)}` : ''}</div>
        </div>
        <button onClick={onStar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: f.starred ? '#C8A84B' : color.border, display: 'flex', alignItems: 'center', padding: 4 }}>
          <Icon name={f.starred ? 'star-fill' : 'star'} size={16} />
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.textLight, display: 'flex', alignItems: 'center', padding: 4 }}>
          <Icon name="close" size={14} />
        </button>
      </div>

      {/* プレビュー */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: color.gray50 }}>
        {canPreview && f._previewUrl ? (
          ext === 'pdf' ? (
            <iframe src={f._previewUrl} style={{ width: '100%', height: 400, border: `0.5px solid ${color.border}`, borderRadius: 6, background: color.white }} />
          ) : (
            <img src={f._previewUrl} alt={f.file_name} style={{ maxWidth: '100%', borderRadius: 6 }} />
          )
        ) : (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: color.textLight, fontSize: font.size.xs }}>
            {canPreview ? 'プレビューを準備中...' : 'このファイル形式はプレビュー非対応。ダウンロードしてください。'}
          </div>
        )}

        {/* メタ情報 */}
        <div style={{ marginTop: 14, padding: 12, background: color.white, border: `0.5px solid ${color.border}`, borderRadius: radius.xl }}>
          <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.medium, marginBottom: 8 }}>ファイル情報</div>
          <Meta label="種別" value={FILE_TYPE_LABEL[f.file_type] || f.file_type} />
          <Meta label="DDカテゴリ">
            <select value={f.dd_category || TYPE_TO_CATEGORY[f.file_type] || 'general'}
              onChange={e => onCategoryChange(e.target.value)}
              style={{ fontSize: font.size.xs, padding: '2px 6px', border: `0.5px solid ${color.border}`, borderRadius: radius.md, background: color.white }}>
              {CATEGORIES.filter(c => !['all', 'starred', 'recent'].includes(c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Meta>
          <Meta label="経路" value={f.uploaded_via === 'advisor_portal' ? '担当者アップ' : f.uploaded_via === 'email' ? 'メール' : '内部'} />
          {f.version_label && <Meta label="版" value={f.version_label} />}
          {f.parsed_data && Object.keys(f.parsed_data).length > 0 && <Meta label="AI解析" value="完了" />}
        </div>

        {/* バージョン履歴 */}
        {versions.length > 1 && (
          <div style={{ marginTop: 12, padding: 12, background: color.white, border: `0.5px solid ${color.border}`, borderRadius: radius.xl }}>
            <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.medium, marginBottom: 8 }}>バージョン履歴 ({versions.length}版)</div>
            {versions.map((v, i) => (
              <div key={v.id} onClick={() => v.id !== f.id && onSelectVersion(v)}
                style={{ padding: '6px 0', borderBottom: i < versions.length - 1 ? `0.5px solid ${color.borderLight}` : 'none', cursor: v.id === f.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: font.size.xs, padding: '1px 6px', background: v.id === f.id ? color.navy : color.gray100, color: v.id === f.id ? color.white : color.textLight, borderRadius: 3 }}>
                  {v.version_label || `v${versions.length - i}`}
                </span>
                <div style={{ flex: 1, fontSize: font.size.xs, color: v.id === f.id ? color.navy : color.textLight, fontWeight: v.id === f.id ? font.weight.medium : font.weight.normal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.file_name}
                </div>
                <span style={{ fontSize: font.size.xs, color: color.textLight }}>{fmtDate(v.uploaded_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* フッター: アクション */}
      <div style={{ padding: 10, borderTop: `0.5px solid ${color.border}`, background: color.gray50, display: 'flex', gap: 6 }}>
        <Button onClick={onDownload} style={{ flex: 1, height: 32 }} iconLeft={<Icon name="download" size={13} />}>
          ダウンロード
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} style={{ height: 32, color: color.danger, borderColor: '#e0c0c0' }}
          iconLeft={<Icon name="trash" size={12} />}>
          削除
        </Button>
      </div>
    </div>
  )
}

function Meta({ label, value, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: font.size.xs }}>
      <div style={{ width: 80, color: color.textLight }}>{label}</div>
      <div style={{ flex: 1, color: color.navy }}>{children || value || '—'}</div>
    </div>
  )
}
