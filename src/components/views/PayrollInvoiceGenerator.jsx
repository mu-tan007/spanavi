// ============================================================
// Payroll 請求書作成: 当月支給データから請求書PDFを自動生成
// メンバー個人 → M&Aソーシングパートナーズ宛の業務委託請求書
// 振込先・個人情報は localStorage(`spanavi_invoice_${memberId}`) に保存
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Button, Card, Input } from '../ui';
import { uploadPayrollInvoice } from '../../lib/supabaseWrite';

const MASP_PAYMENT_DEFAULT_DAY = 25; // 翌月25日（仮: 運用に合わせて要調整）

const fmt = (n) => Number(n).toLocaleString('ja-JP');

const profileStorageKey = (memberId) => `spanavi_invoice_profile_${memberId}`;

function loadProfile(memberId) {
  try {
    const raw = localStorage.getItem(profileStorageKey(memberId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveProfile(memberId, profile) {
  try {
    localStorage.setItem(profileStorageKey(memberId), JSON.stringify(profile));
  } catch { /* ignore */ }
}

// 「4月」→ { year, month } を payrollMonths から特定。
function getYearMonthForLabel(payrollMonths, label) {
  return payrollMonths.find(p => p.label === label) || null;
}

function fmtJpDate(d) {
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
}

export default function PayrollInvoiceGenerator({
  memberId,        // members.id (UUID, payroll_invoices.member_id 用)
  memberName,
  memberEmail,
  memberPhone,
  payrollMonths,   // [{label,year,month}]
  payMonthLabel,   // "4月" など現在選択中
  incentive,
  roleBonus,
  referrals,       // [{name, amount, ...}]
  referralTotal,
  totalPayout,
  canEdit,         // false なら閲覧のみ（管理者が他人のを開いている時）
  onUploaded,     // 生成 → アップ後にコールバック
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const initialProfile = useMemo(() => {
    const saved = memberId ? loadProfile(memberId) : null;
    return {
      postalCode: '',
      address: '',
      phone: memberPhone || '',
      email: memberEmail || '',
      bankName: '',
      branchName: '',
      accountType: '普通',
      accountNumber: '',
      accountHolderKana: '',
      taxInvoiceNumber: '',
      ...(saved || {}),
    };
  }, [memberId, memberPhone, memberEmail]);

  const [profile, setProfile] = useState(initialProfile);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  const update = (patch) => {
    setProfile(p => {
      const next = { ...p, ...patch };
      if (memberId) saveProfile(memberId, next);
      return next;
    });
  };

  const showError = (m) => { setErr(m); setTimeout(() => setErr(''), 5000); };
  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  // 請求書明細
  const invoiceItems = useMemo(() => {
    const out = [];
    if (incentive > 0) out.push({ label: `インセンティブ（${payMonthLabel}分）`, amount: incentive, note: '' });
    if (roleBonus > 0) out.push({ label: `役職ボーナス（${payMonthLabel}分）`, amount: roleBonus, note: '' });
    (referrals || []).forEach(r => {
      out.push({ label: `紹介料（${r.name} 様）`, amount: r.amount, note: '' });
    });
    return out;
  }, [incentive, roleBonus, referrals, payMonthLabel]);

  const ym = useMemo(() => getYearMonthForLabel(payrollMonths, payMonthLabel), [payrollMonths, payMonthLabel]);
  const yyyymm = ym ? `${ym.year}-${String(ym.month).padStart(2, '0')}` : '';

  const dateContext = useMemo(() => {
    if (!ym) return null;
    const issueDate = new Date();
    const deadline = new Date(ym.year, ym.month, MASP_PAYMENT_DEFAULT_DAY); // 翌月25日
    return {
      issueDate: fmtJpDate(issueDate),
      paymentDeadline: fmtJpDate(deadline),
      invoiceNumber: `INV-${ym.year}${String(ym.month).padStart(2, '0')}-${memberId?.slice(0, 8) || 'XXXX'}`,
    };
  }, [ym, memberId]);

  const validateProfile = () => {
    if (!profile.bankName.trim()) return '銀行名を入力してください';
    if (!profile.branchName.trim()) return '支店名を入力してください';
    if (!profile.accountNumber.trim()) return '口座番号を入力してください';
    if (!profile.accountHolderKana.trim()) return '口座名義（カナ）を入力してください';
    if (invoiceItems.length === 0) return '当月の支給対象がありません';
    return null;
  };

  // PDF 生成（共通処理）。upload=true なら storage にも保存。
  const generatePdf = async ({ upload }) => {
    const validationErr = validateProfile();
    if (validationErr) { showError(validationErr); return; }
    if (!dateContext) { showError('対象月の情報が取得できません'); return; }

    setBusy(true);
    setErr('');
    setMsg('');

    let container = null;
    let root = null;
    try {
      const { default: MemberInvoicePDF } = await import('./MemberInvoicePDF');
      const ReactDOM = await import('react-dom/client');
      container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);
      root = ReactDOM.createRoot(container);
      root.render(
        <MemberInvoicePDF
          memberName={memberName}
          memberPostalCode={profile.postalCode}
          memberAddress={profile.address}
          memberPhone={profile.phone}
          memberEmail={profile.email}
          taxInvoiceNumber={profile.taxInvoiceNumber}
          month={payMonthLabel}
          items={invoiceItems}
          total={totalPayout}
          invoiceNumber={dateContext.invoiceNumber}
          issueDate={dateContext.issueDate}
          paymentDeadline={dateContext.paymentDeadline}
          bankName={profile.bankName}
          branchName={profile.branchName}
          accountType={profile.accountType}
          accountNumber={profile.accountNumber}
          accountHolderKana={profile.accountHolderKana}
        />
      );

      await new Promise(resolve => setTimeout(resolve, 600));

      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const el = document.getElementById('member-invoice-pdf-page');
      if (!el) throw new Error('PDF レンダリングノードが見つかりません');
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);

      const fileName = `業務委託料_${payMonthLabel}分_${memberName}.pdf`;
      if (upload) {
        // PDF → Blob → File
        const blob = pdf.output('blob');
        const file = new File([blob], fileName, { type: 'application/pdf' });
        const { error } = await uploadPayrollInvoice(memberId, yyyymm, file);
        if (error) throw error;
        showMsg('請求書を生成し、上の「請求書」欄に格納しました');
        if (onUploaded) onUploaded();
      } else {
        pdf.save(fileName);
        showMsg('PDF をダウンロードしました');
      }
    } catch (e) {
      console.error('[PayrollInvoiceGenerator]', e);
      showError('生成に失敗しました: ' + (e.message || '不明なエラー'));
    } finally {
      if (root) root.unmount();
      if (container && container.parentNode) container.parentNode.removeChild(container);
      setBusy(false);
    }
  };

  const labelStyle = { fontSize: font.size.xs, color: color.textLight, display: 'block', marginBottom: 4, fontWeight: font.weight.semibold };
  const inputStyle = { padding: '8px 12px', borderRadius: radius.md, background: color.white, border: `1px solid ${color.border}`, color: color.textDark, fontSize: font.size.sm, fontFamily: font.family.sans, outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <Card
      padding="md"
      title="請求書を作成"
      description={`${payMonthLabel}分の支給データから業務委託請求書 PDF を自動生成`}
      style={{ marginBottom: space[5] }}
    >
      {!open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size.sm, color: color.textMid }}>
            合計 <span style={{ fontFamily: font.family.mono, fontWeight: font.weight.bold, color: color.navy }}>¥{fmt(totalPayout)}</span> ・ {invoiceItems.length} 項目
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
            <Button variant="primary" size="sm" disabled={!canEdit || totalPayout <= 0} onClick={() => setOpen(true)}>
              請求書を作成
            </Button>
          </div>
          {!canEdit && (
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>※ 本人のみ作成可</span>
          )}
          {totalPayout <= 0 && canEdit && (
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>※ 当月の支給対象がありません</span>
          )}
        </div>
      ) : (
        <div>
          {/* 個人情報 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: space[3] }}>
            <div>
              <label style={labelStyle}>郵便番号（任意）</label>
              <input value={profile.postalCode} onChange={e => update({ postalCode: e.target.value })} placeholder="例: 150-0001" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>住所（任意）</label>
              <input value={profile.address} onChange={e => update({ address: e.target.value })} placeholder="例: 東京都渋谷区..." style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>電話番号（任意）</label>
              <input value={profile.phone} onChange={e => update({ phone: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>メールアドレス（任意）</label>
              <input value={profile.email} onChange={e => update({ email: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>適格請求書発行事業者番号（任意・該当者のみ）</label>
              <input value={profile.taxInvoiceNumber} onChange={e => update({ taxInvoiceNumber: e.target.value })} placeholder="例: T1234567890123" style={inputStyle} />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${color.border}`, marginBottom: space[3] }} />

          {/* 振込先 */}
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>振込先 *</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: space[3] }}>
            <div>
              <label style={labelStyle}>銀行名 *</label>
              <input value={profile.bankName} onChange={e => update({ bankName: e.target.value })} placeholder="例: GMOあおぞらネット銀行" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>支店名 *</label>
              <input value={profile.branchName} onChange={e => update({ branchName: e.target.value })} placeholder="例: 法人営業部 (101)" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>口座種別 *</label>
              <select value={profile.accountType} onChange={e => update({ accountType: e.target.value })} style={inputStyle}>
                <option value="普通">普通</option>
                <option value="当座">当座</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>口座番号 *</label>
              <input value={profile.accountNumber} onChange={e => update({ accountNumber: e.target.value })} placeholder="例: 1234567" style={inputStyle} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>口座名義（カナ） *</label>
              <input value={profile.accountHolderKana} onChange={e => update({ accountHolderKana: e.target.value })} placeholder="例: ヤマダ タロウ" style={inputStyle} />
            </div>
          </div>

          <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[3] }}>
            ※ 入力内容はこのブラウザに保存され、次回以降は自動入力されます
          </div>

          {/* プレビュー: 明細 */}
          <div style={{
            padding: space[3], borderRadius: radius.md,
            background: alpha(color.navy, 0.04),
            marginBottom: space[3],
          }}>
            <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[2], fontWeight: font.weight.semibold }}>明細プレビュー</div>
            {invoiceItems.length === 0 ? (
              <div style={{ fontSize: font.size.sm, color: color.textLight }}>当月の支給対象がありません</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {invoiceItems.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm }}>
                    <span style={{ color: color.textDark }}>{it.label}</span>
                    <span style={{ fontFamily: font.family.mono, fontWeight: font.weight.semibold, color: color.navy }}>¥{fmt(it.amount)}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${color.border}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm, fontWeight: font.weight.bold }}>
                  <span>合計</span>
                  <span style={{ fontFamily: font.family.mono, color: color.navy }}>¥{fmt(totalPayout)}</span>
                </div>
              </div>
            )}
          </div>

          {/* アクション */}
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button variant="primary" size="md" loading={busy} disabled={!canEdit || totalPayout <= 0} onClick={() => generatePdf({ upload: false })}>
              PDF をダウンロード
            </Button>
            <Button variant="secondary" size="md" loading={busy} disabled={!canEdit || totalPayout <= 0} onClick={() => generatePdf({ upload: true })}>
              生成して請求書欄に保存
            </Button>
            <Button variant="outline" size="md" onClick={() => setOpen(false)}>
              閉じる
            </Button>
          </div>

          {msg && (
            <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.success, fontWeight: font.weight.semibold }}>{msg}</div>
          )}
          {err && (
            <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>{err}</div>
          )}
        </div>
      )}
    </Card>
  );
}
