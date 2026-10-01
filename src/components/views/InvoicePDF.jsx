// ============================================================
// 請求書PDF レンダリングコンポーネント（html2canvas + jsPDF 用）
// 印刷用PDFのため、白背景・黒文字を維持。トークン経由で色値は変えない。
// 明細が1ページに収まらないときは2ページ目以降へ続ける（A4で切れて行が消えないように）。
// ============================================================
import { font } from '../../constants/design';

const PAGE_W = 794;
const PAGE_H = 1123;

// 1ページに載せる明細の行数。合計欄・振込先の載るページ（最終ページ）は少なめにする。
// 行の高さは約37px。社名が折り返すと高くなるので余裕を持たせ、はみ出しは renderInvoicePdf で検出する。
const FIRST_PAGE_ROWS = 14;
const FIRST_PAGE_ROWS_WITH_TOTAL = 11;
const NEXT_PAGE_ROWS = 21;
const NEXT_PAGE_ROWS_WITH_TOTAL = 18;
const MIN_ROWS = 8;

const fontFamily = "'Noto Sans JP', 'Hiragino Sans', 'Meiryo', sans-serif";
const monoFamily = font.family.mono;

const fmt = (n) => Number(n).toLocaleString('ja-JP');

// 明細をページごとに分ける。最終ページには必ず1行以上の明細を残す（合計欄だけのページを作らない）。
export function paginateInvoiceItems(items) {
  const pages = [];
  let rest = items;
  while (true) {
    const first = pages.length === 0;
    const lastCap = first ? FIRST_PAGE_ROWS_WITH_TOTAL : NEXT_PAGE_ROWS_WITH_TOTAL;
    if (rest.length <= lastCap) { pages.push(rest); return pages; }
    const take = Math.min(first ? FIRST_PAGE_ROWS : NEXT_PAGE_ROWS, rest.length - 1);
    pages.push(rest.slice(0, take));
    rest = rest.slice(take);
  }
}

const cell = { padding: '10px 12px', color: '#222' };
const thCell = { padding: '8px 12px', fontWeight: font.weight.semibold, color: '#111' };

function ItemTable({ rows, emptyRows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr style={{ backgroundColor: '#f0f0f0', borderTop: '2px solid #222', borderBottom: '2px solid #222' }}>
          <th style={{ ...thCell, textAlign: 'left', width: '36%' }}>品番・品名</th>
          <th style={{ ...thCell, textAlign: 'center', width: '10%' }}>数量</th>
          <th style={{ ...thCell, textAlign: 'right', width: '17%' }}>単価</th>
          <th style={{ ...thCell, textAlign: 'right', width: '17%' }}>金額</th>
          <th style={{ ...thCell, textAlign: 'left', width: '20%' }}>備考</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={cell}>{item.company}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{item.quantity}</td>
            <td style={{ ...cell, textAlign: 'right', fontFamily: monoFamily }}>{fmt(item.unitPrice)}</td>
            <td style={{ ...cell, textAlign: 'right', fontFamily: monoFamily }}>{fmt(item.amount)}</td>
            <td style={{ ...cell, fontSize: 10 }}>{item.note || ''}</td>
          </tr>
        ))}
        {/* 空行で埋める */}
        {Array.from({ length: emptyRows }, (_, i) => (
          <tr key={`empty-${i}`} style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={cell}>&nbsp;</td>
            <td style={cell}></td>
            <td style={cell}></td>
            <td style={cell}></td>
            <td style={cell}></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ subtotal, tax, total, taxType }) {
  const label = { padding: '8px 12px', fontWeight: font.weight.semibold, color: '#111' };
  const value = { padding: '8px 12px', textAlign: 'right', color: '#111', fontFamily: monoFamily };
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: 280 }}>
        <tbody>
          {taxType === '税別' ? (
            <>
              <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={label}>小計</td>
                <td style={value}>{fmt(subtotal)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={label}>消費税 (10%)</td>
                <td style={value}>{fmt(tax)}</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #222' }}>
                <td style={{ ...label, fontWeight: font.weight.bold }}>合計</td>
                <td style={{ ...value, fontWeight: font.weight.bold }}>{fmt(total)}</td>
              </tr>
            </>
          ) : (
            <>
              <tr style={{ borderBottom: '2px solid #222' }}>
                <td style={{ ...label, fontWeight: font.weight.bold }}>合計（税込）</td>
                <td style={{ ...value, fontWeight: font.weight.bold }}>{fmt(total)}</td>
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
  );
}

export default function InvoicePDF({
  clientName,
  month,        // "3月" など
  items,        // [{ company, quantity, unitPrice, amount, note }]
  subtotal,
  tax,
  total,
  taxType,      // "税別" | "税込"
  invoiceNumber,
  issueDate,    // "2026年04月01日" など
  paymentDeadline, // "2026年04月30日" など
}) {
  const pages = paginateInvoiceItems(items);
  const pageCount = pages.length;

  return (
    <>
      {pages.map((rows, p) => {
        const isFirst = p === 0;
        const isLast = p === pageCount - 1;
        // 1ページで収まるときだけ、従来どおり空行で最低8行に揃える
        const emptyRows = pageCount === 1 ? Math.max(MIN_ROWS, rows.length + 1) - rows.length : 0;
        return (
          <div key={p} className="invoice-pdf-page" style={{
            width: PAGE_W,
            height: PAGE_H,
            background: '#fff',
            fontFamily,
            boxSizing: 'border-box',
            padding: '48px 52px 36px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* 発行日・請求番号 */}
            <div style={{ textAlign: 'right', fontSize: 12, color: '#222', lineHeight: 1.8 }}>
              <div>{issueDate}</div>
              <div>請求番号: {invoiceNumber}</div>
            </div>

            {isFirst ? (
              <>
                {/* タイトル */}
                <div style={{
                  textAlign: 'center', fontSize: 28, fontWeight: font.weight.bold,
                  color: '#111', marginTop: 24, letterSpacing: 6,
                }}>
                  請求書
                </div>

                {/* 宛先 + 発行元 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
                  {/* 左: 宛先 */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 15, fontWeight: font.weight.bold,
                      color: '#111', borderBottom: '2px solid #111',
                      paddingBottom: 4, display: 'inline-block',
                    }}>
                      {clientName} 様
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

                  {/* 右: 発行元 */}
                  <div style={{ width: 260, fontSize: 11, color: '#333', lineHeight: 1.7, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: font.weight.bold, color: '#111', marginBottom: 6 }}>
                      Spartia株式会社
                    </div>
                    <div>〒106-0031</div>
                    <div>東京都港区西麻布4-12-13</div>
                    <div>グランフィールド麻布霞町209</div>
                    <div style={{ marginTop: 4 }}>TEL: 080-4134-4038</div>
                    <div>shinomiya@ma-sp.co</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, fontWeight: font.weight.bold, color: '#111', marginTop: 8 }}>
                {clientName} 様　請求書（明細の続き）
              </div>
            )}

            {/* 明細テーブル */}
            <div style={{ marginTop: isFirst ? 28 : 16 }}>
              <ItemTable rows={rows} emptyRows={emptyRows} />
              {isLast && <Totals subtotal={subtotal} tax={tax} total={total} taxType={taxType} />}
            </div>

            {/* 振込先・ページ番号（ページ下端に寄せる） */}
            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              {isLast && (
                <div style={{
                  fontSize: 11, color: '#222', lineHeight: 1.8,
                  borderTop: '1px solid #ccc', paddingTop: 12,
                }}>
                  <span style={{ fontWeight: font.weight.bold }}>お振込先：</span><br />
                  GMOあおぞらネット銀行　法人営業部(101)　普通預金　2370528　M&Aソーシングパートナーズ株式会社
                </div>
              )}
              {pageCount > 1 && (
                <div style={{ textAlign: 'center', fontSize: 10, color: '#666', marginTop: 8 }}>
                  {p + 1} / {pageCount}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// 請求書を画面外に描画し、ページごとに画像化してA4のPDFにまとめる。
// 明細がページからはみ出したら、切れたPDFを出さずにエラーにする。
export async function renderInvoicePdf(props) {
  const ReactDOM = await import('react-dom/client');
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  try {
    root.render(<InvoicePDF {...props} />);
    await new Promise(resolve => setTimeout(resolve, 600));

    const pageEls = [...container.querySelectorAll('.invoice-pdf-page')];
    const overflowed = pageEls.findIndex(el => el.scrollHeight > el.clientHeight + 1);
    if (overflowed >= 0) throw new Error(`請求書の${overflowed + 1}ページ目で明細がはみ出しました`);

    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    for (let i = 0; i < pageEls.length; i++) {
      const canvas = await html2canvas(pageEls[i], { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
    }
    return pdf;
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}
