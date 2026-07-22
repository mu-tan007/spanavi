import { useState } from "react";
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { CALL_RESULTS } from '../../constants/callResults';
import { insertCallListItems, autoExcludeKnownExcluded } from '../../lib/supabaseWrite';
import { dialPhone } from '../../utils/phone';
import CSVColumnMappingModal from './CSVColumnMappingModal';
import { normalizeHeader, parseCSVLine, buildDefaultMapping, buildRowsFromMapping } from './csvImportUtils';

export default function CSVPhoneList({ listId, list, importedCSVs, setImportedCSVs, setCallingScreen, setCallFlowScreen }) {
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [prefFilters, setPrefFilters] = useState([]);
  const [prefDropOpen, setPrefDropOpen] = useState(false);
  const [pageStart, setPageStart] = useState(0);
  const [flowStartNo, setFlowStartNo] = useState('');
  const [flowEndNo, setFlowEndNo] = useState('');
  const [pendingImport, setPendingImport] = useState(null); // カラム紐付け待ちのCSV
  const [importing, setImporting] = useState(false);
  const PAGE_SIZE = 20;
  const csvData = importedCSVs[listId] || [];

  // CSV選択 → パースしてカラム紐付けモーダルを開く（リネーム不要でそのまま取込）
  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { alert('CSVにデータ行が見つかりません'); return; }
      const headersOriginal = parseCSVLine(lines[0]);
      const headers = headersOriginal.map(normalizeHeader);
      const dataRows = lines.slice(1).map(parseCSVLine);
      const { mapping, units } = buildDefaultMapping(headers);
      setPendingImport({ fileName: file.name, headers, headersOriginal, dataRows, mapping, units });
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = ''; // 同じファイルを選び直せるようにリセット
  };

  // 紐付け確定 → 行組み立て → DB取込 → 他リスト除外済みの自動除外
  const doImport = async (mapping, units) => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const rows = buildRowsFromMapping(pendingImport.dataRows, pendingImport.headers, mapping, units);
      if (rows.length === 0) {
        alert('取り込める企業行がありません（「企業名」の列が正しく紐付いているか確認してください）');
        return;
      }
      if (list._supaId) {
        const { error } = await insertCallListItems(list._supaId, rows);
        if (error) { alert('CSV取込に失敗しました: ' + (error.message || '不明なエラー')); return; }
        const { count } = await autoExcludeKnownExcluded(list._supaId);
        alert(count > 0
          ? `${rows.length}件を取り込みました。\nうち${count}件は他リストで除外済みの企業のため、自動的に「除外」にしました。`
          : `${rows.length}件を取り込みました。`);
      }
      setImportedCSVs(prev => ({ ...prev, [listId]: rows }));
      setExpanded(true);
      setPageStart(0);
      setPendingImport(null);
      setCallingScreen({ listId, list });
    } finally {
      setImporting(false);
    }
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
    <>
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

    {pendingImport && (
      <CSVColumnMappingModal
        fileName={pendingImport.fileName}
        headers={pendingImport.headers}
        headersOriginal={pendingImport.headersOriginal}
        dataRows={pendingImport.dataRows}
        initialMapping={pendingImport.mapping}
        initialUnits={pendingImport.units}
        busy={importing}
        onCancel={() => { if (!importing) setPendingImport(null); }}
        onConfirm={doImport}
      />
    )}
    </>
  );
}
