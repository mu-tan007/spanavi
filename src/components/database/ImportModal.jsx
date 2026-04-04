import { useState, useCallback } from 'react';
import { C } from '../../constants/colors';
import { X, Upload, ArrowRight, Check, AlertTriangle } from 'lucide-react';
import { checkDuplicates, executeImport } from '../../lib/companyMasterImport';

// カラムマッピング候補
const DB_COLUMNS = [
  { key: '', label: '（マッピングしない）' },
  { key: 'company_name', label: '企業名' },
  { key: 'business_description', label: '事業内容' },
  { key: 'postal_code', label: '郵便番号' },
  { key: 'prefecture', label: '都道府県' },
  { key: 'city', label: '市区郡' },
  { key: 'address', label: '住所' },
  { key: 'phone', label: '電話番号' },
  { key: 'representative', label: '代表者' },
  { key: 'representative_age', label: '代表者年齢' },
  { key: 'revenue_k', label: '売上高（千円）' },
  { key: 'net_income_k', label: '当期純利益（千円）' },
  { key: 'ordinary_income_k', label: '経常利益（千円）' },
  { key: 'capital_k', label: '資本金（千円）' },
  { key: 'employee_count', label: '従業員数' },
  { key: 'established_year', label: '設立年' },
  { key: 'industry_major', label: '業種（大分類）' },
  { key: 'industry_sub', label: '業種（細分類）' },
  { key: 'remarks', label: '備考' },
  { key: 'shareholders', label: '株主' },
  { key: 'officers', label: '役員' },
  { key: 'tsr_id', label: 'TSRID' },
];

// 自動マッピングルール
const AUTO_MAP = {
  '企業名': 'company_name', '会社名': 'company_name', '法人名': 'company_name', '社名': 'company_name',
  '事業内容': 'business_description', '業務内容': 'business_description',
  '郵便番号': 'postal_code', '〒': 'postal_code',
  '都道府県': 'prefecture', '県': 'prefecture',
  '市区郡': 'city', '市区町村': 'city', '市町村': 'city',
  '住所': 'address', '所在地': 'address',
  '電話番号': 'phone', '電話': 'phone', 'TEL': 'phone', 'tel': 'phone',
  '代表者': 'representative', '代表者名': 'representative', '代表': 'representative',
  '年齢': 'representative_age', '代表者年齢': 'representative_age',
  '売上高': 'revenue_k', '売上': 'revenue_k', '売上高(千円)': 'revenue_k', '売上高（千円）': 'revenue_k',
  '当期純利益': 'net_income_k', '純利益': 'net_income_k', '当期純利益(千円)': 'net_income_k',
  '経常利益': 'ordinary_income_k',
  '資本金': 'capital_k', '資本金(単位:千円)': 'capital_k',
  '従業員数': 'employee_count', '従業員': 'employee_count', '社員数': 'employee_count',
  '設立年': 'established_year', '設立': 'established_year',
  '業種': 'industry_sub', '業種1': 'industry_sub', '中業種': 'industry_sub',
  '備考': 'remarks', 'TSRID': 'tsr_id',
  '株主': 'shareholders', '役員': 'officers',
};

function autoMap(header) {
  if (AUTO_MAP[header]) return AUTO_MAP[header];
  for (const [pattern, col] of Object.entries(AUTO_MAP)) {
    if (header.includes(pattern)) return col;
  }
  return '';
}

export default function ImportModal({ onClose, onImportComplete }) {
  const [step, setStep] = useState(1); // 1=upload, 2=mapping, 3=dedup, 4=importing, 5=done
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [dedupResult, setDedupResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  // Step 1: File upload
  const handleFile = useCallback(async (file) => {
    setFileName(file.name);
    setError(null);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let hdrs = [], rows = [];

      if (ext === 'csv' || ext === 'tsv') {
        const text = await file.text();
        const sep = ext === 'tsv' ? '\t' : ',';
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        hdrs = parseCSVLine(lines[0], sep);
        rows = lines.slice(1).map(l => parseCSVLine(l, sep));
      } else {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        ws.eachRow((row, i) => {
          const vals = row.values.slice(1).map(v => v == null ? '' : String(v));
          if (i === 1) hdrs = vals;
          else rows.push(vals);
        });
      }

      setHeaders(hdrs);
      setRawRows(rows);
      // Auto-map
      const map = {};
      hdrs.forEach((h, i) => { map[i] = autoMap(h.trim()); });
      setColumnMap(map);
      setStep(2);
    } catch (e) {
      setError('ファイルの読み込みに失敗: ' + e.message);
    }
  }, []);

  // Step 2 -> Step 3: Run dedup check
  const handleCheckDuplicates = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const mappedRows = rawRows.map(row => {
        const obj = {};
        Object.entries(columnMap).forEach(([idx, dbCol]) => {
          if (dbCol && row[idx] !== undefined) {
            obj[dbCol] = row[idx]?.trim() || '';
          }
        });
        return obj;
      }).filter(r => r.company_name);

      if (mappedRows.length === 0) {
        setError('企業名がマッピングされた行がありません');
        setChecking(false);
        return;
      }

      const result = await checkDuplicates(mappedRows);
      setDedupResult(result);
      setStep(3);
    } catch (e) {
      setError('重複チェックに失敗: ' + e.message);
    } finally {
      setChecking(false);
    }
  }, [rawRows, columnMap]);

  // Step 3 -> Step 4: Execute import
  const handleExecute = useCallback(async () => {
    setStep(4);
    setError(null);
    try {
      const result = await executeImport(
        dedupResult.newRows, dedupResult.updateRows, fileName,
        (p) => setProgress(p)
      );
      setFinalResult(result);
      setStep(5);
      onImportComplete?.();
    } catch (e) {
      setError('インポート失敗: ' + e.message);
      setStep(3);
    }
  }, [dedupResult, fileName, onImportComplete]);

  const handleDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div style={{ background: C.white, borderRadius: 12, width: Math.min(900, window.innerWidth - 40), maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>
            リストインポート
            <span style={{ fontSize: 12, color: C.textLight, marginLeft: 8 }}>
              {step === 1 && 'ファイル選択'}
              {step === 2 && 'カラムマッピング'}
              {step === 3 && '重複チェック結果'}
              {step === 4 && 'インポート中...'}
              {step === 5 && '完了'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color={C.textMid} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {error && (
            <div style={{ padding: 10, background: '#FEE', borderRadius: 6, color: '#C00', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 1 && (
            <div
              onDrop={handleDrop} onDragOver={e => e.preventDefault()}
              style={{
                border: `2px dashed ${C.border}`, borderRadius: 12, padding: '60px 20px',
                textAlign: 'center', cursor: 'pointer',
              }}
              onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.tsv,.xlsx,.xls'; inp.onchange = e => { if (e.target.files[0]) handleFile(e.target.files[0]); }; inp.click(); }}
            >
              <Upload size={40} color={C.textLight} style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, color: C.textDark, marginBottom: 6 }}>ファイルをドラッグ＆ドロップ</div>
              <div style={{ fontSize: 12, color: C.textLight }}>またはクリックして選択（CSV / Excel）</div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 13, color: C.textMid, marginBottom: 12 }}>
                <strong>{fileName}</strong> — {rawRows.length.toLocaleString()}行 / {headers.length}列
              </div>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thS}>元の列名</th>
                      <th style={thS}>サンプル</th>
                      <th style={thS}>マッピング先</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, i) => (
                      <tr key={i}>
                        <td style={tdS}>{h}</td>
                        <td style={{ ...tdS, fontSize: 11, color: C.textMid, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rawRows[0]?.[i] || ''}
                        </td>
                        <td style={tdS}>
                          <select
                            value={columnMap[i] || ''}
                            onChange={e => setColumnMap(prev => ({ ...prev, [i]: e.target.value }))}
                            style={{ padding: '4px 6px', fontSize: 12, borderRadius: 4, border: `1px solid ${C.border}`, width: '100%' }}
                          >
                            {DB_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Dedup Preview */}
          {step === 3 && dedupResult && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <StatCard label="新規追加" count={dedupResult.newRows.length} color="#0B6E4F" />
                <StatCard label="上書き更新（インポート側の情報が多い）" count={dedupResult.updateRows.length} color="#D97706" />
                <StatCard label="スキップ（既存の情報が多い）" count={dedupResult.skipRows.length} color={C.textLight} />
              </div>
              {dedupResult.updateRows.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', marginBottom: 6 }}>上書き対象（先頭10件）</div>
                  <div style={{ maxHeight: 150, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
                    {dedupResult.updateRows.slice(0, 10).map((r, i) => (
                      <div key={i} style={{ padding: '6px 10px', fontSize: 12, borderBottom: `1px solid ${C.borderLight}` }}>
                        <strong>{r.company_name}</strong> → 既存: {r.existingName}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {dedupResult.skipRows.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid, marginBottom: 6 }}>スキップ対象（先頭10件）</div>
                  <div style={{ maxHeight: 150, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
                    {dedupResult.skipRows.slice(0, 10).map((r, i) => (
                      <div key={i} style={{ padding: '6px 10px', fontSize: 12, borderBottom: `1px solid ${C.borderLight}` }}>
                        {r.company_name}（既存: {r.existingName}）
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 16, color: C.navy, marginBottom: 12 }}>インポート中...</div>
              {progress && (
                <div>
                  <div style={{ width: '100%', height: 8, background: C.offWhite, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ width: `${(progress.completedBatches / progress.totalBatches) * 100}%`, height: '100%', background: C.navyLight, borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: C.textMid }}>
                    {progress.totalInserted}件 追加 / {progress.totalUpdated}件 更新
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && finalResult && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Check size={48} color="#0B6E4F" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>インポート完了</div>
              <div style={{ fontSize: 14, color: C.textMid }}>
                新規追加: <strong>{finalResult.totalInserted.toLocaleString()}</strong>件 /
                上書き更新: <strong>{finalResult.totalUpdated.toLocaleString()}</strong>件
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: `1px solid ${C.border}` }}>
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} style={btnSecondary}>戻る</button>
              <button onClick={handleCheckDuplicates} disabled={checking} style={btnPrimary}>
                {checking ? '重複チェック中...' : '重複チェック →'}
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button onClick={() => setStep(2)} style={btnSecondary}>戻る</button>
              <button onClick={handleExecute} style={btnPrimary}>
                <Upload size={14} /> インポート実行
              </button>
            </>
          )}
          {step === 5 && (
            <button onClick={onClose} style={btnPrimary}>閉じる</button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, count, color }) {
  return (
    <div style={{ padding: 14, background: C.cream, borderRadius: 8, border: `1px solid ${C.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{count.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function parseCSVLine(line, sep = ',') {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

const thS = { padding: '8px 10px', textAlign: 'left', fontSize: 12, fontWeight: 700, background: C.offWhite, borderBottom: `1px solid ${C.border}` };
const tdS = { padding: '6px 10px', fontSize: 12, borderBottom: `1px solid ${C.borderLight}` };
const btnPrimary = { display: 'flex', alignItems: 'center', gap: 6, background: C.navyLight, color: C.white, border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnSecondary = { background: C.offWhite, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
