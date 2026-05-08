import { useState } from "react";
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { CALL_RESULTS } from '../../constants/callResults';
import { insertCallListItems } from '../../lib/supabaseWrite';
import { dialPhone } from '../../utils/phone';

export default function CSVPhoneList({ listId, list, importedCSVs, setImportedCSVs, setCallingScreen, setCallFlowScreen }) {
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [prefFilters, setPrefFilters] = useState([]);
  const [prefDropOpen, setPrefDropOpen] = useState(false);
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
    if (prefFilters.length > 0) {
      const rowPref = r.pref || (r.address ? r.address.slice(0, 4).replace(/[市区町村郡].*/, '') : '');
      if (!prefFilters.includes(rowPref)) return false;
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
        padding: "10px 14px", borderRadius: expanded ? `${radius.md}px ${radius.md}px 0 0` : radius.md,
        background: color.white,
        border: `1px solid ${color.border}`,
        borderBottom: expanded ? "none" : undefined,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
<span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>架電リスト</span>
          {csvData.length > 0 && (
            <span style={{ fontSize: font.size.xs - 1, color: C.green, fontWeight: font.weight.semibold }}>
              {csvData.length}件（架電済: {calledCount}）
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {setCallFlowScreen && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
              <span style={{ fontSize: font.size.xs - 1, color: color.textMid, whiteSpace: "nowrap" }}>No.</span>
              <input type="number" value={flowStartNo} onChange={e => setFlowStartNo(e.target.value)} placeholder="開始"
                style={{ width: 52, padding: "3px 5px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs - 1, fontFamily: font.family.mono, textAlign: "center", outline: "none" }} />
              <span style={{ fontSize: font.size.xs - 1, color: color.textMid }}>〜</span>
              <input type="number" value={flowEndNo} onChange={e => setFlowEndNo(e.target.value)} placeholder="終了"
                style={{ width: 52, padding: "3px 5px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs - 1, fontFamily: font.family.mono, textAlign: "center", outline: "none" }} />
              <Button
                size="sm"
                disabled={!flowStartNo || !flowEndNo}
                onClick={() => setCallFlowScreen({ list, startNo: flowStartNo ? parseInt(flowStartNo) : null, endNo: flowEndNo ? parseInt(flowEndNo) : null })}
              >架電開始</Button>
            </div>
          )}
          {csvData.length > 0 && (
            <Button size="sm" onClick={() => setCallingScreen({ listId, list })}>CSV架電</Button>
          )}
          <label style={{
            padding: "6px 12px", borderRadius: radius.md,
            background: color.white, color: color.navy, cursor: "pointer",
            fontSize: font.size.sm, fontWeight: font.weight.medium, fontFamily: font.family.sans,
            border: `1px solid ${color.navy}`,
          }}>
            CSV取込
            <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: "none" }} />
          </label>
          {csvData.length > 0 && (
            <span style={{ fontSize: font.size.xs, color: color.textLight, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
          )}
        </div>
      </div>

      {expanded && csvData.length > 0 && (
        <div style={{
          background: color.white, border: `1px solid ${color.border}`,
          borderTop: "none", borderRadius: `0 0 ${radius.md}px ${radius.md}px`,
          padding: "10px 14px", animation: "fadeIn 0.2s ease",
        }}>
          {/* Search + pagination */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input type="text" placeholder="番号・企業名・代表者で検索..." value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPageStart(0); }}
              style={{ flex: 1, padding: "6px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: font.family.sans, outline: "none" }} />
            {prefOptions.length > 0 && (
              <div style={{ position: "relative" }}>
                {prefDropOpen && (
                  <div onClick={() => setPrefDropOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} />
                )}
                <button onClick={() => setPrefDropOpen(v => !v)} style={{
                  padding: "5px 8px", borderRadius: radius.md,
                  border: `1px solid ${prefFilters.length > 0 ? color.navy : color.border}`,
                  background: prefFilters.length > 0 ? alpha(color.navy, 0.06) : color.white,
                  fontSize: font.size.xs - 1, fontFamily: font.family.sans, cursor: "pointer",
                  color: prefFilters.length > 0 ? color.navy : color.textDark, whiteSpace: "nowrap",
                }}>
                  {prefFilters.length > 0 ? `都道府県(${prefFilters.length})▼` : "都道府県▼"}
                </button>
                {prefDropOpen && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 101,
                    background: color.white, border: `1px solid ${color.border}`,
                    borderRadius: radius.md, boxShadow: shadow.md,
                    minWidth: 120, maxHeight: 220, overflowY: "auto", padding: "4px 0",
                  }}>
                    {prefFilters.length > 0 && (
                      <div onClick={() => { setPrefFilters([]); setPageStart(0); }} style={{
                        padding: "4px 10px", fontSize: 9, color: color.navy, cursor: "pointer",
                        borderBottom: `1px solid ${color.borderLight}`, fontWeight: font.weight.semibold,
                      }}>クリア</div>
                    )}
                    {prefOptions.map(p => (
                      <label key={p} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", cursor: "pointer", fontSize: font.size.xs - 1,
                        fontFamily: font.family.sans, color: color.textDark,
                      }}>
                        <input type="checkbox" checked={prefFilters.includes(p)}
                          onChange={() => {
                            setPrefFilters(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
                            setPageStart(0);
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span style={{ fontSize: font.size.xs - 1, color: color.textLight, whiteSpace: "nowrap" }}>
              {pageStart + 1}〜{Math.min(pageStart + PAGE_SIZE, filtered.length)} / {filtered.length}件
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "40px 1.5fr 1fr 0.7fr 0.8fr 100px 60px",
              padding: "6px 8px", background: color.navy, borderRadius: `${radius.md}px ${radius.md}px 0 0`,
              fontSize: 9, fontWeight: font.weight.semibold, color: color.white, letterSpacing: 0.5,
            }}>
              <span>No</span><span>企業名</span><span>事業内容</span><span>住所</span><span>代表者</span><span>電話番号</span><span>状態</span>
            </div>
            {paged.map((row, i) => {
              const globalIdx = csvData.findIndex(r => r.no === row.no);
              return (
                <div key={row.no} style={{
                  display: "grid", gridTemplateColumns: "40px 1.5fr 1fr 0.7fr 0.8fr 100px 60px",
                  padding: "6px 8px", fontSize: font.size.xs, alignItems: "center",
                  borderBottom: `1px solid ${color.border}`,
                  background: row.called ? (row.result === "アポ" ? alpha(C.green, 0.03) : '#F8F9FA') : (i % 2 === 0 ? color.white : '#F8F9FA'),
                  opacity: row.called ? 0.6 : 1,
                }}>
                  <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs - 1, color: color.textLight }}>{row.no}</span>
                  <span style={{ fontWeight: font.weight.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.company}</span>
                  <span style={{ color: color.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: font.size.xs - 1 }}>{row.business}</span>
                  <span style={{ color: color.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9 }}>{row.address || row.pref || '—'}</span>
                  <span style={{ color: color.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.representative}</span>
                  <span>
                    {row.phone ? (
                      <span onClick={() => dialPhone(row.phone)} style={{
                        color: color.navy, fontWeight: font.weight.semibold, fontSize: font.size.xs,
                        fontFamily: font.family.mono, cursor: "pointer",
                        padding: "2px 6px", borderRadius: radius.md,
                        background: alpha(color.navy, 0.08),
                        border: `1px solid ${alpha(color.navy, 0.18)}`,
                      }}>{row.phone}</span>
                    ) : "-"}
                  </span>
                  <span>
                    {row.called ? (
                      <span style={{
                        fontSize: 9, padding: "2px 6px", borderRadius: radius.sm,
                        background: row.result === "アポ" ? alpha(C.green, 0.12) : color.border,
                        color: row.result === "アポ" ? C.green : color.textLight,
                        fontWeight: font.weight.semibold,
                      }}>{row.result || "済"}</span>
                    ) : (
                      <div style={{ display: "flex", gap: 2 }}>
                        <button onClick={() => markCalled(globalIdx, "不通")} title="不通" style={{
                          width: 20, height: 20, borderRadius: radius.sm, border: `1px solid ${color.border}`,
                          background: color.offWhite, cursor: "pointer", fontSize: 8, color: color.textLight,
                        }}>✕</button>
                        <button onClick={() => markCalled(globalIdx, "通電")} title="通電" style={{
                          width: 20, height: 20, borderRadius: radius.sm, border: `1px solid ${alpha(color.navy, 0.18)}`,
                          background: alpha(color.navy, 0.06), cursor: "pointer", fontSize: 8, color: color.navy,
                        }}>○</button>
                        <button onClick={() => markCalled(globalIdx, "アポ")} title="アポ" style={{
                          width: 20, height: 20, borderRadius: radius.sm, border: `1px solid ${alpha(C.green, 0.18)}`,
                          background: alpha(C.green, 0.06), cursor: "pointer", fontSize: 8, color: C.green,
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
              <Button size="sm" variant="outline" disabled={pageStart === 0} onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))}>← 前</Button>
              <Button size="sm" variant="outline" disabled={pageStart + PAGE_SIZE >= filtered.length} onClick={() => setPageStart(pageStart + PAGE_SIZE)}>次 →</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
