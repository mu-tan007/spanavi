import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { logAudit } from './capital/lib/audit'
import PageHeader from '../common/PageHeader'
import { color, space, radius, font, shadow, alpha } from '../../constants/design'
import { Button, Input, Select, Card, Badge } from '../ui'
import { downloadCsv, todayJST } from '../../lib/csvExport'
import { applyAiFiltersToAgencyState, listSavedSearches, saveSearch, deleteSavedSearch } from '../../lib/agencyChatApi'
import AgencyChatPanel from '../masp/AgencyChatPanel'
import { useAuth } from '../../hooks/useAuth'

const CSV_COLUMNS = [
  { header: '支援機関名', accessor: a => a.name },
  { header: '本店所在地', accessor: a => a.prefecture || '' },
  { header: 'M&A専従者数', accessor: a => a.staff_count != null ? a.staff_count : '' },
  { header: '代表者', accessor: a => a.contact_name || '' },
  { header: '電話番号', accessor: a => a.contact_phone || '' },
  { header: 'FA譲渡側-成功報酬', accessor: a => a.fa_seller_success_fee || '' },
  { header: 'FA譲渡側-算定方式', accessor: a => a.fa_seller_calc_method || '' },
  { header: 'FA譲渡側-最低手数料', accessor: a => a.fa_seller_min_fee || '' },
  { header: 'FA譲渡側-その他', accessor: a => a.fa_seller_other_fee || '' },
  { header: 'FA譲受側-成功報酬', accessor: a => a.fa_buyer_success_fee || '' },
  { header: 'FA譲受側-算定方式', accessor: a => a.fa_buyer_calc_method || '' },
  { header: '仲介譲渡側-成功報酬', accessor: a => a.broker_seller_success_fee || '' },
  { header: '仲介譲渡側-算定方式', accessor: a => a.broker_seller_calc_method || '' },
  { header: '仲介譲渡側-最低手数料', accessor: a => a.broker_seller_min_fee || '' },
  { header: '仲介譲渡側-その他', accessor: a => a.broker_seller_other_fee || '' },
  { header: '仲介譲受側-成功報酬', accessor: a => a.broker_buyer_success_fee || '' },
  { header: '仲介譲受側-算定方式', accessor: a => a.broker_buyer_calc_method || '' },
  { header: 'メールアドレス', accessor: a => a.contact_email || '' },
  { header: '問い合わせフォームURL', accessor: a => a.contact_form_url || '' },
  { header: 'ウェブサイト', accessor: a => a.website || '' },
  { header: 'ステータス', accessor: a => {
    const ds = deriveStatus(a)
    if (ds === 'partner') return '取引先'
    if (ds === 'contacted' || ds === 'crm_contacted') return '接触済'
    return '未接触'
  } },
  { header: 'CRMリンククライアント', accessor: a => a.linked_client?.name || '' },
  { header: 'CRMステータス', accessor: a => a.linked_client?.status || '' },
]

// SpanaviApp 配下には QueryClientProvider が無いため、このページ専用に QueryClient を持つ。
// (Spartia Capital も同パターンで内蔵 QueryClient を使用)
const firmsQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

// 派生ステータス。CRM clients のリンクから「取引先 / 接触済」を計算する。
// - partner       : リンク先 client が 支援中/準備中/停止中/保留 (= 取引先)
// - crm_contacted : リンク先 client が 中期フォロー/面談予定 (= 接触済 CRM由来)
// - contacted     : cap_ma_agencies.status が 'contacted' (= 接触済 直接)
// - not_contacted : それ以外
const STATUS_STYLE = {
  partner:       { bg: '#E8F0FF',          fg: color.navy,    label: '取引先', dot: color.navy },
  crm_contacted: { bg: color.successSoft,  fg: color.success, label: '接触済', dot: color.success },
  contacted:     { bg: color.successSoft,  fg: color.success, label: '接触済', dot: color.success },
  not_contacted: { bg: color.gray50,       fg: color.textMid, label: '未接触', dot: color.textMid },
}

// CRM clients.status → 派生ステータス
const CRM_PARTNER_STATUSES = new Set(['支援中', '準備中', '停止中', '保留'])
const CRM_CONTACTED_STATUSES = new Set(['中期フォロー', '面談予定'])

// 1機関について、CRM リンクと cap_ma_agencies.status から派生ステータスを返す。
function deriveStatus(agency) {
  const cs = agency?.linked_client?.status
  if (cs && CRM_PARTNER_STATUSES.has(cs)) return 'partner'
  if (cs && CRM_CONTACTED_STATUSES.has(cs)) return 'crm_contacted'
  if (agency?.status === 'contacted') return 'contacted'
  return 'not_contacted'
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

// 地方プリセット（複数都道府県を一括選択するためのショートカット）
const PREF_PRESETS = [
  { label: '首都圏', prefs: ['東京都','神奈川県','千葉県','埼玉県'] },
  { label: '関西',   prefs: ['大阪府','京都府','兵庫県','奈良県','滋賀県','和歌山県'] },
  { label: '東海',   prefs: ['愛知県','岐阜県','三重県','静岡県'] },
  { label: '北海道・東北', prefs: ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県'] },
  { label: '北陸甲信越', prefs: ['新潟県','富山県','石川県','福井県','山梨県','長野県'] },
  { label: '中国',   prefs: ['鳥取県','島根県','岡山県','広島県','山口県'] },
  { label: '四国',   prefs: ['徳島県','香川県','愛媛県','高知県'] },
  { label: '九州・沖縄', prefs: ['福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'] },
]

const PAGE_SIZE = 50

export default function MaspFirmsView() {
  return (
    <QueryClientProvider client={firmsQueryClient}>
      <MaspFirmsViewInner />
    </QueryClientProvider>
  )
}

function MaspFirmsViewInner() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const userId = profile?.id || null
  const orgId = profile?.org_id || null
  const [search, setSearch] = useState('')
  // Step 2: 複数キーワード + AND/OR 切替（search はメインの企業名検索用に残す）
  const [keywordInput, setKeywordInput] = useState('')
  const [keywords, setKeywords] = useState([]) // string[]
  const [keywordLogic, setKeywordLogic] = useState('AND') // 'AND' | 'OR'
  // ステータスは複数選択 (取引先 / 接触済 / 未接触 を任意に組み合わせ)
  const [filterStatuses, setFilterStatuses] = useState([])
  // 都道府県は複数選択 (Database と同等。プリセットで一括追加可能)
  const [filterPrefs, setFilterPrefs] = useState([])
  const [filterFeeType, setFilterFeeType] = useState('')
  // Step 2: 手数料項目細分化（FA/仲介 × 譲渡側/譲受側 個別）
  const [filterFaSeller, setFilterFaSeller] = useState('') // '' | 'yes' | 'no'
  const [filterFaBuyer, setFilterFaBuyer] = useState('')
  const [filterBrokerSeller, setFilterBrokerSeller] = useState('')
  const [filterBrokerBuyer, setFilterBrokerBuyer] = useState('')
  const [filterStaffMin, setFilterStaffMin] = useState('')
  const [filterStaffMax, setFilterStaffMax] = useState('')
  const [excludeStaffNull, setExcludeStaffNull] = useState(false)
  // 連絡先有無 ('' / 'email' / 'form' / 'any' / 'none')
  const [filterContact, setFilterContact] = useState('')
  const [sortKey, setSortKey] = useState('name_asc')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastBody, setBroadcastBody] = useState('')
  const [selectAll, setSelectAll] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  // 全件バックフィル用
  const [backfillRunning, setBackfillRunning] = useState(false)
  const [backfillTotal, setBackfillTotal] = useState(0)
  const [backfillDone, setBackfillDone] = useState(0)
  const [backfillCancelled, setBackfillCancelled] = useState(false)
  const backfillCancelRef = useRef(false)
  useEffect(() => { backfillCancelRef.current = backfillCancelled }, [backfillCancelled])
  const [editingContact, setEditingContact] = useState(null)
  const [editForm, setEditForm] = useState({})
  // AI チャットパネル
  const [showAiChat, setShowAiChat] = useState(false)
  // AI 適用後のヒット件数フィードバック { id, count }
  // id が増えるたびに「AI が新たに適用した」とみなし、count は次の effect で filtered.length を測定
  const [aiSession, setAiSession] = useState({ id: 0, count: null })
  // 保存検索
  const [savedSearches, setSavedSearches] = useState([])
  const [showSavedSearches, setShowSavedSearches] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveDialogName, setSaveDialogName] = useState('')

  const { data: allAgencies = [], isLoading } = useQuery({
    queryKey: ['ma-agencies'],
    queryFn: async () => {
      let all = []; let from = 0; const step = 1000
      while (true) {
        const { data } = await supabase
          .from('cap_ma_agencies')
          .select('*, linked_client:clients(id, name, status)')
          .range(from, from + step - 1)
          .order('name')
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
    if (keywords.length > 0) {
      const lower = keywords.map(k => k.toLowerCase())
      list = list.filter(a => {
        const hay = (a.name + ' ' + (a.prefecture || '')).toLowerCase()
        if (keywordLogic === 'AND') return lower.every(k => hay.includes(k))
        return lower.some(k => hay.includes(k))
      })
    }
    if (filterStatuses.length > 0) {
      // 複数選択 OR フィルタ。例: ['contacted', 'partner'] → 接触済 + 取引先
      const want = new Set(filterStatuses)
      list = list.filter(a => {
        const ds = deriveStatus(a)
        if (want.has('partner') && ds === 'partner') return true
        if (want.has('contacted') && (ds === 'contacted' || ds === 'crm_contacted')) return true
        if (want.has('not_contacted') && ds === 'not_contacted') return true
        return false
      })
    }
    if (filterPrefs.length > 0) {
      const set = new Set(filterPrefs)
      list = list.filter(a => set.has(a.prefecture))
    }
    // 旧 filterFeeType (FA / 仲介の大枠) と、新しい個別細分化フィルタを併用可能。
    if (filterFeeType === 'fa') list = list.filter(a => a.fa_seller_success_fee === '有り' || a.fa_buyer_success_fee === '有り')
    if (filterFeeType === 'broker') list = list.filter(a => a.broker_seller_success_fee === '有り' || a.broker_buyer_success_fee === '有り')
    const matchYesNo = (val, mode) => {
      if (mode === 'yes') return val === '有り'
      if (mode === 'no') return val !== '有り'
      return true
    }
    if (filterFaSeller) list = list.filter(a => matchYesNo(a.fa_seller_success_fee, filterFaSeller))
    if (filterFaBuyer) list = list.filter(a => matchYesNo(a.fa_buyer_success_fee, filterFaBuyer))
    if (filterBrokerSeller) list = list.filter(a => matchYesNo(a.broker_seller_success_fee, filterBrokerSeller))
    if (filterBrokerBuyer) list = list.filter(a => matchYesNo(a.broker_buyer_success_fee, filterBrokerBuyer))
    if (excludeStaffNull) list = list.filter(a => a.staff_count != null)
    if (filterStaffMin) list = list.filter(a => (a.staff_count || 0) >= Number(filterStaffMin))
    if (filterStaffMax) list = list.filter(a => (a.staff_count || 0) <= Number(filterStaffMax))
    if (filterContact === 'email') list = list.filter(a => !!a.contact_email)
    else if (filterContact === 'form') list = list.filter(a => !!a.contact_form_url && !a.contact_email)
    else if (filterContact === 'any') list = list.filter(a => a.contact_email || a.contact_form_url)
    else if (filterContact === 'none') list = list.filter(a => !a.contact_email && !a.contact_form_url)
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
  }, [allAgencies, search, keywords, keywordLogic, filterStatuses, filterPrefs, filterFeeType, filterFaSeller, filterFaBuyer, filterBrokerSeller, filterBrokerBuyer, filterStaffMin, filterStaffMax, excludeStaffNull, filterContact, sortKey])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const stats = (() => {
    let partner = 0, contacted = 0, notContacted = 0
    for (const a of allAgencies) {
      const ds = deriveStatus(a)
      if (ds === 'partner') partner++
      else if (ds === 'contacted' || ds === 'crm_contacted') contacted++
      else notContacted++
    }
    return { total: allAgencies.length, partner, contacted, notContacted }
  })()

  async function updateStatus(id, status) {
    await supabase.from('cap_ma_agencies').update({ status, contacted_at: status !== 'not_contacted' ? new Date().toISOString() : null }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['ma-agencies'] })
  }
  function toggleSelect(id) { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  function toggleSelectAll() { if (selectAll) setSelectedIds(new Set()); else setSelectedIds(new Set(paged.map(a => a.id))); setSelectAll(!selectAll) }
  function clearFilters() {
    setSearch('')
    setKeywordInput(''); setKeywords([]); setKeywordLogic('AND')
    setFilterStatuses([]); setFilterPrefs([])
    setFilterFeeType('')
    setFilterFaSeller(''); setFilterFaBuyer(''); setFilterBrokerSeller(''); setFilterBrokerBuyer('')
    setFilterStaffMin(''); setFilterStaffMax(''); setExcludeStaffNull(false)
    setFilterContact('')
    setPage(1)
  }
  function addKeyword() {
    const k = keywordInput.trim()
    if (!k) return
    if (keywords.includes(k)) { setKeywordInput(''); return }
    setKeywords([...keywords, k]); setKeywordInput(''); setPage(1)
  }
  function removeKeyword(k) { setKeywords(keywords.filter(x => x !== k)); setPage(1) }
  // 詳細検索パネルの何かが入っているか
  const hasAnyFilter = !!(filterStatuses.length > 0 || filterPrefs.length > 0 || filterFeeType
    || filterFaSeller || filterFaBuyer || filterBrokerSeller || filterBrokerBuyer
    || filterStaffMin || filterStaffMax || excludeStaffNull || filterContact || keywords.length > 0)
  function toggleStatusFilter(s) {
    setFilterStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
    setPage(1)
  }

  function togglePref(p) {
    setFilterPrefs(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
    setPage(1)
  }
  function applyPrefPreset(prefs) {
    setFilterPrefs(prev => {
      // すべて含まれていたら解除、そうでなければ和集合
      const allIncluded = prefs.every(p => prev.includes(p))
      if (allIncluded) return prev.filter(p => !prefs.includes(p))
      return [...new Set([...prev, ...prefs])]
    })
    setPage(1)
  }

  function exportCsv() {
    if (filtered.length === 0) {
      alert('出力対象の支援機関がありません')
      return
    }
    const filename = `M&A支援機関_${todayJST()}.csv`
    downloadCsv(filename, filtered, CSV_COLUMNS)
  }

  // AI チャットへ渡す現在の手動フィルタ
  const aiCurrentFilters = {
    keywords, logic: keywordLogic,
    prefectures: filterPrefs,
    staffMin: filterStaffMin ? Number(filterStaffMin) : null,
    staffMax: filterStaffMax ? Number(filterStaffMax) : null,
    excludeStaffNull,
    feeFaSeller: filterFaSeller, feeFaBuyer: filterFaBuyer,
    feeBrokerSeller: filterBrokerSeller, feeBrokerBuyer: filterBrokerBuyer,
    statuses: filterStatuses,
    contact: filterContact,
  }

  function applyAi(aiFilters) {
    applyAiFiltersToAgencyState(aiFilters, {
      setKeywords, setKeywordLogic,
      setFilterPrefs, setFilterStaffMin, setFilterStaffMax, setExcludeStaffNull,
      setFilterFaSeller, setFilterFaBuyer, setFilterBrokerSeller, setFilterBrokerBuyer,
      setFilterStatuses,
      setFilterContact,
      setPage, setSelectedIds, setSelectAll,
    })
    // 詳細検索も自動展開
    setShowAdvanced(true)
    // AI 適用イベントを発火 (count は次の effect で測定)
    setAiSession(prev => ({ id: prev.id + 1, count: null }))
  }

  // AI 適用後のヒット件数を測定 (filtered useMemo 再計算後に確定する)
  useEffect(() => {
    if (aiSession.id > 0 && aiSession.count === null) {
      setAiSession(prev => ({ ...prev, count: filtered.length }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSession.id])

  // 保存検索を起動時に取得
  useEffect(() => {
    if (!userId) return
    listSavedSearches(userId).then(setSavedSearches).catch(e => console.warn('[MaspFirmsView] listSavedSearches failed', e))
  }, [userId])

  function currentSearchSnapshot() {
    return {
      keywords, logic: keywordLogic,
      prefectures: filterPrefs,
      staffMin: filterStaffMin ? Number(filterStaffMin) : null,
      staffMax: filterStaffMax ? Number(filterStaffMax) : null,
      excludeStaffNull,
      feeFaSeller: filterFaSeller, feeFaBuyer: filterFaBuyer,
      feeBrokerSeller: filterBrokerSeller, feeBrokerBuyer: filterBrokerBuyer,
      statuses: filterStatuses,
      contact: filterContact,
      sortKey,
    }
  }
  async function handleSaveSearch() {
    const name = saveDialogName.trim()
    if (!name || !userId || !orgId) return
    try {
      const saved = await saveSearch(orgId, userId, name, currentSearchSnapshot())
      setSavedSearches(prev => [saved, ...prev])
      setShowSaveDialog(false); setSaveDialogName('')
    } catch (e) {
      alert('保存に失敗しました: ' + (e.message || e))
    }
  }
  function applySavedSearch(s) {
    // saved.filters は currentSearchSnapshot と同じシェイプ
    applyAiFiltersToAgencyState(s.filters, {
      setKeywords, setKeywordLogic,
      setFilterPrefs, setFilterStaffMin, setFilterStaffMax, setExcludeStaffNull,
      setFilterInfoSharing,
      setFilterFaSeller, setFilterFaBuyer, setFilterBrokerSeller, setFilterBrokerBuyer,
      setFilterStatuses, setFilterContact,
      setPage, setSelectedIds, setSelectAll,
    })
    if (s.filters?.sortKey) setSortKey(s.filters.sortKey)
    setShowSavedSearches(false)
    setShowAdvanced(true)
  }
  async function handleDeleteSavedSearch(id) {
    if (!confirm('この保存検索を削除しますか？')) return
    try {
      await deleteSavedSearch(id)
      setSavedSearches(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      alert('削除に失敗しました: ' + (e.message || e))
    }
  }

  async function lookupContacts() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setLookingUp(true)
    try {
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

  // 連絡先 (電話番号 or メアド or HP) が一切ない機関を全件 AI バックフィル
  async function backfillAllContacts() {
    // 対象: contact_phone も website もメールもフォームも全部 NULL の機関
    const targets = allAgencies.filter(a =>
      !a.contact_phone && !a.contact_email && !a.contact_form_url && !a.website
    )
    if (targets.length === 0) {
      alert('連絡先未取得の機関はありません')
      return
    }
    if (!confirm(
      `連絡先未取得 ${targets.length}社 を AI で一括取得します。\n` +
      `20社/回 × ${Math.ceil(targets.length / 20)}回 で約 ${Math.ceil(targets.length / 20 * 5)}秒〜${Math.ceil(targets.length / 20 * 15)}秒 かかります。\n` +
      `処理中はこのページを閉じないでください。\n\n実行しますか？`
    )) return
    setBackfillRunning(true)
    setBackfillTotal(targets.length)
    setBackfillDone(0)
    setBackfillCancelled(false)
    let updatedTotal = 0
    try {
      for (let i = 0; i < targets.length; i += 20) {
        if (backfillCancelRef.current) break
        const batch = targets.slice(i, i + 20).map(a => a.id)
        try {
          const { data } = await supabase.functions.invoke('lookup-agency-contact', { body: { agency_ids: batch } })
          if (data?.updated) updatedTotal += data.updated
        } catch (e) {
          console.warn('[backfill] batch failed', e)
        }
        setBackfillDone(d => d + batch.length)
      }
      qc.invalidateQueries({ queryKey: ['ma-agencies'] })
      alert(`バックフィル完了: ${updatedTotal}社の連絡先情報を更新しました (対象${targets.length}社中)`)
    } finally {
      setBackfillRunning(false)
    }
  }
  function cancelBackfill() {
    backfillCancelRef.current = true
    setBackfillCancelled(true)
  }

  function openBroadcast() {
    const needText = needs.length > 0 ? needs.map(n => `- ${n.industry_label || '業種未指定'}`).join('\n') : '（買収ニーズを登録してください）'
    setBroadcastBody(`お世話になっております。\nM&Aソーシングパートナーズ株式会社と申します。\n\n弊社では現在、以下の条件での買収案件を探しております。\n\n${needText}\n\nご案件がございましたら、ぜひご紹介いただけますと幸いです。\n何卒よろしくお願いいたします。`)
    setShowBroadcast(true)
  }

  async function sendBroadcast() {
    const selected = allAgencies.filter(a => selectedIds.has(a.id))
    const withEmail = selected.filter(a => a.status === 'contacted' && a.contact_email)
    const withForm = selected.filter(a => a.status === 'not_contacted' && a.contact_form_url)
    const noContact = selected.filter(a => !a.contact_email && !a.contact_form_url)

    await supabase.from('cap_need_broadcasts').insert({
      subject: `【買収ニーズ配信】${selected.length}社`,
      body: broadcastBody,
      sent_to: selected.map(a => ({ agency_id: a.id, name: a.name, method: a.contact_email ? 'email' : 'form' })),
      sent_at: new Date().toISOString(),
    })

    logAudit({
      action: 'broadcast_send', resourceType: 'broadcast',
      resourceName: `買収ニーズ配信 ${selected.length}社`,
      metadata: { total: selected.length, with_email: withEmail.length, with_form: withForm.length, no_contact: noContact.length },
    })

    if (withEmail.length > 0) {
      const emails = withEmail.map(a => a.contact_email).join(',')
      const subject = encodeURIComponent('【買収ニーズのご案内】M&Aソーシングパートナーズ')
      const body = encodeURIComponent(broadcastBody)
      window.open(`mailto:${emails}?subject=${subject}&body=${body}`, '_blank')
    }

    if (withForm.length > 0) {
      const toOpen = withForm.slice(0, 10)
      for (const a of toOpen) {
        window.open(a.contact_form_url, '_blank')
      }
      if (withForm.length > 10) {
        alert(`問い合わせフォームは最初の10件を開きました。残り${withForm.length - 10}件は順次開いてください。`)
      }
    }

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

  async function saveContact() {
    if (!editingContact) return
    await supabase.from('cap_ma_agencies').update({
      contact_email: editForm.email || null,
      contact_form_url: editForm.form_url || null,
      website: editForm.website || null,
      contact_name: editForm.contact_name || null,
      contact_phone: editForm.phone || null,
    }).eq('id', editingContact)
    qc.invalidateQueries({ queryKey: ['ma-agencies'] })
    setEditingContact(null)
  }

  const selectStyle = { height: 32, padding: '0 8px', background: color.white, border: `0.5px solid ${color.border}`, borderRadius: radius.lg, fontSize: font.size.sm, outline: 'none', color: color.navy }
  const th = { fontSize: 10, fontWeight: font.weight.medium, padding: '6px 4px', textAlign: 'center', lineHeight: 1.3 }
  const td = { fontSize: font.size.xs, color: color.navy, padding: '6px 4px', textAlign: 'center', borderBottom: `0.5px solid ${color.borderLight}` }

  function Pager() {
    const pBtn = { padding: '3px 7px', border: `0.5px solid ${color.border}`, borderRadius: radius.md, background: color.white, fontSize: font.size.xs, cursor: 'pointer', color: color.textMid }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        <button onClick={() => setPage(1)} disabled={page===1} style={pBtn}>«</button>
        <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={pBtn}>‹</button>
        {Array.from({length: Math.min(7, totalPages)}, (_, i) => {
          let p = page <= 4 ? i+1 : page >= totalPages-3 ? totalPages-6+i : page-3+i
          if (p < 1 || p > totalPages) return null
          return <button key={p} onClick={() => setPage(p)} style={{ padding: '3px 9px', border: p===page ? 'none' : `0.5px solid ${color.border}`, borderRadius: radius.md, background: p===page ? color.navy : color.white, color: p===page ? color.white : color.textMid, fontSize: font.size.xs, cursor: 'pointer', fontWeight: p===page ? font.weight.semibold : font.weight.normal }}>{p}</button>
        })}
        {totalPages > 7 && page < totalPages - 3 && <span style={{ color: color.textMid, fontSize: font.size.xs }}>…</span>}
        {totalPages > 7 && page < totalPages - 3 && <button onClick={() => setPage(totalPages)} style={{ padding: '3px 9px', border: `0.5px solid ${color.border}`, borderRadius: radius.md, background: color.white, fontSize: font.size.xs, cursor: 'pointer', color: color.textMid }}>{totalPages}</button>}
        <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} style={pBtn}>›</button>
        <button onClick={() => setPage(totalPages)} disabled={page===totalPages||totalPages===0} style={pBtn}>»</button>
      </div>
    )
  }

  const selectedAgencies = allAgencies.filter(a => selectedIds.has(a.id))
  const selWithEmail = selectedAgencies.filter(a => a.contact_email)
  const selWithForm = selectedAgencies.filter(a => a.contact_form_url && !a.contact_email)
  const selNoContact = selectedAgencies.filter(a => !a.contact_email && !a.contact_form_url)

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        bleed={false}
        eyebrow="MASP · Firms"
        title="M&A支援機関データベース"
        description={`${filtered.length === stats.total
          ? `${(page-1)*PAGE_SIZE+1}〜${Math.min(page*PAGE_SIZE, filtered.length)}件を表示中（全${stats.total}件）`
          : `${filtered.length}件該当（全${stats.total}件）`}　取引先 ${stats.partner}社　接触済 ${stats.contacted}社　未接触 ${stats.notContacted}社`}
        style={{ marginBottom: space[4] }}
        right={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowAiChat(true)}>
              AIで検索
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSavedSearches(true)}>
              保存検索 ({savedSearches.length})
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              CSV出力 ({filtered.length}件)
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={backfillAllContacts}
              loading={backfillRunning}
              disabled={backfillRunning}
              title="連絡先 (HP/メール/フォーム/電話番号) が一切ない機関を AI で一括取得"
            >
              {backfillRunning
                ? `取得中 ${backfillDone}/${backfillTotal}`
                : '未取得の連絡先を全件AI取得'}
            </Button>
            {selectedIds.size > 0 && (
              <>
                <Button variant="secondary" size="sm" onClick={lookupContacts} loading={lookingUp} disabled={lookingUp}>
                  {lookingUp ? 'AI取得中...' : `${selectedIds.size}社の連絡先を取得`}
                </Button>
                <Button size="sm" onClick={openBroadcast}>
                  {selectedIds.size}社に配信
                </Button>
              </>
            )}
          </>
        }
      />

      {/* バックフィル進捗バー */}
      {backfillRunning && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: space[3],
          padding: `${space[2]}px ${space[3]}px`,
          marginBottom: space[3],
          background: alpha(color.navyLight, 0.06),
          border: `0.5px solid ${color.border}`,
          borderRadius: radius.md,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 4 }}>
              連絡先 AI バックフィル中: {backfillDone} / {backfillTotal} 社
              ({backfillTotal > 0 ? Math.round(backfillDone / backfillTotal * 100) : 0}%)
              {backfillCancelled && ' — キャンセル中、現在のバッチ完了で停止します'}
            </div>
            <div style={{ height: 6, background: color.gray50, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${backfillTotal > 0 ? backfillDone / backfillTotal * 100 : 0}%`,
                background: color.navy, transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={cancelBackfill} disabled={backfillCancelled}>
            キャンセル
          </Button>
        </div>
      )}

      {/* 検索バー */}
      <div style={{ display: 'flex', gap: space[2], marginBottom: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          size="sm"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="企業名/事業所名"
          fullWidth={false}
          containerStyle={{ width: 220 }}
        />
        <Input
          size="sm"
          value={keywordInput}
          onChange={e => setKeywordInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
          placeholder="キーワード追加 (Enter)"
          fullWidth={false}
          containerStyle={{ width: 200 }}
        />
        <Select
          size="sm"
          value={keywordLogic}
          onChange={e => setKeywordLogic(e.target.value)}
          options={[{ value: 'AND', label: 'すべて含む (AND)' }, { value: 'OR', label: 'いずれかを含む (OR)' }]}
          fullWidth={false}
          containerStyle={{ minWidth: 170 }}
        />
        <Button
          variant={showAdvanced ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '✕ 詳細検索を閉じる' : '詳細検索'}
        </Button>
        {hasAnyFilter && (
          <>
            <Button variant="ghost" size="sm" onClick={() => { setSaveDialogName(''); setShowSaveDialog(true) }}>
              この条件を保存
            </Button>
            <Button variant="ghost" size="sm" onClick={clearFilters} style={{ color: color.danger }}>
              クリア
            </Button>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space[1.5] }}>
          <span style={{ fontSize: font.size.xs, color: color.textMid }}>並び替え</span>
          <Select
            size="sm"
            value={sortKey}
            onChange={e => { setSortKey(e.target.value); setPage(1) }}
            options={SORT_OPTIONS}
            fullWidth={false}
            containerStyle={{ minWidth: 280 }}
          />
        </div>
      </div>

      {/* キーワードチップ */}
      {keywords.length > 0 && (
        <div style={{ display: 'flex', gap: space[1], marginBottom: space[2.5], flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: font.size.xs, color: color.textMid }}>{keywordLogic === 'AND' ? 'すべて含む:' : 'いずれかを含む:'}</span>
          {keywords.map(k => (
            <span key={k} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: radius.pill,
              background: alpha(color.navyLight, 0.08), color: color.navy,
              fontSize: font.size.xs, fontWeight: font.weight.medium,
            }}>
              {k}
              <button onClick={() => removeKeyword(k)} style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: color.textMid, fontSize: font.size.xs, padding: 0, lineHeight: 1,
              }}>✕</button>
            </span>
          ))}
        </div>
      )}

      {/* 詳細検索 */}
      {showAdvanced && (
        <Card padding="md" style={{ marginBottom: space[4] }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px' }}>
            <div>
              <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.medium, marginBottom: 6 }}>
                ステータス {filterStatuses.length > 0 && (
                  <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.normal, marginLeft: 6 }}>
                    ({filterStatuses.length}選択中)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[
                  { value: 'not_contacted', label: '未接触', style: STATUS_STYLE.not_contacted },
                  { value: 'contacted',     label: '接触済', style: STATUS_STYLE.contacted },
                  { value: 'partner',       label: '取引先', style: STATUS_STYLE.partner },
                ].map(opt => {
                  const sel = filterStatuses.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleStatusFilter(opt.value)}
                      style={{
                        padding: '4px 12px', borderRadius: radius.pill,
                        border: `0.5px solid ${sel ? opt.style.fg : color.border}`,
                        background: sel ? opt.style.bg : color.white,
                        color: sel ? opt.style.fg : color.textMid,
                        fontSize: font.size.xs, fontWeight: sel ? font.weight.semibold : font.weight.normal,
                        cursor: 'pointer',
                      }}
                    >{opt.label}</button>
                  )
                })}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.medium }}>
                  本店所在都道府県 {filterPrefs.length > 0 && (
                    <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.normal, marginLeft: 6 }}>
                      ({filterPrefs.length}選択中)
                    </span>
                  )}
                </div>
                {filterPrefs.length > 0 && (
                  <button
                    onClick={() => { setFilterPrefs([]); setPage(1) }}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: color.danger, fontSize: font.size.xs,
                    }}
                  >
                    すべて解除
                  </button>
                )}
              </div>
              {/* 地方プリセット */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {PREF_PRESETS.map(preset => {
                  const allIn = preset.prefs.every(p => filterPrefs.includes(p))
                  return (
                    <button
                      key={preset.label}
                      onClick={() => applyPrefPreset(preset.prefs)}
                      style={{
                        padding: '3px 10px', borderRadius: radius.pill,
                        border: `0.5px solid ${allIn ? color.navy : color.border}`,
                        background: allIn ? color.navy : color.white,
                        color: allIn ? color.white : color.navy,
                        fontSize: font.size.xs, fontWeight: font.weight.medium, cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
              {/* 都道府県 オートコンプリート入力 */}
              <PrefAutocomplete
                available={PREFS.filter(p => !filterPrefs.includes(p))}
                onAdd={(p) => togglePref(p)}
              />
              {/* 選択中チップ */}
              {filterPrefs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {filterPrefs.map(p => (
                    <span key={p} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 4px 3px 10px', borderRadius: radius.pill,
                      background: color.navy, color: color.white,
                      fontSize: font.size.xs, fontWeight: font.weight.medium,
                    }}>
                      {p}
                      <button
                        onClick={() => togglePref(p)}
                        style={{
                          width: 16, height: 16, borderRadius: '50%',
                          border: 'none', cursor: 'pointer',
                          background: alpha(color.white, 0.2),
                          color: color.white, fontSize: 10, lineHeight: 1,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0,
                        }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Select
              size="sm"
              label="FA/仲介業務の別"
              value={filterFeeType}
              onChange={e => { setFilterFeeType(e.target.value); setPage(1) }}
              options={[{ value: '', label: 'すべて' }, { value: 'fa', label: 'FA業務あり' }, { value: 'broker', label: '仲介業務あり' }]}
            />
            <Select
              size="sm"
              label="連絡先の有無"
              value={filterContact}
              onChange={e => { setFilterContact(e.target.value); setPage(1) }}
              options={[
                { value: '', label: 'すべて' },
                { value: 'any', label: 'メール or フォームあり' },
                { value: 'email', label: 'メールアドレスあり' },
                { value: 'form', label: 'フォームのみ (メール無)' },
                { value: 'none', label: '連絡先なし' },
              ]}
            />
            <Select
              size="sm"
              label="M&A専従者数（下限）"
              value={filterStaffMin}
              onChange={e => { setFilterStaffMin(e.target.value); setPage(1) }}
              options={[{ value: '', label: '下限なし' }, ...[1,2,3,5,10,20,50,100].map(n => ({ value: String(n), label: `${n}人以上` }))]}
            />
            <Select
              size="sm"
              label="M&A専従者数（上限）"
              value={filterStaffMax}
              onChange={e => { setFilterStaffMax(e.target.value); setPage(1) }}
              options={[{ value: '', label: '上限なし' }, ...[1,2,3,5,10,20,50,100,200].map(n => ({ value: String(n), label: `${n}人以下` }))]}
            />
          </div>

          {/* 手数料体系 個別フィルタ */}
          <div style={{ borderTop: `0.5px solid ${color.border}`, marginTop: space[3], paddingTop: space[3] }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.navy, marginBottom: space[2] }}>
              手数料体系（個別）
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '14px 16px' }}>
              <Select
                size="sm"
                label="FA・譲渡側 成功報酬"
                value={filterFaSeller}
                onChange={e => { setFilterFaSeller(e.target.value); setPage(1) }}
                options={[{ value: '', label: 'すべて' }, { value: 'yes', label: '有り' }, { value: 'no', label: '無し' }]}
              />
              <Select
                size="sm"
                label="FA・譲受側 成功報酬"
                value={filterFaBuyer}
                onChange={e => { setFilterFaBuyer(e.target.value); setPage(1) }}
                options={[{ value: '', label: 'すべて' }, { value: 'yes', label: '有り' }, { value: 'no', label: '無し' }]}
              />
              <Select
                size="sm"
                label="仲介・譲渡側 成功報酬"
                value={filterBrokerSeller}
                onChange={e => { setFilterBrokerSeller(e.target.value); setPage(1) }}
                options={[{ value: '', label: 'すべて' }, { value: 'yes', label: '有り' }, { value: 'no', label: '無し' }]}
              />
              <Select
                size="sm"
                label="仲介・譲受側 成功報酬"
                value={filterBrokerBuyer}
                onChange={e => { setFilterBrokerBuyer(e.target.value); setPage(1) }}
                options={[{ value: '', label: 'すべて' }, { value: 'yes', label: '有り' }, { value: 'no', label: '無し' }]}
              />
            </div>
          </div>

          {/* その他オプション */}
          <div style={{ borderTop: `0.5px solid ${color.border}`, marginTop: space[3], paddingTop: space[3] }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.size.sm, color: color.textDark, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={excludeStaffNull}
                onChange={e => { setExcludeStaffNull(e.target.checked); setPage(1) }}
                style={{ width: 14, height: 14 }}
              />
              M&A専従者数が未登録の機関を除外
            </label>
          </div>
        </Card>
      )}

      <div style={{ marginBottom: space[2.5] }}><Pager /></div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.white }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
          <thead>
            <tr style={{ background: color.navy, color: color.white }}>
              <th rowSpan={3} style={{ ...th, width: 32 }}><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} style={{ width: 13, height: 13 }} /></th>
              <th rowSpan={3} style={{ ...th, width: 36 }}>No</th>
              <th colSpan={3} style={{ ...th, borderBottom: `1px solid ${color.border}`, borderRight: `1px solid ${color.border}` }}>基本情報</th>
              <th colSpan={6} style={{ ...th, borderBottom: `1px solid ${color.border}`, borderRight: `1px solid ${color.border}` }}>手数料体系 — FA</th>
              <th colSpan={6} style={{ ...th, borderBottom: `1px solid ${color.border}`, borderRight: `1px solid ${color.border}` }}>手数料体系 — 仲介</th>
              <th rowSpan={3} style={{ ...th, width: 110 }}>代表者</th>
              <th rowSpan={3} style={{ ...th, width: 110 }}>電話番号</th>
              <th rowSpan={3} style={{ ...th, width: 90 }}>連絡先</th>
              <th rowSpan={3} style={{ ...th, width: 70 }}>ステータス</th>
            </tr>
            <tr style={{ background: color.navy, color: color.white }}>
              <th rowSpan={2} style={{ ...th, minWidth: 180, textAlign: 'left', paddingLeft: 8 }}>支援機関名</th>
              <th rowSpan={2} style={{ ...th, width: 56 }}>本店<br/>所在地</th>
              <th rowSpan={2} style={{ ...th, width: 48, borderRight: `1px solid ${color.border}` }}>M&A<br/>専従<br/>者数</th>
              <th colSpan={4} style={{ ...th, borderBottom: `1px solid ${color.border}`, fontSize: 9 }}>譲渡側</th>
              <th colSpan={2} style={{ ...th, borderBottom: `1px solid ${color.border}`, borderRight: `1px solid ${color.border}`, fontSize: 9 }}>譲受側</th>
              <th colSpan={4} style={{ ...th, borderBottom: `1px solid ${color.border}`, fontSize: 9 }}>譲渡側</th>
              <th colSpan={2} style={{ ...th, borderBottom: `1px solid ${color.border}`, borderRight: `1px solid ${color.border}`, fontSize: 9 }}>譲受側</th>
            </tr>
            <tr style={{ background: color.border, color: color.textDark }}>
              <th style={{ ...th, width: 40 }}>成功<br/>報酬</th><th style={{ ...th, width: 50 }}>算定<br/>方式</th>
              <th style={{ ...th, width: 52 }}>最低<br/>手数料</th><th style={{ ...th, width: 40 }}>その他</th>
              <th style={{ ...th, width: 40 }}>成功<br/>報酬</th><th style={{ ...th, width: 50, borderRight: `1px solid ${color.border}` }}>算定<br/>方式</th>
              <th style={{ ...th, width: 40 }}>成功<br/>報酬</th><th style={{ ...th, width: 50 }}>算定<br/>方式</th>
              <th style={{ ...th, width: 52 }}>最低<br/>手数料</th><th style={{ ...th, width: 40 }}>その他</th>
              <th style={{ ...th, width: 40 }}>成功<br/>報酬</th><th style={{ ...th, width: 50, borderRight: `1px solid ${color.border}` }}>算定<br/>方式</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={20} style={{ ...td, padding: 40, color: color.textMid }}>読み込み中...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={20} style={{ ...td, padding: 40, color: color.textMid }}>該当する機関がありません</td></tr>
            ) : paged.map((a, i) => {
              const derivedSt = deriveStatus(a)
              const ss = STATUS_STYLE[derivedSt] || STATUS_STYLE.not_contacted
              const linkedName = a.linked_client?.name
              const linkedRawStatus = a.linked_client?.status
              const isCrmDerived = derivedSt === 'partner' || derivedSt === 'crm_contacted'
              const rowNum = (page - 1) * PAGE_SIZE + i + 1
              const hasEmail = !!a.contact_email
              const hasForm = !!a.contact_form_url
              return (
                <tr key={a.id} style={{ background: selectedIds.has(a.id) ? alpha(color.navyLight, 0.08) : i % 2 === 0 ? color.white : color.cream }}>
                  <td style={td}><input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)} style={{ width: 13, height: 13 }} /></td>
                  <td style={{ ...td, color: color.textMid }}>{rowNum}</td>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 8, fontWeight: font.weight.medium, color: color.navy, cursor: 'pointer' }}
                    onClick={() => {
                      if (a.website) window.open(a.website, '_blank')
                      else window.open(`https://ma-shienkikan.go.jp/search?sort=corporate_name_kana&corporate_name=${encodeURIComponent(a.name)}`, '_blank')
                    }}>
                    {a.name}
                  </td>
                  <td style={td}>{a.prefecture || ''}</td>
                  <td style={{ ...td, textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${color.borderLight}` }}>
                    {a.staff_count != null ? `${a.staff_count}人` : ''}
                  </td>
                  <td style={td}>{a.fa_seller_success_fee || ''}</td>
                  <td style={td}>{a.fa_seller_calc_method || ''}</td>
                  <td style={td}>{a.fa_seller_min_fee || ''}</td>
                  <td style={td}>{a.fa_seller_other_fee || ''}</td>
                  <td style={td}>{a.fa_buyer_success_fee || ''}</td>
                  <td style={{ ...td, borderRight: `1px solid ${color.borderLight}` }}>{a.fa_buyer_calc_method || ''}</td>
                  <td style={td}>{a.broker_seller_success_fee || ''}</td>
                  <td style={td}>{a.broker_seller_calc_method || ''}</td>
                  <td style={td}>{a.broker_seller_min_fee || ''}</td>
                  <td style={td}>{a.broker_seller_other_fee || ''}</td>
                  <td style={td}>{a.broker_buyer_success_fee || ''}</td>
                  <td style={{ ...td, borderRight: `1px solid ${color.borderLight}` }}>{a.broker_buyer_calc_method || ''}</td>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 8, fontSize: font.size.xs }}>
                    {a.contact_name || <span style={{ color: color.textLight }}>—</span>}
                  </td>
                  <td style={{ ...td, fontFamily: font.family.mono, fontSize: font.size.xs }}>
                    {a.contact_phone
                      ? <a href={`tel:${a.contact_phone}`} style={{ color: color.navy, textDecoration: 'none' }}>{a.contact_phone}</a>
                      : <span style={{ color: color.textLight }}>—</span>}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
                      {hasEmail && <span title={a.contact_email} style={{ fontSize: 9, background: color.successSoft, color: color.success, padding: '1px 4px', borderRadius: radius.sm, cursor: 'pointer' }}
                        onClick={() => window.open(`mailto:${a.contact_email}`, '_blank')}>Mail</span>}
                      {hasForm && <span title={a.contact_form_url} style={{ fontSize: 9, background: color.gray50, color: color.navy, padding: '1px 4px', borderRadius: radius.sm, cursor: 'pointer' }}
                        onClick={() => window.open(a.contact_form_url, '_blank')}>Form</span>}
                      <span style={{ fontSize: 9, color: color.textMid, cursor: 'pointer', padding: '1px 3px' }}
                        onClick={() => { setEditingContact(a.id); setEditForm({ email: a.contact_email || '', form_url: a.contact_form_url || '', website: a.website || '', contact_name: a.contact_name || '', phone: a.contact_phone || '' }) }}
                        title="編集">✎</span>
                    </div>
                  </td>
                  <td style={td}>
                    {isCrmDerived ? (
                      <span
                        title={`CRM: ${linkedName || '(unknown)'} / ${linkedRawStatus || ''}`}
                        style={{
                          display: 'inline-block', padding: '2px 8px', fontSize: 10,
                          border: `0.5px solid ${ss.fg}`, borderRadius: radius.sm,
                          background: ss.bg, color: ss.fg, fontWeight: font.weight.semibold,
                        }}
                      >{ss.label}</span>
                    ) : (
                      <select value={a.status} onChange={e => updateStatus(a.id, e.target.value)}
                        style={{ height: 24, padding: '0 4px', fontSize: 10, border: `0.5px solid ${ss.bg}`, borderRadius: radius.sm, background: ss.bg, color: ss.fg, outline: 'none', cursor: 'pointer' }}>
                        <option value="not_contacted">未接触</option><option value="contacted">接触済</option>
                      </select>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: space[2.5] }}><Pager /></div>

      {/* 連絡先編集モーダル */}
      {editingContact && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditingContact(null) }}
          style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.5), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: color.white, borderRadius: radius.lg, padding: space[6], width: 420, boxShadow: shadow.xl }}>
            <h3 style={{ fontSize: font.size.md, fontWeight: font.weight.medium, color: color.navy, marginBottom: space[4] }}>連絡先を編集</h3>
            {[['代表者', 'contact_name', 'text'], ['電話番号', 'phone', 'tel'], ['メールアドレス', 'email', 'email'], ['問い合わせフォームURL', 'form_url', 'url'], ['ウェブサイト', 'website', 'url']].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom: space[3] }}>
                <Input
                  size="sm"
                  label={label}
                  type={type}
                  value={editForm[key] || ''}
                  onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: space[2.5], marginTop: space[4] }}>
              <Button variant="outline" fullWidth onClick={() => setEditingContact(null)}>キャンセル</Button>
              <Button variant="primary" fullWidth onClick={saveContact}>保存</Button>
            </div>
          </div>
        </div>
      )}

      {/* 配信モーダル */}
      {showBroadcast && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowBroadcast(false) }}
          style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.5), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: color.white, borderRadius: radius.lg, padding: space[6], width: 620, maxHeight: '85vh', overflowY: 'auto', boxShadow: shadow.xl }}>
            <h2 style={{ fontSize: font.size.lg, fontWeight: font.weight.medium, color: color.navy, marginBottom: space[1] }}>買収ニーズ配信</h2>
            <p style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[4] }}>選択した {selectedIds.size} 社に配信します</p>

            {/* 配信方法の内訳 */}
            <div style={{ background: color.gray50, border: `0.5px solid ${color.border}`, borderRadius: radius.xl, padding: space[3], marginBottom: space[4] }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.navy, marginBottom: space[2] }}>配信方法の内訳</div>
              <div style={{ display: 'flex', gap: space[4], fontSize: font.size.sm }}>
                <div style={{ color: color.success }}>メール送信: {selWithEmail.length}社</div>
                <div style={{ color: color.navy }}>フォーム: {selWithForm.length}社</div>
                {selNoContact.length > 0 && <div style={{ color: color.danger }}>連絡先なし: {selNoContact.length}社</div>}
              </div>
              {selNoContact.length > 0 && (
                <div style={{ fontSize: font.size.xs, color: color.warn, marginTop: space[1.5], background: color.warnSoft, padding: '6px 10px', borderRadius: radius.md }}>
                  連絡先未取得の{selNoContact.length}社は配信されません。先に「連絡先を取得」ボタンでAI取得してください。
                </div>
              )}
            </div>

            <div style={{ marginBottom: space[3] }}>
              <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>メール本文（メール送信・フォーム入力用）</div>
              <textarea value={broadcastBody} onChange={e => setBroadcastBody(e.target.value)} rows={10}
                style={{ width: '100%', padding: '10px 12px', border: `0.5px solid ${color.border}`, borderRadius: radius.lg, fontSize: font.size.base, outline: 'none', resize: 'vertical', lineHeight: 1.8, color: color.textDark, fontFamily: font.family.sans, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: space[2.5] }}>
              <Button variant="outline" fullWidth onClick={() => setShowBroadcast(false)}>キャンセル</Button>
              <Button variant="primary" fullWidth onClick={sendBroadcast}>配信する</Button>
            </div>
          </div>
        </div>
      )}

      {/* AI チャットドロワー */}
      <AgencyChatPanel
        open={showAiChat}
        onClose={() => setShowAiChat(false)}
        currentFilters={aiCurrentFilters}
        onApply={applyAi}
        aiSession={aiSession}
        userId={userId}
        orgId={orgId}
      />

      {/* 保存検索一覧モーダル */}
      {showSavedSearches && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowSavedSearches(false) }}
          style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.5), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: color.white, borderRadius: radius.lg, padding: space[6], width: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: shadow.xl }}>
            <h3 style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[3] }}>
              保存した検索条件
            </h3>
            {savedSearches.length === 0 ? (
              <p style={{ fontSize: font.size.sm, color: color.textMid }}>
                保存した条件はまだありません。詳細検索で条件を入れた後「この条件を保存」ボタンを押すと、ここに表示されます。
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {savedSearches.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${space[2]}px ${space[3]}px`,
                    border: `0.5px solid ${color.border}`, borderRadius: radius.md,
                    background: color.white,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.medium }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>
                        {new Date(s.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="sm" variant="primary" onClick={() => applySavedSearch(s)}>適用</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteSavedSearch(s.id)} style={{ color: color.danger }}>削除</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space[3] }}>
              <Button variant="outline" size="sm" onClick={() => setShowSavedSearches(false)}>閉じる</Button>
            </div>
          </div>
        </div>
      )}

      {/* 検索条件保存ダイアログ */}
      {showSaveDialog && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowSaveDialog(false) }}
          style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.5), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: color.white, borderRadius: radius.lg, padding: space[6], width: 400, boxShadow: shadow.xl }}>
            <h3 style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy, marginBottom: space[3] }}>
              この検索条件を保存
            </h3>
            <Input
              label="名前"
              value={saveDialogName}
              onChange={e => setSaveDialogName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveSearch() }}
              placeholder="例: 関西の中堅FA、首都圏未接触機関"
              autoFocus
            />
            <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
              <Button variant="outline" fullWidth onClick={() => setShowSaveDialog(false)}>キャンセル</Button>
              <Button variant="primary" fullWidth onClick={handleSaveSearch} disabled={!saveDialogName.trim()}>保存</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 都道府県オートコンプリート (テキスト入力 + サジェスト ドロップダウン)
function PrefAutocomplete({ available, onAdd }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapRef = useRef(null)

  const filtered = useMemo(() => {
    const query = q.trim()
    if (!query) return available.slice(0, 12)
    return available.filter(p => p.includes(query)).slice(0, 12)
  }, [available, q])

  // 外側クリックで閉じる
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function pick(p) {
    onAdd(p)
    setQ('')
    setActiveIndex(0)
    // ドロップダウンは開いたまま (連続選択しやすい)
  }

  function onKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(filtered.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIndex]) pick(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); setActiveIndex(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="都道府県を入力 (例: 東 / 愛知)"
        style={{
          width: '100%', boxSizing: 'border-box',
          height: 32, padding: '0 10px',
          border: `0.5px solid ${color.border}`, borderRadius: radius.md,
          fontSize: font.size.sm, fontFamily: font.family.sans,
          color: color.textDark, background: color.white,
          outline: 'none',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, maxHeight: 280, overflowY: 'auto',
          background: color.white, border: `0.5px solid ${color.border}`,
          borderRadius: radius.md, boxShadow: shadow.md, zIndex: 50,
        }}>
          {filtered.map((p, i) => (
            <button
              key={p}
              type="button"
              onMouseDown={e => { e.preventDefault(); pick(p) }}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                display: 'block', width: '100%',
                padding: '6px 10px', textAlign: 'left',
                background: i === activeIndex ? alpha(color.navyLight, 0.08) : color.white,
                color: color.textDark, border: 'none', cursor: 'pointer',
                fontSize: font.size.sm,
              }}
            >{p}</button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && q.trim() && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: color.white, border: `0.5px solid ${color.border}`,
          borderRadius: radius.md, padding: '6px 10px',
          fontSize: font.size.xs, color: color.textLight, zIndex: 50,
        }}>
          該当する都道府県はありません
        </div>
      )}
    </div>
  )
}
