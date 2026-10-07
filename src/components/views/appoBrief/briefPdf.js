// 面談前の1枚資料をPDFにする（請求書のPDFと同じく、画面に描いて html2canvas → jsPDF）
import React from 'react';
import OnePageBrief from './OnePageBrief';

export function briefFileName(m, createdOn) {
  const safe = String(m.company || '').replace(/[\\/:*?"<>|]/g, '');
  return `面談前資料_${safe}_${String(createdOn).replace(/\//g, '')}.pdf`;
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
