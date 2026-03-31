// ============================================================
// 請求書PDF レンダリングコンポーネント（html2canvas + jsPDF 用）
// ============================================================

const PAGE_W = 794;
const PAGE_H = 1123;

const fontFamily = "'Noto Sans JP', 'Hiragino Sans', 'Meiryo', sans-serif";

const fmt = (n) => Number(n).toLocaleString('ja-JP');

export default function InvoicePDF({
  clientName,
  month,        // "3月" など
  items,        // [{ company, quantity, unitPrice, amount }]
  subtotal,
  tax,
  total,
  taxType,      // "税別" | "税込"
  invoiceNumber,
  issueDate,    // "2026年04月01日" など
  paymentDeadline, // "2026年04月30日" など
}) {
  // 明細テーブルの空行を埋める（最低8行）
  const minRows = Math.max(8, items.length + 1);
  const emptyRows = minRows - items.length;

  return (
    <div id="invoice-pdf-page" style={{
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
      <div style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, color: '#111', marginTop: 24, letterSpacing: 6 }}>
        請求書
      </div>

      {/* 宛先 + 発行元 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        {/* 左: 宛先 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111', borderBottom: '2px solid #111', paddingBottom: 4, display: 'inline-block' }}>
            {clientName} 様
          </div>
          <div style={{ fontSize: 11, color: '#333', marginTop: 12, lineHeight: 1.8 }}>
            <div>件名：業務委託料_{month}分</div>
            <div style={{ marginTop: 4 }}>下記のとおりご請求申し上げます。</div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>ご請求金額</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#111', fontFamily: "'JetBrains Mono', monospace" }}>
              ¥ {fmt(total)} -
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#333', marginTop: 8 }}>
            お支払い期限：{paymentDeadline}
          </div>
        </div>

        {/* 右: 発行元 */}
        <div style={{ width: 260, fontSize: 11, color: '#333', lineHeight: 1.7, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 6 }}>
            M&Aソーシングパートナーズ株式会社
          </div>
          <div>〒106-0031</div>
          <div>東京都港区西麻布4-12-13</div>
          <div>グランフィールド麻布霞町209</div>
          <div style={{ marginTop: 4 }}>TEL: 080-4134-4038</div>
          <div>shinomiya@ma-sp.co</div>
        </div>
      </div>

      {/* 明細テーブル */}
      <div style={{ marginTop: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0', borderTop: '2px solid #222', borderBottom: '2px solid #222' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, width: '50%', color: '#111' }}>品番・品名</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '12%', color: '#111' }}>数量</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, width: '19%', color: '#111' }}>単価</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, width: '19%', color: '#111' }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={{ padding: '10px 12px', color: '#222' }}>{item.company}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#222' }}>{item.quantity}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(item.unitPrice)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(item.amount)}</td>
              </tr>
            ))}
            {/* 空行で埋める */}
            {Array.from({ length: emptyRows }, (_, i) => (
              <tr key={`empty-${i}`} style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={{ padding: '10px 12px' }}>&nbsp;</td>
                <td style={{ padding: '10px 12px' }}></td>
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
              {taxType === '税別' ? (
                <>
                  <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111' }}>小計</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#111', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(subtotal)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111' }}>消費税 (10%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#111', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(tax)}</td>
                  </tr>
                  <tr style={{ borderBottom: '2px solid #222' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#111' }}>合計</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#111', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(total)}</td>
                  </tr>
                </>
              ) : (
                <>
                  <tr style={{ borderBottom: '2px solid #222' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#111' }}>合計（税込）</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#111', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(total)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ padding: '6px 12px', fontSize: 10, color: '#666', textAlign: 'right' }}>
                      （内消費税 ¥{fmt(tax)}）
                    </td>
                  </tr>
                </>
              )}
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
        <span style={{ fontWeight: 700 }}>お振込先：</span><br />
        GMOあおぞらネット銀行　法人営業部(101)　普通預金　2370528　M&Aソーシングパートナーズ株式会社
      </div>
    </div>
  );
}
