import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getOrgId } from '../lib/orgContext'

// ブランド設定のデフォルト値（未設定時は現在のSpanaviブランドを維持）
const DEFAULTS = {
  brand_org_name: 'Spanavi',
  brand_logo_url: '',
  brand_color_primary: '#032D60',
  brand_color_accent: '#0176D3',
  brand_color_highlight: '#C8A84B',
}

const BRAND_KEYS = Object.keys(DEFAULTS)

export function useBranding() {
  const [branding, setBranding] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const { data } = await supabase
        .from('org_settings')
        .select('setting_key, setting_value')
        .eq('org_id', getOrgId())
        .in('setting_key', BRAND_KEYS)

      const map = { ...DEFAULTS }
      ;(data || []).forEach(r => {
        if (r.setting_value) map[r.setting_key] = r.setting_value
      })
      setBranding(map)

      // CSS変数に反映（全コンポーネントで var(--brand-*) で参照可能）
      const root = document.documentElement.style
      root.setProperty('--brand-primary', map.brand_color_primary)
      root.setProperty('--brand-accent', map.brand_color_accent)
      root.setProperty('--brand-highlight', map.brand_color_highlight)
    } catch (err) {
      console.warn('Branding fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return {
    orgName: branding.brand_org_name,
    logoUrl: branding.brand_logo_url,
    primaryColor: branding.brand_color_primary,
    accentColor: branding.brand_color_accent,
    highlightColor: branding.brand_color_highlight,
    loading,
    reload: load,
  }
}
