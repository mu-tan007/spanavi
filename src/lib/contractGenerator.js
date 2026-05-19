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
