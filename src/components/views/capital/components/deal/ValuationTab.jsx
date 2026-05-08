import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { invokeFn } from '../../lib/invokeFn'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Input, Card } from '../../../../ui'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

function formatYen(v) {
  if (v == null) return '—'
  const oku = v / 100000000
  if (Math.abs(oku) >= 1) return `¥${oku.toFixed(2)}億`
  const man = v / 10000
  return `¥${man.toLocaleString()}万`
}

export default function ValuationTab({ dealId, valuation, financials }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    nen_kai_net_assets: '',
    nen_kai_years: 3,
    nen_kai_annual_profit: '',
    ev_ebitda_multiple: 6,
    hope_price: '',
    hope_price_note: '',
    analyst_comment: '',
  })
  const [saving, setSaving] = useState(false)
  const [autoCalcLoading, setAutoCalcLoading] = useState(false)
  const [autoCalcError, setAutoCalcError] = useState('')

  useEffect(() => {
    if (valuation) {
      setForm({
        nen_kai_net_assets: valuation.nen_kai_net_assets ?? '',
        nen_kai_years: valuation.nen_kai_years ?? 3,
        nen_kai_annual_profit: valuation.nen_kai_annual_profit ?? '',
        ev_ebitda_multiple: valuation.ev_ebitda_multiple ?? 6,
        hope_price: valuation.hope_price ?? '',
        hope_price_note: valuation.hope_price_note ?? '',
        analyst_comment: valuation.analyst_comment ?? '',
      })
    } else if (financials?.length) {
      const latest = financials[financials.length - 1]
      setForm(f => ({
        ...f,
        nen_kai_net_assets: latest.net_assets ?? '',
        nen_kai_annual_profit: latest.operating_income ?? '',
      }))
    }
  }, [valuation, financials])

  const nenKaiResult = (Number(form.nen_kai_net_assets) || 0) + (Number(form.nen_kai_annual_profit) || 0) * (Number(form.nen_kai_years) || 0)

  const latest = financials?.[financials.length - 1]
  const ev = latest?.ebitda ? latest.ebitda * (Number(form.ev_ebitda_multiple) || 0) : 0
  const netDebt = latest ? (latest.interest_bearing_debt || 0) - (latest.cash || 0) : 0
  const evEbitdaResult = ev ? ev - netDebt : 0

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    try {
      const payload = {
        deal_id: dealId,
        nen_kai_net_assets: Number(form.nen_kai_net_assets) || null,
        nen_kai_years: Number(form.nen_kai_years) || null,
        nen_kai_annual_profit: Number(form.nen_kai_annual_profit) || null,
        nen_kai_result: nenKaiResult || null,
        ev_ebitda_multiple: Number(form.ev_ebitda_multiple) || null,
        ev_ebitda_result: evEbitdaResult || null,
        hope_price: Number(form.hope_price) || null,
        hope_price_note: form.hope_price_note || null,
        analyst_comment: form.analyst_comment || null,
        valuation_low: (nenKaiResult && evEbitdaResult) ? Math.min(nenKaiResult, evEbitdaResult) : (nenKaiResult || evEbitdaResult || null),
        valuation_high: (nenKaiResult && evEbitdaResult) ? Math.max(nenKaiResult, evEbitdaResult) : (nenKaiResult || evEbitdaResult || null),
        valuation_mid: (nenKaiResult && evEbitdaResult) ? Math.round((nenKaiResult + evEbitdaResult) / 2) : null,
        updated_at: new Date().toISOString(),
      }
      if (valuation?.id) {
        await supabase.from('cap_deal_valuations').update(payload).eq('id', valuation.id)
      } else {
        await supabase.from('cap_deal_valuations').insert(payload)
      }
      logAudit({ action: 'update', resourceType: 'valuation', resourceId: dealId })
      qc.invalidateQueries({ queryKey: ['deal', dealId] })
    } finally {
      setSaving(false)
    }
  }

  async function autoCalc() {
    setAutoCalcLoading(true); setAutoCalcError('')
    try {
      const data = await invokeFn('deal-valuation-auto', { deal_id: dealId })
      logAudit({ action: 'ai_call', resourceType: 'valuation', resourceId: dealId })
      qc.invalidateQueries({ queryKey: ['deal', dealId] })
      if (data.valuation) {
        setForm(f => ({
          ...f,
          nen_kai_net_assets: data.valuation.nen_kai_net_assets ?? f.nen_kai_net_assets,
          nen_kai_years: data.valuation.nen_kai_years ?? f.nen_kai_years,
          nen_kai_annual_profit: data.valuation.nen_kai_annual_profit ?? f.nen_kai_annual_profit,
          ev_ebitda_multiple: data.valuation.ev_ebitda_multiple ?? f.ev_ebitda_multiple,
          hope_price: data.valuation.hope_price ?? f.hope_price,
          hope_price_note: data.valuation.hope_price_note ?? f.hope_price_note,
          analyst_comment: data.valuation.analyst_comment ?? f.analyst_comment,
        }))
      }
    } catch (e) {
      setAutoCalcError(e.message)
    } finally {
      setAutoCalcLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card padding="lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.medium, color: color.navy, marginBottom: 4 }}>バリュエーション</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, lineHeight: 1.7 }}>
            年倍方式 + EBITDA倍率方式で算定。AI 自動算定 (希望株価含む) も可能です。
          </div>
        </div>
        <Button onClick={autoCalc} disabled={autoCalcLoading} loading={autoCalcLoading}>
          {autoCalcLoading ? '算定中…' : 'AI自動算定'}
        </Button>
      </Card>
      {autoCalcError && <div style={{ padding: '10px 14px', background: color.dangerSoft, borderRadius: radius.lg, fontSize: font.size.sm, color: color.danger }}>{autoCalcError}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <Card padding="lg">
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 4, letterSpacing: 1 }}>年倍方式</div>
          <div style={{ fontSize: 22, fontWeight: font.weight.semibold, color: color.navy }}>{formatYen(nenKaiResult)}</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 4 }}>純資産 + 営業利益 × 年数</div>
        </Card>
        <Card padding="lg">
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 4, letterSpacing: 1 }}>EBITDA倍率方式</div>
          <div style={{ fontSize: 22, fontWeight: font.weight.semibold, color: color.navy }}>{formatYen(evEbitdaResult)}</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 4 }}>EBITDA × 倍率 − ネットデット</div>
        </Card>
        <Card padding="lg" variant="subtle">
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 4, letterSpacing: 1 }}>希望株価 (IM記載)</div>
          <div style={{ fontSize: 22, fontWeight: font.weight.semibold, color: color.navy }}>{form.hope_price ? formatYen(Number(form.hope_price)) : '—'}</div>
          {form.hope_price_note && <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 4 }}>{form.hope_price_note}</div>}
        </Card>
      </div>

      <Card padding="lg">
        <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy, marginBottom: 12 }}>① 純資産 + 営業権(のれん)年倍方式</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 14 }}>
          <Input label="純資産 (円)" type="number" value={form.nen_kai_net_assets} onChange={e => set('nen_kai_net_assets', e.target.value)} placeholder="例: 150000000" />
          <Input label="年数" type="number" value={form.nen_kai_years} onChange={e => set('nen_kai_years', e.target.value)} min={1} max={10} />
          <Input label="営業利益 (年額, 円)" type="number" value={form.nen_kai_annual_profit} onChange={e => set('nen_kai_annual_profit', e.target.value)} placeholder="例: 30000000" />
        </div>
        <div style={{ marginTop: 10, fontSize: font.size.xs, color: color.textLight }}>
          算定式: {formatYen(Number(form.nen_kai_net_assets) || 0)} + {formatYen(Number(form.nen_kai_annual_profit) || 0)} × {form.nen_kai_years}年 = <strong style={{ color: color.navy }}>{formatYen(nenKaiResult)}</strong>
        </div>
      </Card>

      <Card padding="lg">
        <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy, marginBottom: 12 }}>② EBITDA マルチプル方式</div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14 }}>
          <Input label="倍率" type="number" step="0.5" value={form.ev_ebitda_multiple} onChange={e => set('ev_ebitda_multiple', e.target.value)} />
          <div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: 4 }}>直近EBITDA (財務から自動)</div>
            <div style={{ width: '100%', height: 36, padding: '0 12px', border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.md, display: 'flex', alignItems: 'center', color: color.textLight, background: color.gray50 }}>
              {latest?.ebitda ? formatYen(latest.ebitda) : '財務データなし'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: font.size.xs, color: color.textLight }}>
          EV = {formatYen(latest?.ebitda || 0)} × {form.ev_ebitda_multiple} = {formatYen(ev)} / ネットデット控除 {formatYen(netDebt)} / <strong style={{ color: color.navy }}>Equity: {formatYen(evEbitdaResult)}</strong>
        </div>
      </Card>

      <Card padding="lg">
        <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy, marginBottom: 12 }}>③ 希望株価 (売り手側・IM記載)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
          <Input label="希望株価 (円)" type="number" value={form.hope_price} onChange={e => set('hope_price', e.target.value)} placeholder="例: 200000000" />
          <Input label="条件・根拠" type="text" value={form.hope_price_note} onChange={e => set('hope_price_note', e.target.value)} placeholder="例: 純資産+営業利益×3年、キーマン条件付き" />
        </div>
      </Card>

      <Card padding="lg">
        <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy, marginBottom: 10 }}>分析コメント</div>
        <textarea value={form.analyst_comment} onChange={e => set('analyst_comment', e.target.value)} rows={4}
          placeholder="算定根拠・調整要因・リスク・推奨レンジ等"
          style={{ width: '100%', padding: '8px 12px', border: `0.5px solid ${color.border}`, borderRadius: radius.lg, fontSize: font.size.base, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, background: color.white, color: color.textDark }} />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={save} disabled={saving} loading={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  )
}
