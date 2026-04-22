// アポ取得報告 (appo_report) から「先方の温度感」を抜き出して
// ceo_ma_intent ('positive' | 'wait' | 'unknown' | 'negative') に変換する。
// 実データに現れるパターン: 消極的 / 積極的 / 様子見 / 普通 / 中 / 低め /
// 比較的高い / やんわり断り / 不明 / 空欄 etc.

export function extractCeoMaIntent(appoReport) {
  if (!appoReport) return null;
  const text = String(appoReport);

  // 「先方の温度感」直後から、次の行頭 "・" or 改行 or "。" までを抽出
  const m = text.match(/先方の温度感[^→:：]*[→:：]\s*([^\n]{0,300}?)(?=\s*・|。|\n|$)/);
  const line = (m ? m[1] : '').trim();

  if (!line) return null;

  // 先頭キーワードを強く優先 (先頭一致で最大多数のケースを解決)
  // ポジティブ
  if (/^積極|^前向き|^比較的高|^角度高|^強い関心|^(?:関心|意欲|温度感)が高/.test(line)) return 'positive';
  // ネガティブ
  if (/^消極|^否定|^拒否|^やんわり断|^低[めい]|^やや低|^(?:関心|温度感)が低/.test(line)) return 'negative';
  // 中立 / 様子見
  if (/^様子見|^保留|^中立|^普通|^中$|^中[，、 (（]/.test(line)) return 'wait';
  // 不明
  if (/^不明|^明確ではない|^確認できず|^曖昧|^判断できず/.test(line)) return 'unknown';

  // 先頭で決まらない場合、本文全体のキーワードで後方互換的に判定
  if (/積極|前向き|関心が高い|意欲が高い|温度感が高/.test(line)) return 'positive';
  if (/消極|否定的|拒否|関心が低い|低め|やや低/.test(line)) return 'negative';
  if (/様子見|保留|中立/.test(line)) return 'wait';
  if (/不明|確認できず|曖昧/.test(line)) return 'unknown';

  return null;
}

// 住所文字列から都道府県を抽出
export function extractPrefecture(address) {
  if (!address) return '不明';
  const m = address.match(/^(.+?[都道府県])/);
  return m ? m[1] : '不明';
}

// 売上テキストを億円単位に変換。
// call_list_items.revenue は慣習的に「千円単位の生数値文字列」で保存されている
// (例: "270000" = 270,000千円 = 2.7億円)。
// 議事録側は "売上151,679千円" のような接尾辞つき。両方に対応する。
export function parseRevenueOku(text) {
  if (!text) return null;
  const s = String(text).replace(/[,\s¥￥\\]/g, '');

  const okuMatch = s.match(/([0-9.]+)\s*億/);
  const manMatch = s.match(/([0-9.]+)\s*万/);
  const senMatch = s.match(/([0-9.]+)\s*千円/);

  if (okuMatch) {
    const oku = parseFloat(okuMatch[1]);
    const man = manMatch ? parseFloat(manMatch[1]) / 10000 : 0;
    return oku + man;
  }
  if (manMatch) return parseFloat(manMatch[1]) / 10000;
  if (senMatch) return parseFloat(senMatch[1]) / 100000; // 千円 → 億
  // 接尾辞なしの生数値は千円単位と仮定 (DB convention)
  const num = parseFloat(s);
  if (!isNaN(num)) return num / 100000;
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
