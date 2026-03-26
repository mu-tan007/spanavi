import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getOrgId } from '../lib/orgContext'
import { CALL_RESULTS } from '../constants/callResults'

// モジュールレベルキャッシュ（非Reactコード用）
let _cached = null
let _cacheOrgId = null

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

/**
 * 非Reactコード（supabaseWrite.js等）からステータス定義を取得
 */
export function getCallStatusesSync() {
  return _cached || CALL_RESULTS
}

/**
 * ステータスIDから日本語ラベルを取得（非React用）
 */
export function statusIdToLabel(id) {
  const list = getCallStatusesSync()
  const found = list.find(s => s.id === id)
  return found ? found.label : id
}

/**
 * 共有フック: org_settings から call_statuses を取得
 */
export function useCallStatuses() {
  const [statuses, setStatuses] = useState(_cached || CALL_RESULTS)
  const [loading, setLoading] = useState(!_cached)

  useEffect(() => {
    const orgId = getOrgId()
    // 同一orgのキャッシュがあればスキップ
    if (_cached && _cacheOrgId === orgId) {
      setStatuses(_cached)
      setLoading(false)
      return
    }

    supabase
      .from('org_settings')
      .select('setting_value')
      .eq('org_id', orgId)
      .eq('setting_key', 'call_statuses')
      .single()
      .then(({ data }) => {
        if (data?.setting_value) {
          try {
            const parsed = JSON.parse(data.setting_value)
            if (Array.isArray(parsed) && parsed.length > 0) {
              _cached = parsed
              _cacheOrgId = orgId
              setStatuses(parsed)
            }
          } catch { /* use defaults */ }
        }
        setLoading(false)
      })
  }, [])

  // 派生データ
  const statusMap = useMemo(() => {
    const m = new Map()
    statuses.forEach(s => m.set(s.id, s))
    return m
  }, [statuses])

  const labelMap = useMemo(() => {
    const m = new Map()
    statuses.forEach(s => m.set(s.label, s))
    return m
  }, [statuses])

  const ceoConnectLabels = useMemo(
    () => new Set(statuses.filter(s => s.ceo_connect).map(s => s.label)),
    [statuses]
  )

  const ceoConnectIds = useMemo(
    () => new Set(statuses.filter(s => s.ceo_connect).map(s => s.id)),
    [statuses]
  )

  const shortcuts = useMemo(
    () => statuses.map((s, i) => ({
      key: IS_MAC ? String(i + 1) : `F${i + 1}`,
      id: s.id,
      label: s.label,
    })),
    [statuses]
  )

  const excludedIds = useMemo(
    () => new Set(statuses.filter(s => s.excluded).map(s => s.id)),
    [statuses]
  )

  // ラベルまたはIDからステータス色を返す
  const getStatusColor = (labelOrId) => {
    const s = labelMap.get(labelOrId) || statusMap.get(labelOrId)
    return s ? { color: s.color, bg: s.bg } : { color: '#6B7280', bg: '#6B728018' }
  }

  return {
    statuses,
    statusMap,
    labelMap,
    ceoConnectLabels,
    ceoConnectIds,
    shortcuts,
    excludedIds,
    getStatusColor,
    loading,
  }
}
