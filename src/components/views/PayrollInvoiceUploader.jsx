import { useEffect, useRef, useState } from 'react';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Button, Card, Badge } from '../ui';
import {
  uploadPayrollInvoice,
  fetchPayrollInvoice,
  getPayrollInvoiceUrl,
  deletePayrollInvoice,
} from '../../lib/supabaseWrite';

const ACCEPT_MIME = 'application/pdf,image/png,image/jpeg';
const MAX_BYTES = 5 * 1024 * 1024;

// メンバー × 月 の請求書ファイル管理 UI。
// canEdit=true のときアップロード / 差替 / 削除可。false（管理者が他人閲覧時）は閲覧のみ。
export default function PayrollInvoiceUploader({ memberId, payMonth, canEdit = true }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  const reload = async () => {
    if (!memberId || !payMonth) { setInvoice(null); return; }
    setLoading(true);
    const { data } = await fetchPayrollInvoice(memberId, payMonth);
    setInvoice(data || null);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId, payMonth]);

  const showError = (m) => { setErr(m); setTimeout(() => setErr(''), 4000); };
  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const handlePick = () => { if (inputRef.current) inputRef.current.click(); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) { showError('5MB を超えるファイルはアップロードできません'); return; }
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
      showError('PDF / PNG / JPG のみアップロード可能です');
      return;
    }
    setBusy(true);
    const { error } = await uploadPayrollInvoice(memberId, payMonth, file);
    setBusy(false);
    if (error) { showError('アップロードに失敗しました: ' + (error.message || '不明')); return; }
    showMsg('請求書を格納しました');
    reload();
  };

  const handleDownload = async () => {
    if (!invoice?.storage_path) return;
    const { url, error } = await getPayrollInvoiceUrl(invoice.storage_path);
    if (error || !url) { showError('ダウンロードURLの取得に失敗しました'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async () => {
    if (!invoice) return;
    if (!window.confirm(`${payMonth} の請求書を削除しますか？`)) return;
    setBusy(true);
    const { error } = await deletePayrollInvoice(memberId, payMonth);
    setBusy(false);
    if (error) { showError('削除に失敗しました: ' + (error.message || '不明')); return; }
    showMsg('削除しました');
    reload();
  };

  const fmtSize = (b) => {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
  };

  const fmtTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card padding="md" title="請求書" description={`${payMonth} 分の請求書ファイル（PDF / PNG / JPG, 5MB まで）`}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MIME}
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      {loading ? (
        <div style={{ fontSize: font.size.sm, color: color.textLight }}>読込中...</div>
      ) : invoice ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <Badge variant="success" dot>格納済</Badge>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>{invoice.file_name}</div>
            <div style={{ fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>
              {fmtSize(invoice.file_size_bytes)} ・ {fmtTime(invoice.uploaded_at)}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
            <Button variant="secondary" size="sm" onClick={handleDownload}>ダウンロード</Button>
            {canEdit && (
              <>
                <Button variant="outline" size="sm" loading={busy} onClick={handlePick}>差替</Button>
                <Button variant="danger" size="sm" loading={busy} onClick={handleDelete}>削除</Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size.sm, color: color.textLight }}>未アップロード</span>
          {canEdit && (
            <Button variant="primary" size="sm" loading={busy} onClick={handlePick}>請求書をアップロード</Button>
          )}
        </div>
      )}
      {msg && (
        <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.success, fontWeight: font.weight.semibold }}>{msg}</div>
      )}
      {err && (
        <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.danger, fontWeight: font.weight.semibold }}>{err}</div>
      )}
    </Card>
  );
}
