import { useState, useCallback } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
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
      <div style={{ background: color.white, borderRadius: radius.xl, width: Math.min(900, window.innerWidth - 40), maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: shadow.xl }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${space[4]}px ${space[5]}px`, borderBottom: `1px solid ${color.border}` }}>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
            リストインポート
            <span style={{ fontSize: font.size.sm, color: color.textLight, marginLeft: space[2] }}>
              {step === 1 && 'ファイル選択'}
              {step === 2 && 'カラムマッピング'}
              {step === 3 && '重複チェック結果'}
              {step === 4 && 'インポート中...'}
              {step === 5 && '完了'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color={color.textMid} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: space[5] }}>
          {error && (
            <div style={{ padding: space[2.5], background: color.dangerSoft, borderRadius: radius.lg, color: color.danger, fontSize: font.size.base, marginBottom: space[3] }}>
              {error}
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 1 && (
            <div
              onDrop={handleDrop} onDragOver={e => e.preventDefault()}
              style={{
                border: `2px dashed ${color.border}`, borderRadius: radius.xl, padding: '60px 20px',
                textAlign: 'center', cursor: 'pointer',
              }}
              onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.tsv,.xlsx,.xls'; inp.onchange = e => { if (e.target.files[0]) handleFile(e.target.files[0]); }; inp.click(); }}
            >
              <Upload size={40} color={color.textLight} style={{ marginBottom: space[3] }} />
              <div style={{ fontSize: font.size.md, color: color.textDark, marginBottom: space[1.5] }}>ファイルをドラッグ＆ドロップ</div>
              <div style={{ fontSize: font.size.sm, color: color.textLight }}>またはクリックして選択（CSV / Excel）</div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: font.size.base, color: color.textMid, marginBottom: space[3] }}>
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
                        <td style={{ ...tdS, fontSize: font.size.xs, color: color.textMid, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rawRows[0]?.[i] || ''}
                        </td>
                        <td style={tdS}>
                          <Select
                            size="sm"
                            value={columnMap[i] || ''}
                            onChange={e => setColumnMap(prev => ({ ...prev, [i]: e.target.value }))}
                            options={DB_COLUMNS.map(c => ({ value: c.key, label: c.label }))}
                          />
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space[3], marginBottom: space[4] }}>
                <StatCard label="新規追加" count={dedupResult.newRows.length} statColor={color.success} />
                <StatCard label="上書き更新（インポート側の情報が多い）" count={dedupResult.updateRows.length} statColor={color.warn} />
                <StatCard label="スキップ（既存の情報が多い）" count={dedupResult.skipRows.length} statColor={color.textLight} />
              </div>
              {dedupResult.updateRows.length > 0 && (
                <div style={{ marginBottom: space[3] }}>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.warn, marginBottom: space[1.5] }}>上書き対象（先頭10件）</div>
                  <div style={{ maxHeight: 150, overflow: 'auto', border: `1px solid ${color.border}`, borderRadius: radius.lg }}>
                    {dedupResult.updateRows.slice(0, 10).map((r, i) => (
                      <div key={i} style={{ padding: `${space[1.5]}px ${space[2.5]}px`, fontSize: font.size.sm, borderBottom: `1px solid ${color.borderLight}` }}>
                        <strong>{r.company_name}</strong> → 既存: {r.existingName}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {dedupResult.skipRows.length > 0 && (
                <div>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.textMid, marginBottom: space[1.5] }}>スキップ対象（先頭10件）</div>
                  <div style={{ maxHeight: 150, overflow: 'auto', border: `1px solid ${color.border}`, borderRadius: radius.lg }}>
                    {dedupResult.skipRows.slice(0, 10).map((r, i) => (
                      <div key={i} style={{ padding: `${space[1.5]}px ${space[2.5]}px`, fontSize: font.size.sm, borderBottom: `1px solid ${color.borderLight}` }}>
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
            <div style={{ textAlign: 'center', padding: space[10] }}>
              <div style={{ fontSize: font.size.lg, color: color.navy, marginBottom: space[3] }}>インポート中...</div>
              {progress && (
                <div>
                  <div style={{ width: '100%', height: 8, background: color.offWhite, borderRadius: radius.md, overflow: 'hidden', marginBottom: space[2] }}>
                    <div style={{ width: `${(progress.completedBatches / progress.totalBatches) * 100}%`, height: '100%', background: color.navyLight, borderRadius: radius.md, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: font.size.sm, color: color.textMid }}>
                    {progress.totalInserted}件 追加 / {progress.totalUpdated}件 更新
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && finalResult && (
            <div style={{ textAlign: 'center', padding: space[10] }}>
              <Check size={48} color={color.success} style={{ marginBottom: space[3] }} />
              <div style={{ fontSize: font.size.xl - 2, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>インポート完了</div>
              <div style={{ fontSize: font.size.md, color: color.textMid }}>
                新規追加: <strong>{finalResult.totalInserted.toLocaleString()}</strong>件 /
                上書き更新: <strong>{finalResult.totalUpdated.toLocaleString()}</strong>件
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], padding: `${space[3]}px ${space[5]}px`, borderTop: `1px solid ${color.border}` }}>
          {step === 2 && (
            <>
              <Button variant="secondary" onClick={() => setStep(1)}>戻る</Button>
              <Button onClick={handleCheckDuplicates} loading={checking} iconRight={<ArrowRight size={14} />}>
                {checking ? '重複チェック中...' : '重複チェック'}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="secondary" onClick={() => setStep(2)}>戻る</Button>
              <Button onClick={handleExecute} iconLeft={<Upload size={14} />}>インポート実行</Button>
            </>
          )}
          {step === 5 && (
            <Button onClick={onClose}>閉じる</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, count, statColor }) {
  return (
    <Card padding="sm" variant="subtle" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.black, color: statColor }}>{count.toLocaleString()}</div>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>{label}</div>
    </Card>
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

const thS = { padding: `${space[2]}px ${space[2.5]}px`, textAlign: 'left', fontSize: font.size.sm, fontWeight: font.weight.bold, background: color.offWhite, borderBottom: `1px solid ${color.border}` };
const tdS = { padding: `${space[1.5]}px ${space[2.5]}px`, fontSize: font.size.sm, borderBottom: `1px solid ${color.borderLight}` };
