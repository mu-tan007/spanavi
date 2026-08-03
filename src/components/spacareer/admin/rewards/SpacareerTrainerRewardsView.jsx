import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../../constants/design';
import { Card, Badge, Button, DataTable, Select } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import KpiCard from '../_shared/KpiCard';
import { supabase } from '../../../../lib/supabase';
import { fetchSpacareerTrainerInvoices } from '../../../../lib/supabaseWrite';
import { useAuth } from '../../../../hooks/useAuth';
import { isSpacareerAdmin } from '../../../../lib/spacareer/permissions';
import SpacareerInvoiceModal from './SpacareerInvoiceModal';

// ============================================================
// トレーナー報酬（月次）
// ----------------------------------------------------------------
// むー様確定 2026-07-30:
//   - 1セッション 5,000円（税込）。キックオフ(第0回)は算定対象外
//   - 応用コースの (1)(2) は各1回として算定
//   - 同時担当3名以上の月は固定給 50,000円（税込）を別枠で加算
//     「3名以上」は月末時点（進行中の月は現時点）の担当人数で判定。
//     月の途中で下回った月は付かず、増えた月は付く（むー様確定 2026-08-03）
//   - 支払は翌月末
//
// 集計は DB ビュー v_spacareer_trainer_monthly が持つ。
// 単価変更に画面が追随できるよう、金額計算をフロントに持たせない。
// ビューは security_invoker なので、トレーナー本人が開くと自分の行だけが返る。
// ============================================================

const yen = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;

function monthLabel(key) {
  if (!key) return '—';
  const [y, m] = key.split('-');
  return `${y}年${Number(m)}月`;
}

// 支払期限を過ぎているのにまだ確定していない月（＝確定の押し忘れ）
function isOverdue(r) {
  if (r.is_confirmed || !r.payment_due_date) return false;
  return new Date(r.payment_due_date) < new Date();
}

function dueLabel(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function SpacareerTrainerRewardsView() {
  const { profile } = useAuth();
  // 運営は全トレーナー分、トレーナー本人は自分の分だけ（むー様指示 2026-08-03）。
  // 本人モードは必ず RPC を通す。ビューを直接引くと、自分の担当受講生の回を
  // 代打で他トレーナーが実施していた場合に、その人の行が欠けた数字で見えてしまうため。
  const isAdmin = isSpacareerAdmin(profile);
  const [rows, setRows] = useState([]);
  const [unattributed, setUnattributed] = useState(0);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('all');
  const [invoiceRow, setInvoiceRow] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isAdmin) {
        const [mine, inv] = await Promise.all([
          supabase.rpc('spacareer_my_trainer_monthly'),
          fetchSpacareerTrainerInvoices(),
        ]);
        if (mine.error) throw mine.error;
        setRows(mine.data || []);
        setUnattributed(0);
        setInvoices(inv.data || []);
        return;
      }
      const [monthly, pending, inv] = await Promise.all([
        supabase.from('v_spacareer_trainer_monthly_display').select('*').order('month_key', { ascending: false }),
        supabase.from('v_spacareer_sessions_unattributed').select('session_id'),
        fetchSpacareerTrainerInvoices(),
      ]);
      if (monthly.error) throw monthly.error;
      setRows(monthly.data || []);
      setUnattributed((pending.data || []).length);
      setInvoices(inv.data || []);
    } catch (e) {
      console.error('[SpacareerTrainerRewardsView] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const invoiceByKey = useMemo(() => {
    const m = new Map();
    invoices.forEach((i) => m.set(`${i.pay_month}_${i.member_id}`, i));
    return m;
  }, [invoices]);

  const monthOptions = useMemo(() => {
    const keys = [...new Set(rows.map((r) => r.month_key))].sort().reverse();
    return [{ value: 'all', label: 'すべての月' },
      ...keys.map((k) => ({ value: k, label: monthLabel(k) }))];
  }, [rows]);

  const filtered = useMemo(
    () => (monthFilter === 'all' ? rows : rows.filter((r) => r.month_key === monthFilter)),
    [rows, monthFilter]);

  // 確定は月まるごと。トレーナーごとに確定すると基準日がばらつくため行単位にはしない。
  const monthConfirmed = useMemo(
    () => monthFilter !== 'all' && filtered.length > 0 && filtered.some((r) => r.is_confirmed),
    [filtered, monthFilter]);

  async function handleConfirmMonth() {
    const label = monthLabel(monthFilter);
    const sum = filtered.reduce((a, r) => a + (r.total_amount || 0), 0);
    if (!window.confirm(
      `${label}のトレーナー報酬を確定します。\n対象 ${filtered.length}名 ／ 合計 ${yen(sum)}（税込）\n\n`
      + '確定した月は、以後セッションの帰属や担当を直しても金額が動かなくなります。\n'
      + '直したいときは「再計算」で確定値を作り直してください。\n\nよろしいですか？')) return;
    setConfirming(true);
    try {
      const { error } = await supabase.rpc('spacareer_confirm_trainer_reward_month', { p_month: monthFilter });
      if (error) throw error;
      await load();
    } catch (e) {
      console.error('[SpacareerTrainerRewardsView] confirm error:', e);
      alert(`確定に失敗しました: ${e.message || e}`);
    } finally {
      setConfirming(false);
    }
  }

  async function handleRecalcMonth() {
    const label = monthLabel(monthFilter);
    if (!window.confirm(
      `${label}の確定値を、現在のデータで作り直します。\n`
      + '金額が変わる場合があります。作成済みの請求書は自動では作り直されません。\n\nよろしいですか？')) return;
    setConfirming(true);
    try {
      const { error } = await supabase.rpc('spacareer_recalculate_trainer_reward_month', { p_month: monthFilter });
      if (error) throw error;
      await load();
    } catch (e) {
      console.error('[SpacareerTrainerRewardsView] recalculate error:', e);
      alert(`再計算に失敗しました: ${e.message || e}`);
    } finally {
      setConfirming(false);
    }
  }

  const kpi = useMemo(() => filtered.reduce((a, r) => ({
    sessions: a.sessions + (r.session_count || 0),
    session_amount: a.session_amount + (r.session_amount || 0),
    fixed: a.fixed + (r.fixed_allowance || 0),
    total: a.total + (r.total_amount || 0),
  }), { sessions: 0, session_amount: 0, fixed: 0, total: 0 }), [filtered]);

  // トレーナー別の累計（担当が変わっても実施者の実績として積み上がる）
  const byTrainer = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      if (!map.has(r.trainer_id)) {
        map.set(r.trainer_id, { id: r.trainer_id, name: r.trainer_name, sessions: 0, total: 0 });
      }
      const t = map.get(r.trainer_id);
      t.sessions += r.session_count || 0;
      t.total += r.total_amount || 0;
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  return (
    <div style={{ padding: 0, animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title={isAdmin ? 'トレーナー報酬' : '自分の報酬'}
        description={isAdmin
          ? '実施トレーナー別の月次セッション回数と報酬。金額はすべて税込。支払は翌月末。'
          : '自分が実施したセッションの月次報酬です。金額はすべて税込。支払は翌月末。'}
        style={{ marginBottom: space[4] }}
      />

      {unattributed > 0 && (
        <Card padding="sm" style={{ marginBottom: space[4], borderLeft: `3px solid ${color.warn}` }}>
          <div style={{ fontSize: font.size.sm, color: color.textDark }}>
            実施トレーナーが未確定の完了セッションが <strong>{unattributed}件</strong> あります。
            この分は下の集計に含まれていないため、確定するまで報酬額は暫定値です。
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <KpiCard label="セッション回数" value={`${kpi.sessions}回`} />
          <KpiCard label="セッション報酬" value={yen(kpi.session_amount)} />
          <KpiCard label="固定給" value={yen(kpi.fixed)} />
          <KpiCard label="支払合計（税込）" value={yen(kpi.total)} />
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
          <div style={{ minWidth: 200 }}>
            <Select
              label="月で絞り込み"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              options={monthOptions}
            />
          </div>
          {/* 確定は運営のみ。月を選んでいるときだけ出す（全月まとめての確定はさせない）。 */}
          {isAdmin && monthFilter !== 'all' && (
            monthConfirmed ? (
              <Button variant="outline" loading={confirming} onClick={handleRecalcMonth}>
                再計算
              </Button>
            ) : (
              <Button variant="primary" loading={confirming} onClick={handleConfirmMonth}
                disabled={filtered.length === 0}>
                この月を確定
              </Button>
            )
          )}
        </div>
      </div>

      <div style={{ marginBottom: space[5], display: isAdmin ? 'block' : 'none' }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[2] }}>
          トレーナー別 累計
        </div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          {byTrainer.length === 0 ? (
            <span style={{ color: color.textLight, fontSize: font.size.sm }}>該当する実績がありません。</span>
          ) : byTrainer.map((t) => (
            <Card key={t.id} padding="sm" style={{ minWidth: 190 }}>
              <div style={{ fontSize: font.size.xs, color: color.textLight }}>{t.name}</div>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy }}>
                {t.sessions}<span style={{ fontSize: font.size.sm, fontWeight: font.weight.regular, marginLeft: 2 }}>回</span>
              </div>
              <div style={{ fontSize: font.size.sm, color: color.textMid, fontFamily: font.family.mono }}>
                {yen(t.total)}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[2] }}>
          月別明細
        </div>
        <DataTable
          columns={[
            { key: 'month_key', label: '月', width: 120, align: 'right',
              render: (r) => monthLabel(r.month_key),
              cellStyle: { fontWeight: font.weight.semibold } },
            // 本人モードでは自分の行しか無いのでトレーナー列は出さない
            ...(isAdmin ? [{ key: 'trainer_name', label: 'トレーナー', width: 160, align: 'left' }] : []),
            { key: 'session_count', label: 'セッション回数', width: 120, align: 'right',
              render: (r) => `${r.session_count}回` },
            { key: 'session_unit_price', label: '単価', width: 100, align: 'right',
              render: (r) => yen(r.session_unit_price) },
            { key: 'session_amount', label: 'セッション報酬', width: 130, align: 'right',
              render: (r) => yen(r.session_amount),
              cellStyle: { fontFamily: font.family.mono } },
            { key: 'assigned_customer_count', label: '担当人数', width: 100, align: 'right',
              render: (r) => `${r.assigned_customer_count}名` },
            { key: 'fixed_allowance', label: '固定給', width: 120, align: 'right',
              render: (r) => (r.fixed_allowance > 0
                ? <Badge variant="info" dot>{yen(r.fixed_allowance)}</Badge>
                : <span style={{ color: color.textLight }}>—</span>) },
            { key: 'total_amount', label: '合計（税込）', width: 130, align: 'right',
              render: (r) => yen(r.total_amount),
              cellStyle: { fontFamily: font.family.mono, fontWeight: font.weight.semibold } },
            { key: 'payment_due_date', label: '支払期限', width: 110, align: 'right',
              render: (r) => dueLabel(r.payment_due_date) },
            { key: 'is_confirmed', label: '状態', width: 110, align: 'center',
              render: (r) => (r.is_confirmed
                ? <Badge variant="success" dot>確定済み</Badge>
                : <Badge variant={isOverdue(r) ? 'warn' : 'neutral'} dot>未確定</Badge>) },
            { key: 'invoice', label: '請求書', width: 130, align: 'center',
              render: (r) => {
                const done = invoiceByKey.has(`${r.month_key}_${r.trainer_id}`);
                return (
                  <Button
                    variant={done ? 'outline' : 'primary'}
                    size="sm"
                    disabled={r.total_amount <= 0}
                    onClick={() => setInvoiceRow(r)}
                  >
                    {done ? '作成済み' : '作成'}
                  </Button>
                );
              } },
          ]}
          rows={filtered}
          rowKey={(r) => `${r.month_key}_${r.trainer_id}`}
          loading={loading}
          fillWidth
          emptyMessage="該当する報酬記録がありません"
        />
        <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.textLight, lineHeight: font.lineHeight.relaxed }}>
          キックオフ（第0回）は算定対象外です。応用コースの「第N回(1)」「第N回(2)」は各1回として数えます。
          固定給は、月末時点で担当している受講生が3名以上のときに加算されます（進行中の月は現時点の人数です）。
          月の途中で3名を下回った月は加算されず、逆に月の途中で3名に増えた月は加算されます。
          卒業・解約した受講生は、その時点で担当人数から外れます。
          確定した月は金額が固定され、以後セッションの帰属や担当を直しても動きません。請求書を作ると
          その月は自動で確定します。確定後に直したいときは「再計算」で確定値を作り直してください。
        </div>
      </div>

      {invoiceRow && (
        <SpacareerInvoiceModal
          row={invoiceRow}
          canConfirm={isAdmin}
          existing={invoiceByKey.get(`${invoiceRow.month_key}_${invoiceRow.trainer_id}`) || null}
          onClose={() => setInvoiceRow(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
