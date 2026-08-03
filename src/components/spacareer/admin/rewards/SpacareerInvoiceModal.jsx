import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Input, Select, Badge } from '../../../ui';
import { handleChunkLoadError } from '../../../../utils/chunkReload';
import { supabase } from '../../../../lib/supabase';
import {
  fetchMemberInvoiceProfile,
  upsertMemberInvoiceProfile,
  uploadSpacareerTrainerInvoice,
  getPayrollInvoiceUrl,
} from '../../../../lib/supabaseWrite';

// ============================================================
// スパキャリ トレーナー報酬 請求書（ワンクリック生成）
// ----------------------------------------------------------------
// 営業代行の PayrollInvoiceGenerator と同じ流れ:
//   member_invoice_profiles から振込先をプレフィル
//   → MemberInvoicePDF を画面外にレンダリング
//   → html2canvas + jsPDF で A4 1枚に焼いて Storage へ格納
//
// 明細は v_spacareer_trainer_monthly の1行（月×トレーナー）から組み立てる。
// 金額は税込。支払期限はビューが返す翌月末をそのまま使う。
// ============================================================

const yen = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;

function fmtJpDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日`;
}

export default function SpacareerInvoiceModal({ row, existing, canConfirm = false, onClose, onSaved }) {
  const [profile, setProfile] = useState({
    postalCode: '', address: '', phone: '', email: '',
    bankName: '', branchName: '', accountType: '普通',
    accountNumber: '', accountHolderKana: '', taxInvoiceNumber: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const monthLabel = useMemo(() => {
    const [y, m] = (row.month_key || '').split('-');
    return `${y}年${Number(m)}月`;
  }, [row.month_key]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await fetchMemberInvoiceProfile(row.trainer_id);
      if (cancelled) return;
      if (data) {
        setProfile({
          postalCode: data.postal_code || '', address: data.address || '',
          phone: data.phone || '', email: data.email || '',
          bankName: data.bank_name || '', branchName: data.branch_name || '',
          accountType: data.account_type || '普通',
          accountNumber: data.account_number || '',
          accountHolderKana: data.account_holder_kana || '',
          taxInvoiceNumber: data.tax_invoice_number || '',
        });
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [row.trainer_id]);

  const items = useMemo(() => {
    const out = [];
    if (row.session_count > 0) {
      out.push({
        label: `セッション実施料（${monthLabel}分 ${row.session_count}回 × ${yen(row.session_unit_price)}）`,
        amount: row.session_amount,
        note: '',
      });
    }
    if (row.fixed_allowance > 0) {
      out.push({
        label: `固定給（${monthLabel}分 担当${row.assigned_customer_count}名）`,
        amount: row.fixed_allowance,
        note: '',
      });
    }
    return out;
  }, [row, monthLabel]);

  const set = (k) => (e) => setProfile((p) => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    if (!profile.bankName.trim()) return '銀行名を入力してください';
    if (!profile.branchName.trim()) return '支店名を入力してください';
    if (!profile.accountNumber.trim()) return '口座番号を入力してください';
    if (!profile.accountHolderKana.trim()) return '口座名義（カナ）を入力してください';
    if (items.length === 0) return 'この月は請求対象がありません';
    return null;
  };

  const handleCreate = async () => {
    const v = validate();
    if (v) { setErr(v); return; }
    setBusy(true); setErr(''); setMsg('');

    let container = null; let root = null;
    try {
      await upsertMemberInvoiceProfile(row.trainer_id, profile);

      const { default: MemberInvoicePDF } = await import('../../../views/MemberInvoicePDF');
      const ReactDOM = await import('react-dom/client');
      container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);
      root = ReactDOM.createRoot(container);
      root.render(
        <MemberInvoicePDF
          memberName={row.trainer_name}
          memberPostalCode={profile.postalCode}
          memberAddress={profile.address}
          memberPhone={profile.phone}
          memberEmail={profile.email}
          taxInvoiceNumber={profile.taxInvoiceNumber}
          month={monthLabel}
          items={items}
          total={row.total_amount}
          invoiceNumber={`SPC-${(row.month_key || '').replace('-', '')}-${String(row.trainer_id).slice(0, 8)}`}
          issueDate={fmtJpDate(new Date())}
          paymentDeadline={fmtJpDate(new Date(row.payment_due_date))}
          bankName={profile.bankName}
          branchName={profile.branchName}
          accountType={profile.accountType}
          accountNumber={profile.accountNumber}
          accountHolderKana={profile.accountHolderKana}
        />
      );

      await new Promise((r) => setTimeout(r, 600));

      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const el = document.getElementById('member-invoice-pdf-page');
      if (!el) throw new Error('PDF レンダリングノードが見つかりません');
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);

      const fileName = `${row.trainer_name}_スパキャリ_${monthLabel}分.pdf`;
      const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
      const { error } = await uploadSpacareerTrainerInvoice(row.trainer_id, row.month_key, file, {
        sessionCount: row.session_count,
        sessionAmount: row.session_amount,
        fixedAllowance: row.fixed_allowance,
        totalAmount: row.total_amount,
      });
      if (error) throw error;

      // 請求書を出した＝金額を相手に伝えた時点なので、その月をここで確定させる。
      // 確定ボタンの押し忘れで過去月の金額が動くのを防ぐ（むー様指示 2026-08-03）。
      // 確定できるのは運営のみ。トレーナー本人が自分の請求書を作った場合は確定しない。
      let extra = '';
      if (canConfirm && !row.is_confirmed) {
        const { error: confErr } = await supabase.rpc(
          'spacareer_confirm_trainer_reward_month', { p_month: row.month_key });
        if (confErr) {
          console.error('[SpacareerInvoiceModal] confirm error:', confErr);
          extra = '（ただし月次確定に失敗しました。報酬一覧から確定してください）';
        } else {
          extra = `（${monthLabel}分を確定しました）`;
        }
      }

      setMsg(`請求書を作成しました${extra}`);
      onSaved && onSaved();
    } catch (e) {
      console.error('[SpacareerInvoiceModal]', e);
      if (!handleChunkLoadError(e)) {
        setErr(`生成に失敗しました: ${e.message || '不明なエラー'}`);
      }
    } finally {
      if (root) root.unmount();
      if (container && container.parentNode) container.parentNode.removeChild(container);
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!existing?.storage_path) return;
    const name = `${row.trainer_name}_スパキャリ_${monthLabel}分.pdf`;
    const { url, error } = await getPayrollInvoiceUrl(existing.storage_path, 600, name);
    if (error || !url) { setErr('ダウンロードURLの取得に失敗しました'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4],
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl,
          width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto',
        }}
      >
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[3]}px ${space[4]}px`,
          borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
        }}>
          <div style={{ fontWeight: font.weight.bold }}>請求書の作成</div>
          <div style={{ fontSize: font.size.xs, opacity: 0.85 }}>
            {row.trainer_name} ／ {monthLabel}分 ／ 支払期限 {fmtJpDate(new Date(row.payment_due_date))}
          </div>
        </div>

        <div style={{ padding: space[4], display: 'grid', gap: space[4] }}>
          <div style={{ background: color.cream, borderRadius: radius.md, padding: space[3] }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], fontSize: font.size.sm, marginBottom: space[1] }}>
                <span style={{ color: color.textMid }}>{it.label}</span>
                <span style={{ fontFamily: font.family.mono }}>{yen(it.amount)}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              borderTop: `1px solid ${color.border}`, marginTop: space[2], paddingTop: space[2],
              fontWeight: font.weight.bold, color: color.navy,
            }}>
              <span>合計（税込）</span>
              <span style={{ fontFamily: font.family.mono }}>{yen(row.total_amount)}</span>
            </div>
          </div>

          {existing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <Badge variant="success" dot>作成済み</Badge>
              <Button variant="outline" size="sm" onClick={handleDownload}>ダウンロード</Button>
              <span style={{ fontSize: font.size.xs, color: color.textLight }}>
                再作成すると上書きされます
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
            <Input label="郵便番号" value={profile.postalCode} onChange={set('postalCode')} placeholder="150-0001" />
            <Input label="電話番号" value={profile.phone} onChange={set('phone')} placeholder="090-0000-0000" />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="住所" value={profile.address} onChange={set('address')} />
            </div>
            <Input label="メールアドレス" value={profile.email} onChange={set('email')} />
            <Input label="インボイス登録番号" value={profile.taxInvoiceNumber} onChange={set('taxInvoiceNumber')} placeholder="T0000000000000" />
            <Input label="銀行名" required value={profile.bankName} onChange={set('bankName')} />
            <Input label="支店名" required value={profile.branchName} onChange={set('branchName')} />
            <Select label="口座種別" value={profile.accountType} onChange={set('accountType')}
              options={[{ value: '普通', label: '普通' }, { value: '当座', label: '当座' }]} />
            <Input label="口座番号" required value={profile.accountNumber} onChange={set('accountNumber')} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="口座名義（カナ）" required value={profile.accountHolderKana} onChange={set('accountHolderKana')} />
            </div>
          </div>

          <div style={{ fontSize: font.size.xs, color: color.textLight }}>
            振込先はメンバー単位で保存されるため、次回以降は自動で入ります。
          </div>

          {err && <div style={{ color: color.danger, fontSize: font.size.sm }}>{err}</div>}
          {msg && <div style={{ color: color.success, fontSize: font.size.sm }}>{msg}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
            <Button variant="outline" onClick={onClose}>閉じる</Button>
            <Button variant="primary" loading={busy} disabled={!loaded} onClick={handleCreate}>
              {existing ? '請求書を再作成' : '請求書を作成'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
