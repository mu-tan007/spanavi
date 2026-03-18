import { useState } from "react";
import { C } from '../../constants/colors';
import { CALL_RESULTS } from '../../constants/callResults';
import { insertCallListItems } from '../../lib/supabaseWrite';
import { dialPhone } from '../../utils/phone';

export default function CSVPhoneList({ listId, list, importedCSVs, setImportedCSVs, setCallingScreen, setCallFlowScreen }) {
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [prefFilter, setPrefFilter] = useState("");
  const [pageStart, setPageStart] = useState(0);
  const [flowStartNo, setFlowStartNo] = useState('');
  const [flowEndNo, setFlowEndNo] = useState('');
  const PAGE_SIZE = 20;
  const csvData = importedCSVs[listId] || [];

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;

      // ── ヘッダー正規化（全角→半角、括弧統一、trim）──────────────
      const normalizeHeader = (s) => s
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/\u3000/g, ' ')
        .replace(/（/g, '(').replace(/）/g, ')')
        .replace(/．/g, '.').replace(/／/g, '/')
        .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

      // ── CSV行パース（ダブルクォート・カンマ対応）──────────────────
      const parseCSVLine = (line) => {
        const result = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (!inQ) { inQ = true; }
            else if (line[i + 1] === '"') { cur += '"'; i++; }
            else { inQ = false; }
          } else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };

      const rawHeaders = parseCSVLine(lines[0]).map(normalizeHeader);

      // ── 単位検出（売上高・純利益用）─────────────────────────────
      const detectUnit = (h) => {
        if (h.includes('(億円)')) return '億円';
        if (h.includes('(百万円)')) return '百万円';
        if (h.includes('(千円)')) return '千円';
        if (h.includes('(円)')) return '円';
        return '千円'; // 単位なし → 千円とみなす
      };

      // ── 千円単位に統一変換 ────────────────────────────────────
      const toSenEn = (val, unit) => {
        const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        if (isNaN(n)) return null;
        if (unit === '円') return Math.floor(n / 1000);
        if (unit === '百万円') return Math.floor(n * 1000);
        if (unit === '億円') return Math.floor(n * 100000);
        return Math.floor(n); // 千円（デフォルト）
      };

      // ── 汎用数値パース（カンマ・全角数字対応）────────────────────
      const parseNum = (val) => {
        if (!val && val !== 0) return null;
        const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        return isNaN(n) ? null : n;
      };

      // ── ヘッダー名 → DBカラム名マッピング ────────────────────────
      const getField = (h) => {
        const base = h.replace(/\(.*?\)/g, '').trim(); // 単位括弧を除去した基本名
        // No
        if (/^(No\.|NO|no|No|番号)$/.test(h)) return 'no';
        // 企業名
        if (base === '企業名' || base === '会社名' || base === '社名') return 'company';
        // 事業内容
        if (base === '事業内容' || base === '事業概要' || base === '業種' || base === '業態') return 'business';
        // 代表者
        if (base === '代表者名' || base === '代表者' || base === '代表') return 'representative';
        // 電話番号
        if (base === '電話番号' || base === '電話' || base.toUpperCase() === 'TEL') return 'phone';
        // 住所（単体）
        if (base === '住所' || base === '所在地') return 'address';
        // 住所分割列
        if (base === '都道府県' || base.toLowerCase() === 'prefecture') return 'pref';
        if (base === '市区町村' || base === '市町村' || base === '区市町村') return 'city';
        if (base === '番地' || base === '番地以降' || base === '番地・号' || base === '丁目番地') return 'ward';
        // 売上高
        if (base === '売上高' || base === '売上') return 'revenue';
        // 当期純利益
        if (base === '当期純利益' || base === '純利益') return 'net_income';
        // 備考・メモ
        if (base === '備考' || base === 'メモ' || base === '注記') return 'memo_text';
        // 従業員数
        if (base === '従業員数' || base === '社員数' || base === '従業員') return 'employees';
        // URL・HP
        if (base === 'URL' || base === 'url' || base === 'HP' || base.includes('ホームページ')) return 'url';
        // 代表者年齢
        if (base === '代表者年齢' || base === '年齢') return 'age';
        return null; // 未知 → memoにJSON追記
      };

      // フィールドインデックスマップを構築
      const fieldIndices = {}; // field -> { idx, unit? }
      const unknownCols = []; // { idx, header } — memoに追記する未知列
      rawHeaders.forEach((h, idx) => {
        const field = getField(h);
        if (field) {
          if (!fieldIndices[field]) { // 最初にマッチした列を使用
            const unit = (field === 'revenue' || field === 'net_income') ? detectUnit(h) : null;
            fieldIndices[field] = { idx, unit };
          }
        } else {
          unknownCols.push({ idx, header: h });
        }
      });

      const revenueUnit = fieldIndices.revenue?.unit || '千円';
      const netIncomeUnit = fieldIndices.net_income?.unit || '千円';

      // ── 行データのパース ──────────────────────────────────────
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 2 || cols.every(c => !c)) continue;

        const get = (field) => {
          const fi = fieldIndices[field];
          return fi ? ((cols[fi.idx] || '').trim()) : '';
        };

        // ── 住所結合ロジック ──────────────────────────────────
        const addrRaw = get('address');
        const prefVal = get('pref');
        const cityVal = get('city');
        const wardVal = get('ward');
        let address = '';
        if (addrRaw) {
          // address列がある: prefが重複しないよう先頭に結合
          address = (prefVal && !addrRaw.startsWith(prefVal))
            ? prefVal + addrRaw
            : addrRaw;
        } else {
          // address列がない: pref + city + ward を連結
          address = prefVal + cityVal + wardVal;
        }
        address = address.replace(/\/\s*$/, ''); // 末尾の/を削除

        // ── memo JSON構築（備考・年齢・未知列）────────────────
        const extraInfo = {};
        const memoText = get('memo_text');
        if (memoText) extraInfo.biko = memoText;
        const ageVal = get('age');
        if (ageVal) extraInfo.age = ageVal;
        unknownCols.forEach(({ idx, header }) => {
          const v = (cols[idx] || '').trim();
          if (v) extraInfo[header] = v;
        });

        // フォーミュラインジェクション対策: =,+,-,@,タブ,改行で始まる文字列の先頭にシングルクォートを付加
        const sanitizeCSV = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
        // 電話番号正規化: 数字のみ抽出 → 先頭0補完
        const normalizePhone = (v) => { const d = v.replace(/[^\d]/g, ''); return d ? (d.startsWith('0') ? d : '0' + d) : ''; };

        rows.push({
          no: rows.length + 1,
          company: sanitizeCSV(get('company') || ''),
          business: sanitizeCSV(get('business') || ''),
          address: sanitizeCSV(address),
          pref: prefVal,
          representative: sanitizeCSV(get('representative') || ''),
          phone: normalizePhone(get('phone') || ''),
          revenue: (() => { const v = get('revenue'); return v ? toSenEn(v, revenueUnit) : null; })(),
          net_income: (() => { const v = get('net_income'); return v ? toSenEn(v, netIncomeUnit) : null; })(),
          employees: (() => { const v = get('employees'); return v ? parseNum(v) : null; })(),
          url: get('url') || null,
          memo: Object.keys(extraInfo).length > 0 ? JSON.stringify(extraInfo) : null,
          called: false,
          result: '',
        });
      }

      if (list._supaId) {
        const { error } = await insertCallListItems(list._supaId, rows);
        if (error) { alert('CSV取込に失敗しました: ' + (error.message || '不明なエラー')); return; }
      }
      setImportedCSVs(prev => ({ ...prev, [listId]: rows }));
      setExpanded(true);
      setPageStart(0);
      setCallingScreen({ listId, list });
    };
    reader.readAsText(file, "UTF-8");
  };

  const markCalled = (idx, result) => {
    setImportedCSVs(prev => {
      const updated = [...(prev[listId] || [])];
      updated[idx] = { ...updated[idx], called: true, result };
      return { ...prev, [listId]: updated };
    });
  };

  const prefOptions = [...new Set(csvData.map(r => r.pref || (r.address ? r.address.slice(0, 4).replace(/[市区町村郡].*/, '') : '')).filter(Boolean))].sort();

  const filtered = csvData.filter(r => {
    if (searchTerm && !(
      r.company.includes(searchTerm) ||
      r.representative.includes(searchTerm) ||
      r.phone.includes(searchTerm) ||
      String(r.no).includes(searchTerm)
    )) return false;
    if (prefFilter) {
      const rowPref = r.pref || (r.address ? r.address.slice(0, 4).replace(/[市区町村郡].*/, '') : '');
      if (rowPref !== prefFilter) return false;
    }
    return true;
  });

  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const calledCount = csvData.filter(r => r.called).length;

  return (
    <div style={{ marginBottom: 16 }}>
      <div onClick={() => csvData.length > 0 && setExpanded(!expanded)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: csvData.length > 0 ? "pointer" : "default",
        padding: "10px 14px", borderRadius: expanded ? "8px 8px 0 0" : 8,
        background: csvData.length > 0 ? (expanded ? "#f0f7f0" : C.offWhite) : C.offWhite,
        border: "1px solid " + (csvData.length > 0 ? C.green + "30" : C.borderLight),
        borderBottom: expanded ? "none" : undefined,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
<span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>架電リスト</span>
          {csvData.length > 0 && (
            <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>
              {csvData.length}件（架電済: {calledCount}）
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {setCallFlowScreen && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
              <span style={{ fontSize: 10, color: C.textMid, whiteSpace: "nowrap" }}>No.</span>
              <input type="number" value={flowStartNo} onChange={e => setFlowStartNo(e.target.value)} placeholder="開始"
                style={{ width: 52, padding: "3px 5px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 10, fontFamily: "'JetBrains Mono'", textAlign: "center", outline: "none" }} />
              <span style={{ fontSize: 10, color: C.textMid }}>〜</span>
              <input type="number" value={flowEndNo} onChange={e => setFlowEndNo(e.target.value)} placeholder="終了"
                style={{ width: 52, padding: "3px 5px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 10, fontFamily: "'JetBrains Mono'", textAlign: "center", outline: "none" }} />
              <button
                disabled={!flowStartNo || !flowEndNo}
                onClick={() => setCallFlowScreen({ list, startNo: flowStartNo ? parseInt(flowStartNo) : null, endNo: flowEndNo ? parseInt(flowEndNo) : null })}
                style={{
                  padding: "4px 12px", borderRadius: 6,
                  background: flowStartNo && flowEndNo ? C.navy : C.border,
                  color: C.white, cursor: flowStartNo && flowEndNo ? "pointer" : "not-allowed",
                  fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
                  border: "none",
                }}>架電開始</button>
            </div>
          )}
          {csvData.length > 0 && (
            <button onClick={() => setCallingScreen({ listId, list })} style={{
              padding: "4px 12px", borderRadius: 6,
              background: C.navy + 'cc', color: C.white, cursor: "pointer",
              fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
              border: "none",
            }}>CSV架電</button>
          )}
          <label style={{
            padding: "4px 12px", borderRadius: 6,
            background: C.offWhite, color: C.navy, cursor: "pointer",
            fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            border: "1px solid " + C.border,
          }}>
            CSV取込
            <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
          </label>
          {csvData.length > 0 && (
            <span style={{ fontSize: 11, color: C.textLight, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
          )}
        </div>
      </div>

      {expanded && csvData.length > 0 && (
        <div style={{
          background: C.white, border: "1px solid " + C.green + "30",
          borderTop: "none", borderRadius: "0 0 8px 8px",
          padding: "10px 14px", animation: "fadeIn 0.2s ease",
        }}>
          {/* Search + pagination */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input type="text" placeholder="番号・企業名・代表者で検索..." value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPageStart(0); }}
              style={{ flex: 1, padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }} />
            {prefOptions.length > 0 && (
              <select value={prefFilter} onChange={e => { setPrefFilter(e.target.value); setPageStart(0); }} style={{
                padding: "5px 6px", borderRadius: 4, border: "1px solid " + C.border,
                fontSize: 10, fontFamily: "'Noto Sans JP'", outline: "none", color: C.textDark,
              }}>
                <option value="">都道府県</option>
                {prefOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <span style={{ fontSize: 10, color: C.textLight, whiteSpace: "nowrap" }}>
              {pageStart + 1}〜{Math.min(pageStart + PAGE_SIZE, filtered.length)} / {filtered.length}件
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "40px 1.5fr 1fr 0.8fr 100px 60px",
              padding: "6px 8px", background: C.navyDeep, borderRadius: "4px 4px 0 0",
              fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
            }}>
              <span>No</span><span>企業名</span><span>事業内容</span><span>代表者</span><span>電話番号</span><span>状態</span>
            </div>
            {paged.map((row, i) => {
              const globalIdx = csvData.findIndex(r => r.no === row.no);
              return (
                <div key={row.no} style={{
                  display: "grid", gridTemplateColumns: "40px 1.5fr 1fr 0.8fr 100px 60px",
                  padding: "6px 8px", fontSize: 11, alignItems: "center",
                  borderBottom: "1px solid " + C.borderLight,
                  background: row.called ? (row.result === "アポ" ? C.green + "08" : C.offWhite) : C.white,
                  opacity: row.called ? 0.6 : 1,
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{row.no}</span>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.company}</span>
                  <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{row.business}</span>
                  <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.representative}</span>
                  <span>
                    {row.phone ? (
                      <span onClick={() => dialPhone(row.phone)} style={{
                        color: C.navy, fontWeight: 600, fontSize: 11,
                        fontFamily: "'JetBrains Mono'", cursor: "pointer",
                        padding: "2px 6px", borderRadius: 4,
                        background: C.gold + "15",
                        border: "1px solid " + C.gold + "30",
                      }}>{row.phone}</span>
                    ) : "-"}
                  </span>
                  <span>
                    {row.called ? (
                      <span style={{
                        fontSize: 9, padding: "2px 6px", borderRadius: 3,
                        background: row.result === "アポ" ? C.green + "20" : C.border,
                        color: row.result === "アポ" ? C.green : C.textLight,
                        fontWeight: 600,
                      }}>{row.result || "済"}</span>
                    ) : (
                      <div style={{ display: "flex", gap: 2 }}>
                        <button onClick={() => markCalled(globalIdx, "不通")} title="不通" style={{
                          width: 20, height: 20, borderRadius: 3, border: "1px solid " + C.border,
                          background: C.offWhite, cursor: "pointer", fontSize: 8, color: C.textLight,
                        }}>✕</button>
                        <button onClick={() => markCalled(globalIdx, "通電")} title="通電" style={{
                          width: 20, height: 20, borderRadius: 3, border: "1px solid " + C.navy + "30",
                          background: C.navy + "10", cursor: "pointer", fontSize: 8, color: C.navy,
                        }}>○</button>
                        <button onClick={() => markCalled(globalIdx, "アポ")} title="アポ" style={{
                          width: 20, height: 20, borderRadius: 3, border: "1px solid " + C.green + "30",
                          background: C.green + "10", cursor: "pointer", fontSize: 8, color: C.green,
                        }}>◎</button>
                      </div>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
              <button disabled={pageStart === 0} onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))} style={{
                padding: "4px 12px", borderRadius: 4, border: "1px solid " + C.border,
                background: pageStart === 0 ? C.offWhite : C.white, cursor: pageStart === 0 ? "default" : "pointer",
                fontSize: 11, color: C.textMid, fontFamily: "'Noto Sans JP'",
              }}>← 前</button>
              <button disabled={pageStart + PAGE_SIZE >= filtered.length} onClick={() => setPageStart(pageStart + PAGE_SIZE)} style={{
                padding: "4px 12px", borderRadius: 4, border: "1px solid " + C.border,
                background: pageStart + PAGE_SIZE >= filtered.length ? C.offWhite : C.white,
                cursor: pageStart + PAGE_SIZE >= filtered.length ? "default" : "pointer",
                fontSize: 11, color: C.textMid, fontFamily: "'Noto Sans JP'",
              }}>次 →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
