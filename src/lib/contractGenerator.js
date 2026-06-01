// =====================================================================
// 業務委託契約書 .docx 生成ヘルパー
// ---------------------------------------------------------------------
// docxtemplater で Word テンプレ内のプレースホルダ({{name}} 等) を差し込む。
// 生成後の Word を file-saver でダウンロード → むー様が手動で PDF 化し、
// GMOサインへアップロードする運用。
// =====================================================================

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { supabase } from './supabase';

// テンプレ Storage のパス: {orgId}/{templateId}.docx
export function templateStoragePath(orgId, templateId) {
  return `${orgId}/${templateId}.docx`;
}

// 終了日の自動算出: 開始日 + 1年 - 1日（1年契約、満了日）
export function autoEndDate(startDateStr) {
  if (!startDateStr) return '';
  const d = new Date(startDateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// YYYY-MM-DD → 2026年5月18日 形式
export function formatJpDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

// 口座種別の表示用整形
function formatAccountType(t) {
  if (!t) return '';
  const map = { ordinary: '普通', checking: '当座', savings: '貯蓄' };
  return map[t] || t;
}

// 氏名フィールドの半角スペースを全角スペースへ正規化（契約書での体裁統一）
function normalizeJpName(s) {
  if (!s) return '';
  return String(s).replace(/ /g, '　');
}

// テンプレ用のプレースホルダ値を組み立てる
export function buildPlaceholders({ member, startDate, endDate, bank }) {
  const b = bank || {};
  return {
    name: normalizeJpName(member?.name || ''),
    address: member?.address || '',
    start_date: formatJpDate(startDate),
    end_date: formatJpDate(endDate),
    bank_name: b.bank_name || '',
    bank_branch: b.branch_name || '',
    account_type: formatAccountType(b.account_type),
    account_number: b.account_number || '',
    account_holder: b.account_holder || member?.name || '',
  };
}

// Storage からテンプレ .docx をダウンロードして ArrayBuffer で返す
// 注: Supabase Storage の Cache-Control デフォルトが 3600 秒なので
// ブラウザ/CDN が古い版を返すことがある。署名付きURLにキャッシュバスター
// クエリを付けて fetch することで常に最新を取りに行く。
export async function downloadTemplateBlob(filePath) {
  const { data: signed, error: signErr } = await supabase.storage
    .from('contract-templates')
    .createSignedUrl(filePath, 120);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`テンプレ取得失敗: ${signErr?.message || 'no signed url'}`);
  }
  const bust = `${signed.signedUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  const res = await fetch(signed.signedUrl + bust, { cache: 'no-store' });
  if (!res.ok) throw new Error(`テンプレ取得失敗: HTTP ${res.status}`);
  return await res.arrayBuffer();
}

// docxtemplater で差し込み実施 → Blob 返却
export function renderDocxBlob(templateAb, placeholders) {
  const zip = new PizZip(templateAb);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // docxtemplater のデフォルトデリミタは { } なので {{ }} を使うには明示が必要
    delimiters: { start: '{{', end: '}}' },
  });
  try {
    doc.render(placeholders);
  } catch (e) {
    // docxtemplater は「Multi error」として e.properties.errors に詳細を持つ
    // ユーザーに見える形で 1 行目を throw、残りはコンソールに出す
    const errs = e?.properties?.errors;
    if (Array.isArray(errs) && errs.length > 0) {
      try { console.error('[contract] docxtemplater errors:', errs); } catch (_) {}
      const first = errs[0];
      const msg = first?.properties?.explanation || first?.message || first?.id || JSON.stringify(first);
      throw new Error(`docxtemplater: ${msg}`);
    }
    throw e;
  }
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

// 全部入りユーティリティ: テンプレを取得→差し込み→ダウンロード
export async function generateAndDownloadContract({
  template,           // { id, file_path, name }
  member,             // members 行
  startDate,
  endDate,
  bank,               // 口座情報
}) {
  const ab = await downloadTemplateBlob(template.file_path);
  const placeholders = buildPlaceholders({ member, startDate, endDate, bank });
  const blob = renderDocxBlob(ab, placeholders);
  const safeName = (member?.name || 'member').replace(/[\\/:*?"<>|]/g, '_');
  const filename = `業務委託契約書_${safeName}_${startDate || ''}.docx`;
  saveAs(blob, filename);
  return { placeholders, filename };
}

// =====================================================================
// クライアント契約書 (NDA / 業務委託) 向け
// =====================================================================

// YYYY-MM-DD → 「令和8年6月1日」形式 (明治5年=1873以降を簡易対応)
export function formatJpDateWareki(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  // 令和: 2019/05/01〜
  if (y > 2019 || (y === 2019 && m >= 5)) {
    const ry = y - 2018;
    return `令和${ry}年${m}月${d}日`;
  }
  // 平成: 1989/01/08〜2019/04/30
  if (y > 1989 || (y === 1989 && m >= 1 && d >= 8)) {
    const hy = y - 1988;
    return `平成${hy}年${m}月${d}日`;
  }
  return `${y}年${m}月${d}日`;
}

// 契約期間の終了日を自動計算 (開始日 + N月 - 1日)
export function calcPeriodEnd(startDateStr, months = 12) {
  if (!startDateStr) return '';
  const d = new Date(startDateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 住所を当社表記 (一丁目1-2 形式) に正規化
// 例: 「東京都港区赤坂1-11-44」→「東京都港区赤坂一丁目11-44」
//     「東京都港区赤坂1丁目11番44号」→「東京都港区赤坂一丁目11-44」
// 例外: 都道府県/市区町村の数字は触らない (例: 旧東京市1区... 等は対象外)
const KANSUJI = ['〇','一','二','三','四','五','六','七','八','九','十'];
function toKanji(n) {
  if (n < 0 || n > 10) return String(n);
  return KANSUJI[n];
}
export function normalizeAddressToCompanyStyle(addr) {
  if (!addr) return '';
  let s = String(addr).trim();
  // (-1) 文字化け文字を除去 (Claude web search で時々混入する Œ, œ, æ, ß や 0x2000 系の不可視文字等)
  //      日本住所で使う文字 (漢字/ひらがな/カタカナ/英数字/半角空白/-/丁目/番/号/カッコ) のみ許可
  s = s.replace(/[^　-ヿ一-鿿㐀-䶿a-zA-Z0-9 \-丁目番号()（）]/g, '');
  // (0) 全角数字を半角化 (先にやらないと丁目検出ミスする)
  s = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  // (1) 既に「丁目」が含まれていなければ、「N丁目」「N-」のN(町名直後の最初の数字) を漢数字+「丁目」に変換
  //     既に「三丁目5-1」のような表記なら触らない (誤って「三丁目五丁目」にならないように)
  if (!s.includes('丁目')) {
    s = s.replace(/([一-龥ぁ-んァ-ヶ々]{1,12}?)(\d{1,2})(?=-)/, (_m, name, num) => {
      return `${name}${toKanji(Number(num))}丁目`;
    });
  }
  // (2) 「番N号」「N番N号」を「N-N」表記に
  s = s.replace(/(\d+)番(\d+)号?/g, '$1-$2');
  // (3) 単独の「番」「号」を - / 空 に
  s = s.replace(/番/g, '-').replace(/号/g, '');
  // (4) 連続ハイフン圧縮
  s = s.replace(/-+/g, '-').replace(/-$/, '');
  return s;
}

// CRM の報酬体系 (タイプ別) を契約書文面に表記化
// rewardSummary: [{ name, categories: [商材名], rid, tiers: [{ memo, lo, hi, price }], tax, basis }]
// 出力例:
//   ■M&A 売り手ソーシング (中単価利益連動4段階 / 当期純利益 / 税込)
//   ・5000万円未満：15万円
//   ・5000万〜1億：20万円
//   ・1億〜3億：30万円
//   ・3億以上：50万円
// 金額表記: 1234567 → 「123万4567円」、5000万 → 「5,000万円」
function fmtJpYen(n) {
  if (n == null) return '';
  const v = Number(n);
  if (v >= 100000000) {
    const oku = v / 100000000;
    return (oku % 1 === 0 ? oku.toString() : oku.toFixed(1)) + '億円';
  }
  if (v >= 10000) {
    const man = v / 10000;
    return (man % 1 === 0 ? man.toString() : man.toFixed(1)) + '万円';
  }
  return v.toLocaleString() + '円';
}

export function formatRewardTable(rewardSummary) {
  if (!Array.isArray(rewardSummary) || rewardSummary.length === 0) return '報酬体系未設定';
  const lines = [];
  for (const r of rewardSummary) {
    const tiers = r.tiers || [];
    if (tiers.length === 0) {
      lines.push('（段階情報未設定）');
      continue;
    }
    tiers.forEach(t => {
      if (t.memo) {
        // memo に「5000万円未満：15万円」のような完成形がある時はそれを使う
        lines.push(t.memo);
      } else {
        // lo/hi/price から自動生成 (例: 「売上高5,000万円未満：15万円」)
        let range;
        if (t.lo == null || t.lo === 0) {
          range = (r.basis || '売上高') + fmtJpYen(t.hi) + '未満';
        } else if (t.hi == null || t.hi >= 999999999999) {
          range = (r.basis || '売上高') + fmtJpYen(t.lo) + '以上';
        } else {
          range = (r.basis || '売上高') + fmtJpYen(t.lo) + '以上' + fmtJpYen(t.hi) + '未満';
        }
        lines.push(range + 'の会社：' + fmtJpYen(t.price));
      }
    });
  }
  return lines.join('\n').trim();
}

// クライアント契約書 用 placeholders
export function buildClientPlaceholders({
  clientName, clientAddress, clientRepresentative,
  contractDate, periodStart, periodEnd,
  rewardTableText, tax, paymentSite, customClauses,
}) {
  return {
    client_name: clientName || '',
    client_address: clientAddress || '',
    client_representative: clientRepresentative || '',
    contract_date: formatJpDateWareki(contractDate),
    period_start: formatJpDateWareki(periodStart),
    period_end: formatJpDateWareki(periodEnd),
    reward_table: rewardTableText || '',
    tax: tax || '税別',
    payment_site: paymentSite || '',
    // 入力が空なら空文字で展開 (テンプレ側で {{custom_clauses}} を残す/消す判断は運用次第)
    custom_clauses: customClauses || '',
  };
}

// クライアント契約書の生成 + ダウンロード
export async function generateAndDownloadClientContract({
  template, clientName, clientAddress, clientRepresentative,
  contractDate, periodStart, periodEnd,
  rewardTableText, tax, paymentSite, customClauses,
}) {
  const ab = await downloadTemplateBlob(template.file_path);
  const placeholders = buildClientPlaceholders({
    clientName, clientAddress, clientRepresentative,
    contractDate, periodStart, periodEnd,
    rewardTableText, tax, paymentSite, customClauses,
  });
  const blob = renderDocxBlob(ab, placeholders);
  const safeName = (clientName || 'client').replace(/[\\/:*?"<>|]/g, '_');
  // テンプレ名から運用識別子 (Spanaviテンプレ/テンプレ/ひな形) を除去して
  // 契約書本来の名称 (秘密保持契約書/業務委託契約書 等) に整える
  const baseType = (template?.name || 'contract')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[_\s]*Spanaviテンプレ$/, '')
    .replace(/[_\s]*テンプレ$/, '')
    .replace(/[_\s]*ひな形$/, '');
  // 例: 業務委託契約書_M&Aソーシングパートナーズ株式会社 御中.docx
  const filename = `${baseType}_${safeName} 御中.docx`;
  saveAs(blob, filename);
  return { placeholders, filename };
}
