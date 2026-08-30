import { useCallback, useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Badge, DataTable } from '../ui';
import {
  fetchSpartiaReceipts,
  fetchSpartiaAppointmentOptions,
  insertSpartiaReceipt,
  deleteSpartiaReceipt,
} from '../../lib/supabaseWrite';

// ============================================================
// Spartia AI 入金
// ------------------------------------------------------------
// Spartia AI の報酬は「その月にその顧客から入金された額（税別・実費を除く）の
// 5%を、翌月に架電者へ」だけ。アポ1件あたりの支払いは無い。
//
// ここで入金を1行入れると、DBトリガーが payroll_member_adjustments に
// 支給行を生成し、報酬画面の「調整」列と請求書PDFの明細に自動で乗る。
// バック額・支給月・バック先はDB側で確定するので、この画面では入力しない。
// ============================================================

const KICKBACK_RATE = 0.05;

/** 'YYYY-MM' の選択肢を、当月を中心に前後で作る */
function monthOptions(now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const out = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value: v, label: v });
  }
  return out;
}

/** 入金月 → 支給月（翌月） */
function nextMonth(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) return '';
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1); // m は 1始まりなので、これで翌月になる
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const yen = (n) => `¥${(Number(n) || 0).toLocaleString()}`;

export default function SpartiaReceiptsModal({ open, onClose }) {
  const [receipts, setReceipts] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const months = useMemo(() => monthOptions(), []);
  const thisMonth = months[6]?.value || '';

  const [form, setForm] = useState({ appointmentId: '', receivedMonth: '', amountExclTax: '', note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [r, a] = await Promise.all([fetchSpartiaReceipts(), fetchSpartiaAppointmentOptions()]);
    setReceipts(r.data);
    setAppointments(a.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(f => ({ ...f, receivedMonth: f.receivedMonth || thisMonth }));
    load();
  }, [open, load, thisMonth]);

  const selectedAppo = useMemo(
    () => appointments.find(a => a.id === form.appointmentId) || null,
    [appointments, form.appointmentId]
  );
  const previewAmount = Math.round((parseInt(form.amountExclTax) || 0) * KICKBACK_RATE);

  const handleAdd = async () => {
    if (!form.appointmentId) { setMsg('顧客を選んでください'); return; }
    if (!form.receivedMonth) { setMsg('入金月を選んでください'); return; }
    const amt = parseInt(form.amountExclTax) || 0;
    if (amt <= 0) { setMsg('税別入金額を入れてください'); return; }
    setBusy(true);
    const { error } = await insertSpartiaReceipt({
      appointmentId: form.appointmentId,
      receivedMonth: form.receivedMonth,
      amountExclTax: amt,
      note: form.note,
    });
    setBusy(false);
    if (error) {
      setMsg(
        error.code === '23505'
          ? 'この顧客のこの入金月は既に登録されています。金額を直す場合は既存の行を消してから入れ直してください'
          : `登録に失敗しました: ${error.message || '不明'}`
      );
      return;
    }
    setForm({ appointmentId: '', receivedMonth: form.receivedMonth, amountExclTax: '', note: '' });
    setMsg('入金を登録しました。報酬画面の調整列に反映されます');
    load();
  };

  const handleDelete = async (row) => {
    if (!window.confirm(
      `${row.company_name} の ${row.received_month} 入金（${yen(row.amount_excl_tax)}）を削除しますか？\n`
      + `${row.kickback_member_name || '架電者'}さんへの ${yen(row.kickback_amount)} の支給行も消えます。`
    )) return;
    setBusy(true);
    const { error } = await deleteSpartiaReceipt(row.id);
    setBusy(false);
    if (error) { setMsg(`削除に失敗しました: ${error.message || '不明'}`); return; }
    setMsg('入金を削除しました');
    load();
  };

  if (!open) return null;

  const appoOptions = [
    { value: '', label: '顧客を選ぶ' },
    ...appointments.map(a => ({
      value: a.id,
      label: `${a.company_name}（架電者: ${a.getter_name || '未設定'}）`,
    })),
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: space[4],
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl,
          width: 'min(1040px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[3]}px ${space[4]}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold }}>Spartia AI 入金</div>
            <div style={{ fontSize: font.size.xs, color: color.gray400, marginTop: 2 }}>
              税別入金額の5%を、入金月の翌月に架電者へ支給
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>閉じる</Button>
        </div>

        <div style={{ padding: space[4], overflowY: 'auto' }}>
          {/* 入力行 */}
          <div style={{
            border: `1px solid ${color.border}`, borderRadius: radius.md,
            padding: space[3], marginBottom: space[4], background: color.cream,
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 130px 160px 1fr 100px',
              gap: space[2], alignItems: 'end',
            }}>
              <div>
                <div style={labelStyle}>顧客</div>
                <Select
                  options={appoOptions}
                  value={form.appointmentId}
                  onChange={e => setForm(f => ({ ...f, appointmentId: e.target.value }))}
                />
              </div>
              <div>
                <div style={labelStyle}>入金月</div>
                <Select
                  options={months}
                  value={form.receivedMonth}
                  onChange={e => setForm(f => ({ ...f, receivedMonth: e.target.value }))}
                />
              </div>
              <div>
                <div style={labelStyle}>税別入金額</div>
                <Input
                  type="number"
                  placeholder="実費を除いた額"
                  value={form.amountExclTax}
                  onChange={e => setForm(f => ({ ...f, amountExclTax: e.target.value }))}
                />
              </div>
              <div>
                <div style={labelStyle}>メモ</div>
                <Input
                  placeholder="（任意）第1回入金 など"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>
              <Button variant="primary" onClick={handleAdd} loading={busy} disabled={busy}>登録</Button>
            </div>

            <div style={{
              marginTop: space[2], fontSize: font.size.xs, color: color.textMid,
              display: 'flex', gap: space[4], flexWrap: 'wrap',
            }}>
              <span>バック額 <b style={{ fontFamily: font.family.mono, color: color.navy }}>{yen(previewAmount)}</b></span>
              <span>支給月 <b style={{ fontFamily: font.family.mono, color: color.navy }}>{nextMonth(form.receivedMonth) || '—'}</b></span>
              <span>バック先 <b style={{ color: color.navy }}>{selectedAppo?.getter_name || '—'}</b></span>
            </div>
          </div>

          {msg && (
            <div style={{
              marginBottom: space[3], padding: `${space[2]}px ${space[3]}px`,
              borderRadius: radius.md, background: alpha(color.info, 0.08),
              border: `1px solid ${alpha(color.info, 0.3)}`,
              fontSize: font.size.sm, color: color.textDark,
            }}>{msg}</div>
          )}

          <DataTable
            columns={[
              { key: 'company_name', label: '顧客', width: 240, align: 'left' },
              { key: 'kickback_member_name', label: '架電者', width: 120, align: 'left',
                render: row => row.kickback_member_name || (
                  <Badge variant="warn">未特定</Badge>
                ) },
              { key: 'received_month', label: '入金月', width: 100, align: 'right',
                cellStyle: { fontFamily: font.family.mono } },
              { key: 'amount_excl_tax', label: '税別入金額', width: 130, align: 'right',
                render: row => yen(row.amount_excl_tax), cellStyle: { fontFamily: font.family.mono } },
              { key: 'kickback_rate', label: '率', width: 70, align: 'right',
                render: row => `${(Number(row.kickback_rate) * 100).toFixed(0)}%`,
                cellStyle: { fontFamily: font.family.mono } },
              { key: 'kickback_amount', label: 'バック額', width: 130, align: 'right',
                render: row => yen(row.kickback_amount), cellStyle: { fontFamily: font.family.mono } },
              { key: 'pay_month', label: '支給月', width: 100, align: 'right',
                cellStyle: { fontFamily: font.family.mono } },
              { key: 'note', label: 'メモ', width: 200, align: 'left' },
              { key: 'actions', label: '削除', width: 70, align: 'center',
                render: row => (
                  <Button variant="danger" size="sm" onClick={() => handleDelete(row)} disabled={busy}>×</Button>
                ) },
            ]}
            rows={receipts}
            rowKey="id"
            loading={loading}
            emptyMessage="登録された入金はまだありません"
            height={360}
          />

          <div style={{ marginTop: space[3], fontSize: font.size.xs - 1, color: color.textLight, lineHeight: 1.7 }}>
            ※ 母数は実費（交通費・テキスト代など）を除いた税別入金額。算出した5%はそのまま税込として支給します。<br />
            ※ 分割入金は入金1回につき1行。同じ顧客・同じ入金月は二重に登録できません。<br />
            ※ 登録すると報酬画面の「調整」列と請求書の明細に自動で乗ります。金額を直すときは行を消して入れ直してください。
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: font.size.xs,
  color: color.textMid,
  marginBottom: 4,
  fontWeight: font.weight.medium,
};
