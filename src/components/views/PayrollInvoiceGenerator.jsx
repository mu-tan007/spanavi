// ============================================================
// Payroll 請求書: 1アクションで PDF を生成し本人ページに格納
// メンバー個人 → M&Aソーシングパートナーズ宛の業務委託請求書
// 振込先・個人情報は member_invoice_profiles テーブルに DB 保存。
// 端末・ブラウザに依存せず、本人が次回開いた際に自動プレフィルされる。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Button, Card, Badge } from '../ui';
import {
  uploadPayrollInvoice,
  fetchMemberInvoiceProfile,
  upsertMemberInvoiceProfile,
  fetchPayrollInvoice,
  getPayrollInvoiceUrl,
  deletePayrollInvoice,
} from '../../lib/supabaseWrite';

const fmt = (n) => Number(n).toLocaleString('ja-JP');

function dbToUi(row) {
  if (!row) return null;
  return {
    postalCode: row.postal_code || '',
    address: row.address || '',
    phone: row.phone || '',
    email: row.email || '',
    taxInvoiceNumber: row.tax_invoice_number || '',
    bankName: row.bank_name || '',
    branchName: row.branch_name || '',
    accountType: row.account_type || '普通',
    accountNumber: row.account_number || '',
    accountHolderKana: row.account_holder_kana || '',
  };
}

function getYearMonthForLabel(payrollMonths, label) {
  return payrollMonths.find(p => p.label === label) || null;
}

function fmtJpDate(d) {
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
}

function fmtFileSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}

function fmtTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PayrollInvoiceGenerator({
  memberId,
  memberName,
  memberEmail,
  memberPhone,
  payrollMonths,
  payMonthLabel,
  incentive,
  roleBonus,
  referrals,
  referralTotal,
  adjustments,
  totalPayout,
  canEdit,
}) {
  const [busy, setBusy] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  // 本人が実際にフォームを編集した時のみ upsert する。
  // プレフィル直後の自動発火と、管理者閲覧時の RLS 違反（他人のレコードへのwrite）を防ぐ。
  const [profileDirty, setProfileDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // 既存請求書（格納済みか）
  const [savedInvoice, setSavedInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const ym = useMemo(() => getYearMonthForLabel(payrollMonths, payMonthLabel), [payrollMonths, payMonthLabel]);
  const yyyymm = ym ? `${ym.year}-${String(ym.month).padStart(2, '0')}` : '';

  const showError = (m) => { setErr(m); setTimeout(() => setErr(''), 5000); };
  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  // 既存請求書取得
  const reloadInvoice = async () => {
    if (!memberId || !yyyymm) { setSavedInvoice(null); return; }
    setLoadingInvoice(true);
    const { data } = await fetchPayrollInvoice(memberId, yyyymm);
    setSavedInvoice(data || null);
    setLoadingInvoice(false);
  };
  useEffect(() => { reloadInvoice(); /* eslint-disable-next-line */ }, [memberId, yyyymm]);

  // プロフィール
  const defaultProfile = useMemo(() => ({
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
  }), [memberPhone, memberEmail]);

  const [profile, setProfile] = useState(defaultProfile);

  useEffect(() => {
    let cancelled = false;
    if (!memberId) { setProfileLoaded(true); return; }
    setProfileLoaded(false);
    fetchMemberInvoiceProfile(memberId).then(({ data }) => {
      if (cancelled) return;
      const merged = { ...defaultProfile, ...(dbToUi(data) || {}) };
      setProfile(merged);
      setProfileDirty(false);
      setProfileLoaded(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  useEffect(() => {
    if (!profileLoaded || !memberId || !canEdit || !profileDirty) return;
    const t = setTimeout(async () => {
      setSavingProfile(true);
      const { error } = await upsertMemberInvoiceProfile(memberId, profile);
      setSavingProfile(false);
      if (error) showError('口座情報の保存に失敗しました: ' + (error.message || '不明'));
      else setProfileDirty(false);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, memberId, profileLoaded, canEdit, profileDirty]);

  const update = (patch) => { setProfile(p => ({ ...p, ...patch })); setProfileDirty(true); };

  // 請求書明細
  const invoiceItems = useMemo(() => {
    const out = [];
    if (incentive > 0) out.push({ label: `インセンティブ（${payMonthLabel}分）`, amount: incentive, note: '' });
    if (roleBonus > 0) out.push({ label: `役職ボーナス（${payMonthLabel}分）`, amount: roleBonus, note: '' });
    (referrals || []).forEach(r => {
      out.push({ label: `紹介料（${r.name} 様）`, amount: r.amount, note: '' });
    });
    (adjustments || []).forEach(a => {
      // adjustments は親側で「ラベル空 or 金額0」が除外済み
      out.push({ label: a.label, amount: a.amount, note: a.note || '' });
    });
    return out;
  }, [incentive, roleBonus, referrals, adjustments, payMonthLabel]);

  const dateContext = useMemo(() => {
    if (!ym) return null;
    const issueDate = new Date();
    // 翌月末: new Date(ym.year, ym.month + 1, 0) で「翌月の0日目」= 翌月末日
    const deadline = new Date(ym.year, ym.month + 1, 0);
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

  // PDF 生成 + 自動アップロード
  const handleCreate = async () => {
    const v = validateProfile();
    if (v) { showError(v); return; }
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

      const fileName = `${memberName}_${payMonthLabel}分.pdf`;
      const blob = pdf.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const { error } = await uploadPayrollInvoice(memberId, yyyymm, file);
      if (error) throw error;

      showMsg('請求書を作成し、本人ページに格納しました');
      await reloadInvoice();
    } catch (e) {
      console.error('[PayrollInvoiceGenerator]', e);
      showError('生成に失敗しました: ' + (e.message || '不明なエラー'));
    } finally {
      if (root) root.unmount();
      if (container && container.parentNode) container.parentNode.removeChild(container);
      setBusy(false);
    }
  };

  // ダウンロード時に強制する表示ファイル名（DBの古いfile_nameに引きずられない）
  const downloadFileName = `${memberName}_${payMonthLabel}分.pdf`;

  // 既存請求書のダウンロード
  const handleDownload = async () => {
    if (!savedInvoice?.storage_path) return;
    const { url, error } = await getPayrollInvoiceUrl(savedInvoice.storage_path, 600, downloadFileName);
    if (error || !url) { showError('ダウンロードURLの取得に失敗しました'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // 既存請求書の削除（→再作成可能に戻る）
  const handleDelete = async () => {
    if (!savedInvoice) return;
    if (!window.confirm(`${payMonthLabel}分の請求書を削除しますか？\n削除後はこの月の請求書を作り直せます。`)) return;
    setBusy(true);
    const { error } = await deletePayrollInvoice(memberId, yyyymm);
    setBusy(false);
    if (error) { showError('削除に失敗しました: ' + (error.message || '不明')); return; }
    showMsg('削除しました');
    await reloadInvoice();
  };

  const labelStyle = { fontSize: font.size.xs, color: color.textLight, display: 'block', marginBottom: 4, fontWeight: font.weight.semibold };
  const inputStyle = { padding: '8px 12px', borderRadius: radius.md, background: color.white, border: `1px solid ${color.border}`, color: color.textDark, fontSize: font.size.sm, fontFamily: font.family.sans, outline: 'none', width: '100%', boxSizing: 'border-box' };

  const titleText = `請求書（${payMonthLabel}分）`;
  const subtitle = savedInvoice
    ? '本人ページに格納済み。管理者が閲覧できます。'
    : `${payMonthLabel}分の支給データから業務委託請求書 PDF を自動生成し、本人ページに格納します`;

  // ── 格納済みビュー ─────────────────────────────────────────
  if (savedInvoice) {
    return (
      <Card padding="md" title={titleText} description={subtitle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
          <Badge variant="success" dot>格納済</Badge>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>{downloadFileName}</div>
            <div style={{ fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>
              {fmtFileSize(savedInvoice.file_size_bytes)} ・ {fmtTimestamp(savedInvoice.uploaded_at)}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
            <Button variant="secondary" size="sm" onClick={handleDownload}>ダウンロード</Button>
            {canEdit && (
              <>
                <Button variant="outline" size="sm" loading={busy} disabled={busy || totalPayout <= 0} onClick={handleCreate}>再作成</Button>
                <Button variant="danger" size="sm" loading={busy} onClick={handleDelete}>削除</Button>
              </>
            )}
          </div>
        </div>
        {msg && (<div style={{ fontSize: font.size.xs, color: color.success, fontWeight: font.weight.semibold }}>{msg}</div>)}
        {err && (<div style={{ fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>{err}</div>)}
      </Card>
    );
  }

  // ── 未作成ビュー（フォーム + 作成ボタン） ──────────────────
  return (
    <Card padding="md" title={titleText} description={subtitle}>
      {loadingInvoice ? (
        <div style={{ fontSize: font.size.sm, color: color.textLight }}>読込中...</div>
      ) : !canEdit ? (
        <div style={{ fontSize: font.size.sm, color: color.textLight }}>
          まだ請求書が作成されていません（本人のみ作成可）。
        </div>
      ) : (
        <>
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

          <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[3], display: 'flex', alignItems: 'center', gap: space[2] }}>
            <span>※ 入力内容は本人のアカウントに保存され、どの端末からでも自動入力されます</span>
            {savingProfile && (
              <span style={{ color: color.info, fontWeight: font.weight.semibold }}>保存中…</span>
            )}
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
                  <span>合計（税込）</span>
                  <span style={{ fontFamily: font.family.mono, color: color.navy }}>¥{fmt(totalPayout)}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button variant="primary" size="md" loading={busy} disabled={!canEdit || totalPayout <= 0} onClick={handleCreate}>
              請求書を作成
            </Button>
          </div>

          {msg && (<div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.success, fontWeight: font.weight.semibold }}>{msg}</div>)}
          {err && (<div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>{err}</div>)}
        </>
      )}
    </Card>
  );
}
