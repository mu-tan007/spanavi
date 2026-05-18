// ============================================================
// メンバー請求書PDF（メンバー個人 → M&Aソーシングパートナーズ向け）
// html2canvas + jsPDF 用の印刷レイアウト。白背景・黒文字。
// ============================================================
import { font } from '../../constants/design';

const PAGE_W = 794;
const PAGE_H = 1123;

const fontFamily = "'Noto Sans JP', 'Hiragino Sans', 'Meiryo', sans-serif";
const monoFamily = font.family.mono;

const fmt = (n) => Number(n).toLocaleString('ja-JP');

export default function MemberInvoicePDF({
  memberName,
  memberPostalCode,    // 例: "150-0001"
  memberAddress,       // 例: "東京都渋谷区..."
  memberPhone,         // optional
  memberEmail,         // optional
  taxInvoiceNumber,    // 適格請求書発行事業者番号 (optional)
  month,               // "4月" など
  items,               // [{ label, amount, note? }]
  total,
  invoiceNumber,
  issueDate,           // "2026年05月18日" など
  paymentDeadline,     // "2026年05月31日" など
  bankName,
  branchName,
  accountType,         // "普通" | "当座"
  accountNumber,
  accountHolderKana,
}) {
  const minRows = Math.max(6, items.length + 1);
  const emptyRows = minRows - items.length;

  return (
    <div id="member-invoice-pdf-page" style={{
      width: PAGE_W,
      height: PAGE_H,
      background: '#fff',
      fontFamily,
      boxSizing: 'border-box',
      padding: '48px 52px 36px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 発行日・請求番号 */}
      <div style={{ textAlign: 'right', fontSize: 12, color: '#222', lineHeight: 1.8 }}>
        <div>{issueDate}</div>
        <div>請求番号: {invoiceNumber}</div>
      </div>

      {/* タイトル */}
      <div style={{
        textAlign: 'center', fontSize: 28, fontWeight: font.weight.bold,
        color: '#111', marginTop: 24, letterSpacing: 6,
      }}>
        請求書
      </div>

      {/* 宛先 + 発行元 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        {/* 左: 宛先（MASP） */}
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 15, fontWeight: font.weight.bold,
            color: '#111', borderBottom: '2px solid #111',
            paddingBottom: 4, display: 'inline-block',
          }}>
            M&Aソーシングパートナーズ株式会社 様
          </div>
          <div style={{ fontSize: 11, color: '#333', marginTop: 12, lineHeight: 1.8 }}>
            <div>件名：業務委託料_{month}分</div>
            <div style={{ marginTop: 4 }}>下記のとおりご請求申し上げます。</div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontSize: 13, fontWeight: font.weight.bold, color: '#111' }}>ご請求金額</span>
            <span style={{
              fontSize: 22, fontWeight: font.weight.bold,
              color: '#111', fontFamily: monoFamily,
            }}>
              ¥ {fmt(total)} -
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#333', marginTop: 8 }}>
            お支払い期限：{paymentDeadline}
          </div>
        </div>

        {/* 右: 発行元（メンバー） */}
        <div style={{ width: 280, fontSize: 11, color: '#333', lineHeight: 1.7, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: font.weight.bold, color: '#111', marginBottom: 6 }}>
            {memberName}
          </div>
          {memberPostalCode && <div>〒{memberPostalCode}</div>}
          {memberAddress && <div>{memberAddress}</div>}
          {memberPhone && <div style={{ marginTop: 4 }}>TEL: {memberPhone}</div>}
          {memberEmail && <div>{memberEmail}</div>}
          {taxInvoiceNumber && (
            <div style={{ marginTop: 6 }}>登録番号: {taxInvoiceNumber}</div>
          )}
        </div>
      </div>

      {/* 明細テーブル */}
      <div style={{ marginTop: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0', borderTop: '2px solid #222', borderBottom: '2px solid #222' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: font.weight.semibold, width: '60%', color: '#111' }}>項目</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: font.weight.semibold, width: '20%', color: '#111' }}>金額</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: font.weight.semibold, width: '20%', color: '#111' }}>備考</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={{ padding: '10px 12px', color: '#222' }}>{item.label}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#222', fontFamily: monoFamily }}>{fmt(item.amount)}</td>
                <td style={{ padding: '10px 12px', color: '#222', fontSize: 10 }}>{item.note || ''}</td>
              </tr>
            ))}
            {Array.from({ length: emptyRows }, (_, i) => (
              <tr key={`empty-${i}`} style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={{ padding: '10px 12px' }}>&nbsp;</td>
                <td style={{ padding: '10px 12px' }}></td>
                <td style={{ padding: '10px 12px' }}></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 合計セクション */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 0 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, width: 280 }}>
            <tbody>
              <tr style={{ borderBottom: '2px solid #222' }}>
                <td style={{ padding: '8px 12px', fontWeight: font.weight.bold, color: '#111' }}>合計</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: font.weight.bold, color: '#111', fontFamily: monoFamily }}>{fmt(total)}</td>
              </tr>
              <tr>
                <td colSpan={2} style={{ padding: '6px 12px', fontSize: 10, color: '#666', textAlign: 'right' }}>
                  ※ 業務委託に基づく報酬のため消費税は対象外
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 振込先 */}
      <div style={{
        position: 'absolute', bottom: 36, left: 52, right: 52,
        fontSize: 11, color: '#222', lineHeight: 1.8,
        borderTop: '1px solid #ccc', paddingTop: 12,
      }}>
        <span style={{ fontWeight: font.weight.bold }}>お振込先：</span><br />
        {bankName}　{branchName}　{accountType}預金　{accountNumber}　{accountHolderKana}
      </div>
    </div>
  );
}
