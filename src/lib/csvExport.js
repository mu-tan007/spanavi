// 汎用 CSV エクスポートヘルパー
// - BOM 付き UTF-8 で Excel 互換
// - セル値はダブルクォート/カンマ/改行を含む場合エスケープ
// - rows は行配列、columns は { header, accessor } の列定義配列
//   accessor は (row) => any。返り値が null/undefined は空文字に変換。

function escapeCell(value) {
  if (value == null) return '';
  const s = String(value);
  // ダブルクォート/カンマ/改行のいずれかを含む場合は "..." で囲み、内部の " を "" にエスケープ
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCsv(rows, columns) {
  const headerLine = columns.map(c => escapeCell(c.header)).join(',');
  const lines = [headerLine];
  for (const row of rows) {
    const cells = columns.map(c => {
      try {
        return escapeCell(c.accessor(row));
      } catch {
        return '';
      }
    });
    lines.push(cells.join(','));
  }
  // CRLF が Excel 互換性で安全
  return lines.join('\r\n');
}

export function downloadCsv(filename, rows, columns) {
  const csv = buildCsv(rows, columns);
  // BOM 付き UTF-8
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 少し遅らせて revoke (Safari 対策)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ファイル名用の YYYY-MM-DD (JST)
export function todayJST() {
  const d = new Date();
  const jst = new Date(d.getTime() + (9 * 60 - d.getTimezoneOffset()) * 60_000);
  return jst.toISOString().slice(0, 10);
}
