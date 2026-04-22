import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }

function fmt(v) {
  if (v == null) return '—'
  const b = v / 100000000
  return b >= 1 ? `¥${b.toFixed(1)}億` : `¥${(v/10000).toFixed(0)}万`
}

function calcIRR(cashFlows, guess = 0.1) {
  // Newton-Raphson法でIRRを計算
  let rate = guess
  for (let i = 0; i < 100; i++) {
    let npv = 0, dnpv = 0
    cashFlows.forEach((cf, t) => {
      npv  += cf / Math.pow(1 + rate, t)
      dnpv -= t * cf / Math.pow(1 + rate, t + 1)
    })
    if (Math.abs(npv) < 1e-6) break
    rate = rate - npv / dnpv
  }
  return isFinite(rate) && rate > -1 ? rate : null
}

export default function LBOTab({ dealId, lbo, financials }) {
  const qc = useQueryClient()
  const latest = financials?.[financials.length - 1] || {}
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    acquisition_price: lbo?.acquisition_price ?? '',
    equity_ratio:      lbo?.equity_ratio      ?? 0.3,
    debt_ratio:        lbo?.debt_ratio        ?? 0.7,
    interest_rate:     lbo?.interest_rate     ?? 0.025,
    repayment_years:   lbo?.repayment_years   ?? 5,
    exit_multiple:     lbo?.exit_multiple     ?? 6,
    exit_year:         lbo?.exit_year         ?? 5,
    bank_memo:         lbo?.bank_memo         ?? '',
  })

  const price    = Number(form.acquisition_price) || 0
  const equity   = price * Number(form.equity_ratio)
  const debt     = price * Number(form.debt_ratio)
  const annualRepay = debt > 0 ? debt / Number(form.repayment_years) : 0
  const annualInterest = debt * Number(form.interest_rate)
  const exitEbitda = latest.ebitda || 0
  const exitEV   = exitEbitda * Number(form.exit_multiple)
  const exitEquity = exitEV - (debt - annualRepay * Number(form.exit_year))
  const moic     = equity > 0 ? exitEquity / equity : null

  const cashFlows = [-equity]
  for (let y = 1; y <= Number(form.exit_year); y++) {
    cashFlows.push(y === Number(form.exit_year) ? exitEquity : 0)
  }
  const irr = equity > 0 ? calcIRR(cashFlows) : null

  const inp = (key, type = 'number', step = 'any') => (
    <input type={type} step={step} value={form[key]}
      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      style={{ width: '100%', height: 32, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }} />
  )

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      deal_id: dealId, ...form,
      irr: irr != null ? parseFloat(irr.toFixed(4)) : null,
      moic: moic != null ? parseFloat(moic.toFixed(3)) : null,
      updated_at: new Date().toISOString(),
    }
    Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null })
    if (lbo?.id) {
      await supabase.from('cap_lbo_models').update(payload).eq('id', lbo.id)
    } else {
      await supabase.from('cap_lbo_models').insert(payload)
    }
    qc.invalidateQueries({ queryKey: ['deal', dealId] })
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form onSubmit={handleSave}>

        {/* 試算結果 */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>試算結果</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              ['エクイティ投資額', fmt(equity || null)],
              ['デット調達額', fmt(debt || null)],
              ['IRR', irr != null ? `${(irr*100).toFixed(1)}%` : '—'],
              ['MOIC', moic != null ? `${moic.toFixed(2)}x` : '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ background: '#FAFAFA', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#A0A0A0', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#032D60' }}>{v}</div>
              </div>
            ))}
          </div>
          {irr != null && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: irr >= 0.2 ? '#E1F5EE' : irr >= 0.15 ? '#F8F8F8' : '#FAF3E0', borderRadius: 6, fontSize: 12, color: irr >= 0.2 ? '#2E844A' : irr >= 0.15 ? '#032D60' : '#A08040' }}>
              {irr >= 0.2 ? '高リターン案件（IRR 20%超）' : irr >= 0.15 ? '標準的なリターン（IRR 15〜20%）' : 'リターンが低い可能性あり（IRR 15%未満）'}
            </div>
          )}
        </div>

        {/* 入力パラメータ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>ファイナンス条件</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>買収価格（円）</label>{inp('acquisition_price')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>エクイティ比率</label>{inp('equity_ratio', 'number', '0.01')}</div>
                <div><label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>デット比率</label>{inp('debt_ratio', 'number', '0.01')}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>金利</label>{inp('interest_rate', 'number', '0.001')}</div>
                <div><label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>返済年数</label>{inp('repayment_years')}</div>
              </div>
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>エグジット条件</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>EXITマルチプル</label>{inp('exit_multiple', 'number', '0.5')}</div>
                <div><label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>EXIT年数</label>{inp('exit_year')}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 4 }}>EBITDA（最新期）</div>
                <div style={{ fontSize: 13, color: '#032D60', fontWeight: 500 }}>{fmt(latest.ebitda)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 2 }}>EXIT時EV想定</div>
                <div style={{ fontSize: 13, color: '#032D60', fontWeight: 500 }}>{fmt(exitEV || null)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 銀行提出メモ */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 8 }}>銀行提出用メモ</div>
          <textarea value={form.bank_memo} onChange={e => setForm(f => ({ ...f, bank_memo: e.target.value }))}
            rows={5} placeholder="金融機関への説明資料に記載するメモを入力..."
            style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 12, outline: 'none', resize: 'vertical', lineHeight: 1.7 }} />
        </div>

        <button type="submit" disabled={saving}
          style={{ height: 36, padding: '0 20px', background: saving ? '#A0A0A0' : '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
          {saving ? '保存中...' : '保存'}
        </button>
      </form>

      {/* Sources & Uses */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 4 }}>Sources & Uses</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>調達 (エクイティ/シニア/メザニン/sponsor loan) vs 使途 (株式取得/費用/運転資本)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 8, fontWeight: 500 }}>調達 (Sources)</div>
            <SUEntry label="エクイティ (Sponsor)" value={fmt(equity || null)} pct={price ? Number(form.equity_ratio) * 100 : null} />
            <SUEntry label="シニア ローン" value={fmt(debt || null)} pct={price ? Number(form.debt_ratio) * 100 : null} />
            <SUEntry label="メザニン / 劣後" value="—" pct={null} hint="未設定" />
            <SUEntry label="Sponsor Loan" value="—" pct={null} hint="未設定" />
            <SUTotal label="調達合計" value={fmt(price || null)} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 8, fontWeight: 500 }}>使途 (Uses)</div>
            <SUEntry label="株式取得対価" value={fmt(price || null)} pct={100} />
            <SUEntry label="リファイナンス債務" value="—" pct={null} hint="既存有利子負債の返済分" />
            <SUEntry label="取引費用 (FA/法務)" value="—" pct={null} hint="見積 2-3%" />
            <SUEntry label="運転資本調整" value="—" pct={null} hint="WC ピーク対応" />
            <SUTotal label="使途合計" value={fmt(price || null)} />
          </div>
        </div>
      </div>

      {/* Returns Waterfall */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 4 }}>リターン Waterfall</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>LP / GP / 経営陣 への分配構造 (Preferred Return + Catch-up + Carry)</div>
        <div style={{ padding: '20px 16px', background: '#FAFAFA', border: '0.5px dashed #E5E5E5', borderRadius: 6, fontSize: 12, color: '#706E6B', textAlign: 'center' }}>
          Preferred Return (8%) + GP Catch-up (100%) + Carried Interest (20%) の構造を定義します。次ビルドで UI 追加。
        </div>
      </div>

      {/* 感度分析 */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 4 }}>感度分析 (IRR マトリクス)</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>EBITDA 成長率 × Exit マルチプル の 5x5 マトリクス</div>
        <SensitivityMatrix baseEbitda={exitEbitda} baseMultiple={Number(form.exit_multiple)} equity={equity} debt={debt} exitYear={Number(form.exit_year)} repayYears={Number(form.repayment_years)} />
      </div>

      {/* コベナンツ */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 4 }}>財務コベナンツ</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>DSCR / Leverage / Interest Coverage の基準値と現状</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <CovenantCell label="DSCR" value="—" threshold="≥ 1.2x" />
          <CovenantCell label="Net Debt / EBITDA" value={exitEbitda && debt ? `${(debt / exitEbitda).toFixed(1)}x` : '—'} threshold="≤ 4.5x" />
          <CovenantCell label="Interest Coverage" value={exitEbitda && annualInterest ? `${(exitEbitda / annualInterest).toFixed(1)}x` : '—'} threshold="≥ 3.0x" />
        </div>
      </div>
    </div>
  )
}

function SUEntry({ label, value, pct, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid #f0f2f5' }}>
      <div style={{ fontSize: 11, color: '#706E6B' }}>{label}{hint && <span style={{ color: '#E5E5E5', marginLeft: 6, fontSize: 10 }}>({hint})</span>}</div>
      <div style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 500 }}>
        {value} {pct != null && <span style={{ fontSize: 10, color: '#A0A0A0', marginLeft: 4 }}>({pct.toFixed(0)}%)</span>}
      </div>
    </div>
  )
}
function SUTotal({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', marginTop: 4, background: '#FAFAFA', borderRadius: 5, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: '#032D60', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#032D60', fontWeight: 600 }}>{value}</div>
    </div>
  )
}
function CovenantCell({ label, value, threshold }) {
  return (
    <div style={{ padding: 12, background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#FFFFFF' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 4 }}>基準: {threshold}</div>
    </div>
  )
}
function SensitivityMatrix({ baseEbitda, baseMultiple, equity, debt, exitYear, repayYears }) {
  if (!baseEbitda || !equity) {
    return (
      <div style={{ padding: '20px 16px', background: '#FAFAFA', border: '0.5px dashed #E5E5E5', borderRadius: 6, fontSize: 12, color: '#706E6B', textAlign: 'center' }}>
        買収価格・EBITDA が入力されると IRR 感度マトリクスが表示されます
      </div>
    )
  }
  const growths = [-10, -5, 0, 5, 10]
  const multDeltas = [-2, -1, 0, 1, 2]
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#FAFAFA' }}>
            <th style={{ padding: '6px 10px', fontSize: 10, color: '#706E6B', textAlign: 'center', fontWeight: 500 }}>EBITDA成長 \ マルチプル</th>
            {multDeltas.map(d => <th key={d} style={{ padding: '6px 10px', fontSize: 10, color: '#706E6B', textAlign: 'center', fontWeight: 500 }}>{(baseMultiple + d).toFixed(1)}x</th>)}
          </tr>
        </thead>
        <tbody>
          {growths.map(g => {
            const exitEb = baseEbitda * Math.pow(1 + g / 100, exitYear)
            return (
              <tr key={g}>
                <td style={{ padding: '6px 10px', fontSize: 10, color: '#706E6B', fontWeight: 500 }}>{g > 0 ? '+' : ''}{g}%/年</td>
                {multDeltas.map(d => {
                  const exitEV = exitEb * (baseMultiple + d)
                  const debtRemain = Math.max(0, debt - (debt / repayYears) * exitYear)
                  const exitEq = exitEV - debtRemain
                  const irr = exitEq > 0 ? Math.pow(exitEq / equity, 1 / exitYear) - 1 : null
                  const col = irr == null ? '#E5E5E5' : irr >= 0.25 ? '#2E844A' : irr >= 0.15 ? '#032D60' : irr >= 0.08 ? '#A08040' : '#EA001E'
                  const bg = irr == null ? '#FAFAFA' : irr >= 0.25 ? '#E1F5EE' : irr >= 0.15 ? '#F8F8F8' : irr >= 0.08 ? '#FAF3E0' : '#FAECE7'
                  return <td key={d} style={{ padding: '6px 10px', textAlign: 'center', background: bg, color: col, fontWeight: 500, fontSize: 11, borderBottom: '0.5px solid #fff' }}>{irr != null ? `${(irr * 100).toFixed(0)}%` : '—'}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
