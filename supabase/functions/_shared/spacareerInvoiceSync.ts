// スパキャリ Stripe 請求書ミラーの共通ロジック。
// stripe-spacareer-webhook（イベント駆動）と stripe-spacareer-sync（バックフィル）の両方で使う。
// 設計方針:
//  - 全 Invoice を取り込み、メール一致で受講生(spacareer_customers)へ自動紐付け。
//  - 手動リンク / 対象外(excluded) はユーザーが消込画面で設定 → 再同期で上書きしない。
//  - JPY はゼロ小数通貨なので Stripe の金額（円）をそのまま bigint 保存。

// deno-lint-ignore-file no-explicit-any

function unixToIso(sec: number | null | undefined): string | null {
  if (sec === null || sec === undefined) return null
  return new Date(sec * 1000).toISOString()
}

/** スパキャリ事業（spartia_career）が所属する org_id を取得（単一テナント前提） */
export async function resolveSpacareerOrgId(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('engagements')
    .select('org_id')
    .eq('slug', 'spartia_career')
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

/** Stripe Invoice → spacareer_invoices 行（リンク列は含めない＝upsertで手動リンクを保護） */
function mapInvoiceToRow(inv: any, orgId: string): Record<string, any> {
  const st = inv.status_transitions ?? {}
  const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? null
  const customerEmail =
    inv.customer_email ?? (typeof inv.customer === 'object' ? inv.customer?.email ?? null : null)
  return {
    id: inv.id,
    org_id: orgId,
    stripe_customer_id: customerId,
    customer_email: customerEmail,
    customer_name: inv.customer_name ?? null,
    number: inv.number ?? null,
    status: inv.status ?? null,
    currency: inv.currency ?? 'jpy',
    subtotal: inv.subtotal ?? null,
    tax: inv.tax ?? null,
    total: inv.total ?? null,
    amount_due: inv.amount_due ?? null,
    amount_paid: inv.amount_paid ?? null,
    amount_remaining: inv.amount_remaining ?? null,
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf: inv.invoice_pdf ?? null,
    description: inv.description ?? null,
    period_start: unixToIso(inv.period_start),
    period_end: unixToIso(inv.period_end),
    due_date: unixToIso(inv.due_date),
    finalized_at: unixToIso(st.finalized_at),
    paid_at: unixToIso(st.paid_at),
    stripe_created_at: unixToIso(inv.created),
    raw: inv,
    synced_at: new Date().toISOString(),
  }
}

/** メールで受講生を解決（大文字小文字の表記ゆれ対策で ilike） */
async function resolveCustomer(
  supabase: any,
  orgId: string,
  email: string | null,
): Promise<{ member_id: string | null; spacareer_customer_id: string | null }> {
  if (!email) return { member_id: null, spacareer_customer_id: null }
  const { data: m } = await supabase
    .from('members')
    .select('id')
    .eq('org_id', orgId)
    .ilike('email', email)
    .maybeSingle()
  if (!m) return { member_id: null, spacareer_customer_id: null }
  const { data: c } = await supabase
    .from('spacareer_customers')
    .select('id')
    .eq('member_id', m.id)
    .maybeSingle()
  return { member_id: m.id, spacareer_customer_id: c?.id ?? null }
}

/** 1件の Invoice を upsert し、明細を洗い替え、未リンクなら email 自動紐付け */
export async function syncInvoice(supabase: any, orgId: string, inv: any): Promise<void> {
  // 1) 本体 upsert（リンク列・excluded は payload に含めない → 既存の手動設定を保持）
  const row = mapInvoiceToRow(inv, orgId)
  const { error } = await supabase
    .from('spacareer_invoices')
    .upsert(row, { onConflict: 'id' })
  if (error) throw new Error(`invoice upsert失敗 (${inv.id}): ${error.message}`)

  // 2) 明細の洗い替え（全行同一キーで bulk insert）
  await supabase.from('spacareer_invoice_items').delete().eq('invoice_id', inv.id)
  const lines: any[] = inv.lines?.data ?? []
  if (lines.length) {
    const items = lines.map((l) => ({
      id: l.id,
      invoice_id: inv.id,
      org_id: orgId,
      description: l.description ?? null,
      amount: l.amount ?? null,
      quantity: l.quantity ?? null,
      currency: l.currency ?? 'jpy',
      price_id: l.price?.id ?? null,
      product_id: typeof l.price?.product === 'string' ? l.price.product : l.price?.product?.id ?? null,
      product_name: typeof l.price?.product === 'object' ? l.price?.product?.name ?? null : null,
    }))
    const { error: e2 } = await supabase.from('spacareer_invoice_items').insert(items)
    if (e2) throw new Error(`明細insert失敗 (${inv.id}): ${e2.message}`)
  }

  // 3) 未リンクのときだけ email 自動紐付け（手動リンクは .is('spacareer_customer_id', null) で保護）
  const cust = await resolveCustomer(supabase, orgId, row.customer_email as string | null)
  if (cust.spacareer_customer_id) {
    await supabase
      .from('spacareer_invoices')
      .update({ spacareer_customer_id: cust.spacareer_customer_id, member_id: cust.member_id })
      .eq('id', inv.id)
      .is('spacareer_customer_id', null)
  }
}
