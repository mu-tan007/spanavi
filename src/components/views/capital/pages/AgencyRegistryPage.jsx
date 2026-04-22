import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAudit } from '../lib/audit'
import PageHeader from '../../../common/PageHeader'

const STATUS_STYLE = {
  not_contacted: { bg: '#F8F8F8', color: '#706E6B', label: '未接触' },
  contacted:     { bg: '#E1F5EE', color: '#2E844A', label: '接触済' },
}

const SORT_OPTIONS = [
  { value: 'name_asc',       label: '支援機関名 名称昇順（法人格を除外）' },
  { value: 'name_desc',      label: '支援機関名 名称降順（法人格を除外）' },
  { value: 'prefecture_asc', label: '本店所在地 都道府県昇順' },
  { value: 'prefecture_desc',label: '本店所在地 都道府県降順' },
  { value: 'staff_asc',      label: 'M&A専従者数 人数昇順' },
  { value: 'staff_desc',     label: 'M&A専従者数 人数降順' },
]

const PREFS = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]
const PAGE_SIZE = 50

export default function AgencyRegistryPage() {
  const qc = useQueryClient()
  const { tenantId } = useAuth()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPref, setFilterPref] = useState('')
  const [filterInfoSharing, setFilterInfoSharing] = useState('')
  const [filterFeeType, setFilterFeeType] = useState('')
  const [filterStaffMin, setFilterStaffMin] = useState('')
  const [filterStaffMax, setFilterStaffMax] = useState('')
  const [sortKey, setSortKey] = useState('name_asc')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastBody, setBroadcastBody] = useState('')
  const [selectAll, setSelectAll] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [editForm, setEditForm] = useState({})

  const { data: allAgencies = [], isLoading } = useQuery({
    queryKey: ['ma-agencies'],
    queryFn: async () => {
      let all = []; let from = 0; const step = 1000
      while (true) {
        const { data } = await supabase.from('cap_ma_agencies').select('*').range(from, from + step - 1).order('name')
        if (!data || data.length === 0) break; all = all.concat(data)
        if (data.length < step) break; from += step
      }
      return all
    },
    staleTime: 60000,
  })

  const { data: needs = [] } = useQuery({
    queryKey: ['needs-active'],
    queryFn: async () => { const { data } = await supabase.from('cap_acquisition_needs').select('*').eq('is_active', true).order('priority'); return data || [] },
  })

  const filtered = useMemo(() => {
    let list = allAgencies
    if (search) { const q = search.toLowerCase(); list = list.filter(a => a.name.toLowerCase().includes(q)) }
    if (filterStatus) list = list.filter(a => a.status === filterStatus)
    if (filterPref) list = list.filter(a => a.prefecture === filterPref)
    if (filterInfoSharing === 'yes') list = list.filter(a => a.info_sharing)
    if (filterInfoSharing === 'no') list = list.filter(a => !a.info_sharing)
    if (filterFeeType === 'fa') list = list.filter(a => a.fa_seller_success_fee === '有り' || a.fa_buyer_success_fee === '有り')
    if (filterFeeType === 'broker') list = list.filter(a => a.broker_seller_success_fee === '有り' || a.broker_buyer_success_fee === '有り')
    if (filterStaffMin) list = list.filter(a => (a.staff_count || 0) >= Number(filterStaffMin))
    if (filterStaffMax) list = list.filter(a => (a.staff_count || 0) <= Number(filterStaffMax))
    list = [...list]
    switch (sortKey) {
      case 'name_asc': list.sort((a,b) => a.name.localeCompare(b.name, 'ja')); break
      case 'name_desc': list.sort((a,b) => b.name.localeCompare(a.name, 'ja')); break
      case 'prefecture_asc': list.sort((a,b) => (a.prefecture||'').localeCompare(b.prefecture||'', 'ja')); break
      case 'prefecture_desc': list.sort((a,b) => (b.prefecture||'').localeCompare(a.prefecture||'', 'ja')); break
      case 'staff_asc': list.sort((a,b) => (a.staff_count||0) - (b.staff_count||0)); break
      case 'staff_desc': list.sort((a,b) => (b.staff_count||0) - (a.staff_count||0)); break
    }
    return list
  }, [allAgencies, search, filterStatus, filterPref, filterInfoSharing, filterFeeType, filterStaffMin, filterStaffMax, sortKey])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const stats = { total: allAgencies.length, contacted: allAgencies.filter(a => a.status === 'contacted').length, notContacted: allAgencies.filter(a => a.status === 'not_contacted').length }

  async function updateStatus(id, status) {
    await supabase.from('cap_ma_agencies').update({ status, contacted_at: status !== 'not_contacted' ? new Date().toISOString() : null }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['ma-agencies'] })
  }
  function toggleSelect(id) { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  function toggleSelectAll() { if (selectAll) setSelectedIds(new Set()); else setSelectedIds(new Set(paged.map(a => a.id))); setSelectAll(!selectAll) }
  function clearFilters() { setSearch(''); setFilterStatus(''); setFilterPref(''); setFilterInfoSharing(''); setFilterFeeType(''); setFilterStaffMin(''); setFilterStaffMax(''); setPage(1) }

  // AIで問い合わせフォームURLを自動取得
  async function lookupContacts() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setLookingUp(true)
    try {
      // 20件ずつバッチ処理
      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20)
        await supabase.functions.invoke('lookup-agency-contact', { body: { agency_ids: batch } })
      }
      qc.invalidateQueries({ queryKey: ['ma-agencies'] })
      alert(`${ids.length}社の連絡先を取得しました`)
    } catch (err) {
      alert('取得エラー: ' + err.message)
    } finally {
      setLookingUp(false)
    }
  }

  // 配信モーダルを開く
  function openBroadcast() {
    const selected = allAgencies.filter(a => selectedIds.has(a.id))
    const needText = needs.length > 0 ? needs.map(n => `- ${n.industry_label || '業種未指定'}`).join('\n') : '（買収ニーズを登録してください）'
    setBroadcastBody(`お世話になっております。\nM&Aソーシングパートナーズ株式会社と申します。\n\n弊社では現在、以下の条件での買収案件を探しております。\n\n${needText}\n\nご案件がございましたら、ぜひご紹介いただけますと幸いです。\n何卒よろしくお願いいたします。`)
    setShowBroadcast(true)
  }

  // 配信実行
  async function sendBroadcast() {
    const selected = allAgencies.filter(a => selectedIds.has(a.id))
    const withEmail = selected.filter(a => a.status === 'contacted' && a.contact_email)
    const withForm = selected.filter(a => a.status === 'not_contacted' && a.contact_form_url)
    const noContact = selected.filter(a => !a.contact_email && !a.contact_form_url)

    // 記録保存
    await supabase.from('cap_need_broadcasts').insert({
      subject: `【買収ニーズ配信】${selected.length}社`,
      body: broadcastBody,
      sent_to: selected.map(a => ({ agency_id: a.id, name: a.name, method: a.contact_email ? 'email' : 'form' })),
      sent_at: new Date().toISOString(),
    })

    // 監査ログ
    logAudit({
      action: 'broadcast_send', resourceType: 'broadcast',
      resourceName: `買収ニーズ配信 ${selected.length}社`,
      metadata: { total: selected.length, with_email: withEmail.length, with_form: withForm.length, no_contact: noContact.length },
    })

    // 接触済 → メール送信（mailto:一括）
    if (withEmail.length > 0) {
      const emails = withEmail.map(a => a.contact_email).join(',')
      const subject = encodeURIComponent('【買収ニーズのご案内】M&Aソーシングパートナーズ')
      const body = encodeURIComponent(broadcastBody)
      window.open(`mailto:${emails}?subject=${subject}&body=${body}`, '_blank')
    }

    // 未接触 → 問い合わせフォームをタブで開く（最大10件）
    if (withForm.length > 0) {
      const toOpen = withForm.slice(0, 10)
      for (const a of toOpen) {
        window.open(a.contact_form_url, '_blank')
      }
      if (withForm.length > 10) {
        alert(`問い合わせフォームは最初の10件を開きました。残り${withForm.length - 10}件は順次開いてください。`)
      }
    }

    // ステータス更新
    for (const a of selected) {
      if (a.status === 'not_contacted') await updateStatus(a.id, 'contacted')
    }

    setShowBroadcast(false); setSelectedIds(new Set()); setSelectAll(false)

    let msg = `配信完了:\n`
    if (withEmail.length > 0) msg += `・メール: ${withEmail.length}社（メーラーが開きました）\n`
    if (withForm.length > 0) msg += `・フォーム: ${withForm.length}社（タブが開きました）\n`
    if (noContact.length > 0) msg += `・連絡先未取得: ${noContact.length}社（先に「連絡先を取得」してください）`
    alert(msg)
  }

  // 連絡先手動編集
  async function saveContact() {
    if (!editingContact) return
    await supabase.from('cap_ma_agencies').update({
      contact_email: editForm.email || null,
      contact_form_url: editForm.form_url || null,
      website: editForm.website || null,
      contact_name: editForm.contact_name || null,
    }).eq('id', editingContact)
    qc.invalidateQueries({ queryKey: ['ma-agencies'] })
    setEditingContact(null)
  }

  const selectStyle = { height: 32, padding: '0 8px', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none', color: '#032D60' }
  // color は <tr> の背景に合わせて親から継承させる (navy bg → 白、grey bg → dark)
  const th = { fontSize: 10, fontWeight: 500, padding: '6px 4px', textAlign: 'center', lineHeight: 1.3 }
  const td = { fontSize: 11, color: '#032D60', padding: '6px 4px', textAlign: 'center', borderBottom: '0.5px solid #e0e8f4' }

  function Pager() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        <button onClick={() => setPage(1)} disabled={page===1} style={{ padding: '3px 7px', border: '0.5px solid #E5E5E5', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#706E6B' }}>«</button>
        <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={{ padding: '3px 7px', border: '0.5px solid #E5E5E5', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#706E6B' }}>‹</button>
        {Array.from({length: Math.min(7, totalPages)}, (_, i) => {
          let p = page <= 4 ? i+1 : page >= totalPages-3 ? totalPages-6+i : page-3+i
          if (p < 1 || p > totalPages) return null
          return <button key={p} onClick={() => setPage(p)} style={{ padding: '3px 9px', border: p===page ? 'none' : '0.5px solid #E5E5E5', borderRadius: 4, background: p===page ? '#032D60' : '#fff', color: p===page ? '#fff' : '#706E6B', fontSize: 11, cursor: 'pointer', fontWeight: p===page ? 600 : 400 }}>{p}</button>
        })}
        {totalPages > 7 && page < totalPages - 3 && <span style={{ color: '#706E6B', fontSize: 11 }}>…</span>}
        {totalPages > 7 && page < totalPages - 3 && <button onClick={() => setPage(totalPages)} style={{ padding: '3px 9px', border: '0.5px solid #E5E5E5', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#706E6B' }}>{totalPages}</button>}
        <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} style={{ padding: '3px 7px', border: '0.5px solid #E5E5E5', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#706E6B' }}>›</button>
        <button onClick={() => setPage(totalPages)} disabled={page===totalPages||totalPages===0} style={{ padding: '3px 7px', border: '0.5px solid #E5E5E5', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#706E6B' }}>»</button>
      </div>
    )
  }

  // 選択中の企業の連絡先状況
  const selectedAgencies = allAgencies.filter(a => selectedIds.has(a.id))
  const selWithEmail = selectedAgencies.filter(a => a.contact_email)
  const selWithForm = selectedAgencies.filter(a => a.contact_form_url && !a.contact_email)
  const selNoContact = selectedAgencies.filter(a => !a.contact_email && !a.contact_form_url)

  return (
    <div>
      <PageHeader
        bleed={false}
        eyebrow="Spartia Capital · Registry"
        title="登録支援機関データベース"
        description={`${filtered.length === stats.total
          ? `${(page-1)*PAGE_SIZE+1}〜${Math.min(page*PAGE_SIZE, filtered.length)}件を表示中（全${stats.total}件）`
          : `${filtered.length}件該当（全${stats.total}件）`}　接触済 ${stats.contacted}社　未接触 ${stats.notContacted}社`}
        style={{ marginBottom: 16 }}
        right={selectedIds.size > 0 ? (
          <>
            <button onClick={lookupContacts} disabled={lookingUp} style={{
              height: 32, padding: '0 12px', background: '#fff', border: '0.5px solid #E5E5E5',
              borderRadius: 4, color: '#032D60', fontSize: 12, cursor: 'pointer',
            }}>{lookingUp ? 'AI取得中...' : `${selectedIds.size}社の連絡先を取得`}</button>
            <button onClick={openBroadcast} style={{
              height: 32, padding: '0 14px', background: '#032D60', border: 'none',
              borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{selectedIds.size}社に配信</button>
          </>
        ) : null}
      />
      <div style={{ padding: '0 24px' }}>

      {/* 検索バー */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="企業名/事業所名"
          style={{ ...selectStyle, width: 220 }} />
        <button onClick={() => setShowAdvanced(!showAdvanced)} style={{
          height: 32, padding: '0 14px', background: showAdvanced ? '#032D60' : '#fff',
          border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, cursor: 'pointer',
          color: showAdvanced ? '#FFFFFF' : '#706E6B',
        }}>{showAdvanced ? '✕ 詳細検索を閉じる' : '詳細検索'}</button>
        {(filterStatus || filterPref || filterInfoSharing || filterFeeType || filterStaffMin || filterStaffMax) && (
          <button onClick={clearFilters} style={{ height: 32, padding: '0 12px', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, cursor: 'pointer', color: '#F0B4B4' }}>クリア</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#706E6B' }}>並び替え</span>
          <select value={sortKey} onChange={e => { setSortKey(e.target.value); setPage(1) }} style={selectStyle}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* 詳細検索 */}
      {showAdvanced && (
        <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 10, padding: 20, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px' }}>
            <div>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4, fontWeight: 500 }}>ステータス</div>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%' }}>
                <option value="">すべて</option><option value="not_contacted">未接触</option><option value="contacted">接触済</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4, fontWeight: 500 }}>本店所在都道府県</div>
              <select value={filterPref} onChange={e => { setFilterPref(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%' }}>
                <option value="">すべて</option>{PREFS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4, fontWeight: 500 }}>FA/仲介業務の別</div>
              <select value={filterFeeType} onChange={e => { setFilterFeeType(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%' }}>
                <option value="">すべて</option><option value="fa">FA業務あり</option><option value="broker">仲介業務あり</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4, fontWeight: 500 }}>情報共有の仕組みへの加盟</div>
              <select value={filterInfoSharing} onChange={e => { setFilterInfoSharing(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%' }}>
                <option value="">すべて</option><option value="yes">加盟有り</option><option value="no">加盟無し</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4, fontWeight: 500 }}>M&A専従者数（下限）</div>
              <select value={filterStaffMin} onChange={e => { setFilterStaffMin(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%' }}>
                <option value="">下限なし</option>{[1,2,3,5,10,20,50,100].map(n => <option key={n} value={n}>{n}人以上</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4, fontWeight: 500 }}>M&A専従者数（上限）</div>
              <select value={filterStaffMax} onChange={e => { setFilterStaffMax(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%' }}>
                <option value="">上限なし</option>{[1,2,3,5,10,20,50,100,200].map(n => <option key={n} value={n}>{n}人以下</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}><Pager /></div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #E5E5E5', borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
          <thead>
            <tr style={{ background: '#032D60', color: '#FFFFFF' }}>
              <th rowSpan={3} style={{ ...th, width: 32 }}><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} style={{ width: 13, height: 13 }} /></th>
              <th rowSpan={3} style={{ ...th, width: 36 }}>No</th>
              <th colSpan={4} style={{ ...th, borderBottom: '1px solid #E5E5E5', borderRight: '1px solid #E5E5E5' }}>基本情報</th>
              <th colSpan={6} style={{ ...th, borderBottom: '1px solid #E5E5E5', borderRight: '1px solid #E5E5E5' }}>手数料体系 — FA</th>
              <th colSpan={6} style={{ ...th, borderBottom: '1px solid #E5E5E5', borderRight: '1px solid #E5E5E5' }}>手数料体系 — 仲介</th>
              <th rowSpan={3} style={{ ...th, width: 90 }}>連絡先</th>
              <th rowSpan={3} style={{ ...th, width: 70 }}>ステータス</th>
            </tr>
            <tr style={{ background: '#032D60', color: '#FFFFFF' }}>
              <th rowSpan={2} style={{ ...th, minWidth: 180, textAlign: 'left', paddingLeft: 8 }}>支援機関名</th>
              <th rowSpan={2} style={{ ...th, width: 56 }}>本店<br/>所在地</th>
              <th rowSpan={2} style={{ ...th, width: 48 }}>M&A<br/>専従<br/>者数</th>
              <th rowSpan={2} style={{ ...th, width: 68, borderRight: '1px solid #E5E5E5' }}>情報共有<br/>加盟有無</th>
              <th colSpan={4} style={{ ...th, borderBottom: '1px solid #E5E5E5', fontSize: 9 }}>譲渡側</th>
              <th colSpan={2} style={{ ...th, borderBottom: '1px solid #E5E5E5', borderRight: '1px solid #E5E5E5', fontSize: 9 }}>譲受側</th>
              <th colSpan={4} style={{ ...th, borderBottom: '1px solid #E5E5E5', fontSize: 9 }}>譲渡側</th>
              <th colSpan={2} style={{ ...th, borderBottom: '1px solid #E5E5E5', borderRight: '1px solid #E5E5E5', fontSize: 9 }}>譲受側</th>
            </tr>
            <tr style={{ background: '#E5E5E5', color: '#181818' }}>
              <th style={{ ...th, width: 40 }}>成功<br/>報酬</th><th style={{ ...th, width: 50 }}>算定<br/>方式</th>
              <th style={{ ...th, width: 52 }}>最低<br/>手数料</th><th style={{ ...th, width: 40 }}>その他</th>
              <th style={{ ...th, width: 40 }}>成功<br/>報酬</th><th style={{ ...th, width: 50, borderRight: '1px solid #E5E5E5' }}>算定<br/>方式</th>
              <th style={{ ...th, width: 40 }}>成功<br/>報酬</th><th style={{ ...th, width: 50 }}>算定<br/>方式</th>
              <th style={{ ...th, width: 52 }}>最低<br/>手数料</th><th style={{ ...th, width: 40 }}>その他</th>
              <th style={{ ...th, width: 40 }}>成功<br/>報酬</th><th style={{ ...th, width: 50, borderRight: '1px solid #E5E5E5' }}>算定<br/>方式</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={20} style={{ ...td, padding: 40, color: '#706E6B' }}>読み込み中...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={20} style={{ ...td, padding: 40, color: '#706E6B' }}>該当する機関がありません</td></tr>
            ) : paged.map((a, i) => {
              const ss = STATUS_STYLE[a.status] || STATUS_STYLE.not_contacted
              const rowNum = (page - 1) * PAGE_SIZE + i + 1
              const hasEmail = !!a.contact_email
              const hasForm = !!a.contact_form_url
              return (
                <tr key={a.id} style={{ background: selectedIds.has(a.id) ? '#e8f0ff' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={td}><input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)} style={{ width: 13, height: 13 }} /></td>
                  <td style={{ ...td, color: '#706E6B' }}>{rowNum}</td>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 8, fontWeight: 500, color: '#032D60', cursor: 'pointer' }}
                    onClick={() => {
                      if (a.website) window.open(a.website, '_blank')
                      else window.open(`https://ma-shienkikan.go.jp/search?sort=corporate_name_kana&corporate_name=${encodeURIComponent(a.name)}`, '_blank')
                    }}>
                    {a.name}
                  </td>
                  <td style={td}>{a.prefecture || ''}</td>
                  <td style={td}>{a.staff_count != null ? `${a.staff_count}人` : ''}</td>
                  <td style={{ ...td, borderRight: '1px solid #dce8f8' }}>{a.info_sharing ? '有り' : '無し'}</td>
                  <td style={td}>{a.fa_seller_success_fee || ''}</td>
                  <td style={td}>{a.fa_seller_calc_method || ''}</td>
                  <td style={td}>{a.fa_seller_min_fee || ''}</td>
                  <td style={td}>{a.fa_seller_other_fee || ''}</td>
                  <td style={td}>{a.fa_buyer_success_fee || ''}</td>
                  <td style={{ ...td, borderRight: '1px solid #dce8f8' }}>{a.fa_buyer_calc_method || ''}</td>
                  <td style={td}>{a.broker_seller_success_fee || ''}</td>
                  <td style={td}>{a.broker_seller_calc_method || ''}</td>
                  <td style={td}>{a.broker_seller_min_fee || ''}</td>
                  <td style={td}>{a.broker_seller_other_fee || ''}</td>
                  <td style={td}>{a.broker_buyer_success_fee || ''}</td>
                  <td style={{ ...td, borderRight: '1px solid #dce8f8' }}>{a.broker_buyer_calc_method || ''}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
                      {hasEmail && <span title={a.contact_email} style={{ fontSize: 9, background: '#E1F5EE', color: '#2E844A', padding: '1px 4px', borderRadius: 2, cursor: 'pointer' }}
                        onClick={() => window.open(`mailto:${a.contact_email}`, '_blank')}>Mail</span>}
                      {hasForm && <span title={a.contact_form_url} style={{ fontSize: 9, background: '#F8F8F8', color: '#032D60', padding: '1px 4px', borderRadius: 2, cursor: 'pointer' }}
                        onClick={() => window.open(a.contact_form_url, '_blank')}>Form</span>}
                      <span style={{ fontSize: 9, color: '#706E6B', cursor: 'pointer', padding: '1px 3px' }}
                        onClick={() => { setEditingContact(a.id); setEditForm({ email: a.contact_email || '', form_url: a.contact_form_url || '', website: a.website || '', contact_name: a.contact_name || '' }) }}
                        title="編集">✎</span>
                    </div>
                  </td>
                  <td style={td}>
                    <select value={a.status} onChange={e => updateStatus(a.id, e.target.value)}
                      style={{ height: 24, padding: '0 4px', fontSize: 10, border: `0.5px solid ${ss.bg}`, borderRadius: 3, background: ss.bg, color: ss.color, outline: 'none', cursor: 'pointer' }}>
                      <option value="not_contacted">未接触</option><option value="contacted">接触済</option>
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10 }}><Pager /></div>

      {/* 連絡先編集モーダル */}
      {editingContact && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditingContact(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420 }}>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: '#032D60', marginBottom: 16 }}>連絡先を編集</h3>
            {[['担当者名', 'contact_name', 'text'], ['メールアドレス', 'email', 'email'], ['問い合わせフォームURL', 'form_url', 'url'], ['ウェブサイト', 'website', 'url']].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 3 }}>{label}</div>
                <input type={type} value={editForm[key] || ''} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                  style={{ width: '100%', height: 34, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 13, outline: 'none' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setEditingContact(null)} style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>キャンセル</button>
              <button onClick={saveContact} style={{ flex: 1, height: 36, background: '#FFFFFF', border: 'none', borderRadius: 6, fontSize: 13, color: '#181818', fontWeight: 500, cursor: 'pointer' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 配信モーダル */}
      {showBroadcast && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowBroadcast(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 620, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#032D60', marginBottom: 4 }}>買収ニーズ配信</h2>
            <p style={{ fontSize: 12, color: '#706E6B', marginBottom: 16 }}>選択した {selectedIds.size} 社に配信します</p>

            {/* 配信方法の内訳 */}
            <div style={{ background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#032D60', marginBottom: 8 }}>配信方法の内訳</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <div style={{ color: '#2E844A' }}>メール送信: {selWithEmail.length}社</div>
                <div style={{ color: '#032D60' }}>フォーム: {selWithForm.length}社</div>
                {selNoContact.length > 0 && <div style={{ color: '#F0B4B4' }}>連絡先なし: {selNoContact.length}社</div>}
              </div>
              {selNoContact.length > 0 && (
                <div style={{ fontSize: 11, color: '#A08040', marginTop: 6, background: '#FAF3E0', padding: '6px 10px', borderRadius: 4 }}>
                  連絡先未取得の{selNoContact.length}社は配信されません。先に「連絡先を取得」ボタンでAI取得してください。
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>メール本文（メール送信・フォーム入力用）</div>
              <textarea value={broadcastBody} onChange={e => setBroadcastBody(e.target.value)} rows={10}
                style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical', lineHeight: 1.8 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowBroadcast(false)} style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>キャンセル</button>
              <button onClick={sendBroadcast} style={{ flex: 1, height: 36, background: '#FFFFFF', border: 'none', borderRadius: 6, fontSize: 13, color: '#181818', fontWeight: 500, cursor: 'pointer' }}>配信する</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
