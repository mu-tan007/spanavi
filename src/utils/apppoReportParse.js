// アポ取得報告 (appo_report) から「先方の温度感」を抜き出して
// ceo_ma_intent ('positive' | 'wait' | 'unknown' | 'negative') に変換する。
// テキストは「・先方の温度感→消極的。…」のような形式を想定。

export function extractCeoMaIntent(appoReport) {
  if (!appoReport) return null;
  const text = String(appoReport);

  // 「先方の温度感→」以降のセンテンス (最大 150 文字)
  const m = text.match(/先方の温度感[\s\S]{0,3}?[→:：]\s*([^\n。]{0,150})/);
  const tempLine = m ? m[1] : '';

  // 将来的な検討可否 を補助信号として併用
  const m2 = text.match(/将来的な検討(?:可否|可能性)[\s\S]{0,3}?[→:：]\s*([^\n。]{0,150})/);
  const futureLine = m2 ? m2[1] : '';

  const blob = `${tempLine} ${futureLine}`;

  if (/積極|前向き|強い関心|高い/.test(blob)) return 'positive';
  if (/消極|否定|拒否|関心が低い|低い/.test(blob)) return 'negative';
  if (/様子見|中立|様子を見|保留/.test(blob)) return 'wait';
  if (/不明|明確ではない|確認できず|曖昧|判断できず/.test(blob)) return 'unknown';

  // 何も引っ掛からなかった場合は null (未判定)
  return null;
}

// 住所文字列から都道府県を抽出
export function extractPrefecture(address) {
  if (!address) return '不明';
  const m = address.match(/^(.+?[都道府県])/);
  return m ? m[1] : '不明';
}

// 売上テキスト (例: "売上151,679千円") → 億単位の数値 or null
export function parseRevenueOku(text) {
  if (!text) return null;
  const s = String(text).replace(/[,\s¥￥\\]/g, '');

  // "1億234万" 等
  const okuMatch = s.match(/([0-9.]+)\s*億/);
  const manMatch = s.match(/([0-9.]+)\s*万/);
  const senMatch = s.match(/([0-9.]+)\s*千円/);

  if (okuMatch) {
    const oku = parseFloat(okuMatch[1]);
    const man = manMatch ? parseFloat(manMatch[1]) / 10000 : 0;
    return oku + man;
  }
  if (manMatch) return parseFloat(manMatch[1]) / 10000;
  if (senMatch) return parseFloat(senMatch[1]) * 1000 / 100000000; // 千円 → 円 → 億
  const num = parseFloat(s);
  if (!isNaN(num)) return num / 100000000;
  return null;
}

// appo_report から「売上XXX千円」を拾って億表記に整形。無ければ null。
export function extractRevenueFromReport(appoReport) {
  if (!appoReport) return null;
  const m = String(appoReport).match(/売上\s*([0-9,]+)\s*千円/);
  if (!m) return null;
  const sen = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(sen)) return null;
  return sen * 1000 / 100000000; // 億円
}

// appo_report から「訪問先：XX県...」を拾って住所を取得
export function extractAddressFromReport(appoReport) {
  if (!appoReport) return null;
  const m = String(appoReport).match(/訪問先[\s:：]+([^\n]+)/);
  return m ? m[1].trim() : null;
}
