// 面談前の1枚資料をPDFにする（請求書のPDFと同じく、画面に描いて html2canvas → jsPDF）
import React from 'react';
import OnePageBrief from './OnePageBrief';

/** 社名を短くする：株式会社→(株)・有限会社→(有)・合同会社→(同)、全角の括弧は半角に、空白は詰める（2026-10-08 むー様） */
export function shortCorpName(name) {
  return String(name || '')
    .replace(/株式会社/g, '(株)').replace(/有限会社/g, '(有)').replace(/合同会社/g, '(同)')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/[\s　]/g, '');
}

/** ファイル名は「ご面談前資料_アポ取得先企業名_日付」（例：ご面談前資料_(有)笠井畜産_20261008.pdf） */
export function briefFileName(m, createdOn) {
  const safe = shortCorpName(m.company).replace(/[\\/:*?"<>|]/g, '');
  return `ご面談前資料_${safe}_${String(createdOn).replace(/\//g, '')}.pdf`;
}

/** @returns {Promise<{ blob: Blob, file: File, base64: string, fileName: string }>} */
export async function renderBriefPdf(m) {
  const createdOn = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');
  const ReactDOM = await import('react-dom/client');
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  try {
    root.render(React.createElement(OnePageBrief, { m, createdOn }));
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 500));
    const el = container.querySelector('.ob-page');
    // html2canvas は「palt」（括弧や・を詰める組み方）に対応しておらず、詰めて測った幅に詰めずに描くので文字が重なる。
    // PDF にするときだけ詰めを外す（2026-10-08 笠井畜産の1枚資料で重なり）
    // Chrome は続いた約物（」「・、「 など）を自動で詰める（text-spacing-trim）。これも html2canvas は再現できず括弧が欠けるので外す
    const plain = (n) => { n.style.fontFeatureSettings = 'normal'; n.style.setProperty('text-spacing-trim', 'space-all'); };
    plain(el);
    container.querySelectorAll('*').forEach(plain);
    await new Promise(resolve => setTimeout(resolve, 50));
    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    const blob = pdf.output('blob');
    const fileName = briefFileName(m, createdOn);
    const base64 = pdf.output('datauristring').split(',')[1];
    return { blob, file: new File([blob], fileName, { type: 'application/pdf' }), base64, fileName };
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}
