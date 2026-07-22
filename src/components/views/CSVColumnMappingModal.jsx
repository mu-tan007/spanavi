import { useState, useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Select } from '../ui';
import { TARGET_FIELDS, UNIT_OPTIONS, buildRowsFromMapping } from './csvImportUtils';

/**
 * CSVカラム紐付けモーダル
 *
 * クライアントから受領したCSVのカラム名をリネームせずに取り込むための、
 * 「CSVのどの列を、スパナビのどの項目に当てるか」を選択するUI。
 *
 * @prop fileName        表示用ファイル名
 * @prop headers         正規化済みヘッダー配列（内部処理用・未マッピング列名にも使用）
 * @prop headersOriginal 元のヘッダー配列（表示用。normalize前の見た目）
 * @prop dataRows        CSVデータ行（parseCSVLineで分解済みの配列の配列）
 * @prop initialMapping  自動判定によるマッピング初期値 { field: colIndex }
 * @prop initialUnits    金額列の単位初期値 { revenue, net_income }
 * @prop onCancel        キャンセル
 * @prop onConfirm       確定 (mapping, units) => void
 */
export default function CSVColumnMappingModal({
  fileName, headers, headersOriginal, dataRows,
  initialMapping, initialUnits, onCancel, onConfirm, busy = false,
}) {
  const [mapping, setMapping] = useState(initialMapping || {});
  const [units, setUnits] = useState(initialUnits || { revenue: '千円', net_income: '千円' });

  const displayHeaders = headersOriginal && headersOriginal.length ? headersOriginal : headers;

  // 列選択肢: なし + 各CSV列（元の見た目で表示）
  const colOptions = useMemo(() => ([
    { value: '-1', label: '（取り込まない）' },
    ...displayHeaders.map((h, i) => ({ value: String(i), label: `${i + 1}. ${h || '(空欄)'}` })),
  ]), [displayHeaders]);

  const setField = (field, idxStr) => {
    const idx = parseInt(idxStr, 10);
    setMapping(prev => ({ ...prev, [field]: isNaN(idx) ? -1 : idx }));
  };

  const companyMapped = mapping.company != null && mapping.company >= 0;

  // 未マッピング列（備考JSONに入る列）
  const mappedIdxSet = new Set(Object.values(mapping).filter(v => v != null && v >= 0));
  const unmappedCols = displayHeaders
    .map((h, i) => ({ h, i }))
    .filter(({ i }) => !mappedIdxSet.has(i));

  // プレビュー（先頭5行）
  const preview = useMemo(
    () => buildRowsFromMapping(dataRows.slice(0, 5), headers, mapping, units),
    [dataRows, headers, mapping, units]
  );

  const fmtYen = (v) => (v == null ? '' : Number(v).toLocaleString() + '千円');

  const previewCols = [
    { key: 'company', label: '企業名', w: 160 },
    { key: 'phone', label: '電話番号', w: 110, mono: true },
    { key: 'pref', label: '都道府県', w: 80 },
    { key: 'address', label: '住所', w: 200 },
    { key: 'representative', label: '代表者', w: 90 },
    { key: 'revenue', label: '売上高', w: 100, fmt: fmtYen, right: true },
    { key: 'business', label: '事業内容', w: 160 },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: alpha(color.navyDeep, 0.5),
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4],
    }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl,
          width: 'min(920px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ヘッダー */}
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[3]}px ${space[4]}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold }}>カラムの紐付け</div>
            <div style={{ fontSize: font.size.xs, color: alpha(color.white, 0.7), marginTop: 2 }}>
              {fileName} ・ {dataRows.length}件
            </div>
          </div>
          <div style={{ fontSize: font.size.xs, color: alpha(color.white, 0.85), maxWidth: 360, textAlign: 'right' }}>
            CSVの列をスパナビの項目へ割り当ててください（自動判定済み・必要な箇所だけ修正）
          </div>
        </div>

        {/* 本体（スクロール） */}
        <div style={{ padding: space[4], overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: space[4] }}>
          {/* マッピング選択 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: space[3],
          }}>
            {TARGET_FIELDS.map(f => {
              const isMapped = mapping[f.key] != null && mapping[f.key] >= 0;
              return (
                <div key={f.key} style={{
                  border: `1px solid ${f.required && !isMapped ? color.danger : color.border}`,
                  borderRadius: radius.md, padding: `${space[2]}px ${space[2]}px`,
                  background: isMapped ? alpha(color.navyLight, 0.04) : color.white,
                }}>
                  <div style={{
                    fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark,
                    marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {f.label}
                    {f.required && <span style={{ color: color.danger }}>*</span>}
                  </div>
                  <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
                    <Select
                      size="sm"
                      value={String(mapping[f.key] ?? -1)}
                      onChange={e => setField(f.key, e.target.value)}
                      options={colOptions}
                    />
                    {f.unit && isMapped && (
                      <Select
                        size="sm"
                        fullWidth={false}
                        containerStyle={{ width: 92, flexShrink: 0 }}
                        value={units[f.key] || '千円'}
                        onChange={e => setUnits(prev => ({ ...prev, [f.key]: e.target.value }))}
                        options={UNIT_OPTIONS.map(u => ({ value: u, label: u }))}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 未マッピング列の注記 */}
          <div style={{ fontSize: font.size.xs, color: color.textMid }}>
            {unmappedCols.length > 0 ? (
              <>紐付けていない列（{unmappedCols.map(c => c.h || '(空欄)').join(' / ')}）は「備考」にまとめて保存されます。</>
            ) : (
              <>すべての列を項目に紐付けています。</>
            )}
          </div>

          {/* プレビュー */}
          <div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[1] }}>
              プレビュー（先頭{preview.length}件）
            </div>
            <div style={{ overflowX: 'auto', border: `1px solid ${color.border}`, borderRadius: radius.md }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: font.size.xs }}>
                <thead>
                  <tr style={{ background: color.navy }}>
                    {previewCols.map(c => (
                      <th key={c.key} style={{
                        color: color.white, fontWeight: font.weight.semibold,
                        padding: '6px 8px', textAlign: c.right ? 'right' : 'left',
                        whiteSpace: 'nowrap', minWidth: c.w,
                      }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, ri) => (
                    <tr key={ri} style={{ background: ri % 2 ? color.cream : color.white }}>
                      {previewCols.map(c => {
                        const val = c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '');
                        return (
                          <td key={c.key} style={{
                            padding: '5px 8px', textAlign: c.right ? 'right' : 'left',
                            color: color.textDark,
                            fontFamily: c.mono ? font.family.mono : font.family.sans,
                            maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            borderTop: `1px solid ${color.borderLight}`,
                          }}>{String(val)}</td>
                        );
                      })}
                    </tr>
                  ))}
                  {preview.length === 0 && (
                    <tr><td colSpan={previewCols.length} style={{ padding: space[3], color: color.textLight, textAlign: 'center' }}>
                      企業名の列を紐付けるとプレビューが表示されます
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div style={{
          borderTop: `1px solid ${color.border}`, padding: `${space[3]}px ${space[4]}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2],
        }}>
          <div style={{ fontSize: font.size.xs, color: companyMapped ? color.textMid : color.danger }}>
            {companyMapped ? '「企業名」が紐付いています' : '「企業名」の列を紐付けてください（必須）'}
          </div>
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button variant="outline" size="md" onClick={onCancel} disabled={busy}>キャンセル</Button>
            <Button
              variant="primary" size="md"
              loading={busy}
              disabled={!companyMapped || busy}
              onClick={() => onConfirm(mapping, units)}
            >この紐付けで取り込む</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
