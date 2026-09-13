import { useEffect, useMemo, useState } from 'react';
import { Button, Card, DataTable, Select } from '../ui';
import { color, space, font } from '../../constants/design';
import { fetchCompanyImportSources } from '../../lib/companyImportApi';
import { IMPORT_PROVIDERS } from '../../utils/companyImportFields';

const basic = new Set(['company_name','representative','phone','address','prefecture','city','street','business','industry','representative_address','corporate_number']);
export default function CompanyImportedFields({ companyId, showOriginal = false }) {
  const [sources, setSources] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0), [selected, setSelected] = useState(''), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true; const controller = new AbortController(); setLoading(true); setError(''); setSources([]); setExpanded(false);
    fetchCompanyImportSources(companyId, controller.signal).then(rows => { if (active) { setSources(rows); setSelected(rows[0]?.id || ''); } })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [companyId, attempt]);
  const values = useMemo(() => sources.flatMap(source => Object.entries(source.normalized || {}).filter(([key]) => !basic.has(key)).map(([key, value]) => {
    const field = source.fields?.find(f => f.key === key);
    return { id: `${source.id}:${key}`, label: field?.label || key,
      value: typeof value === 'number' ? `${value.toLocaleString()}${field?.money ? ' 千円' : ''}` : value,
      source: [source.provider_name || IMPORT_PROVIDERS.find(p => p.value === source.provider)?.label, source.file_name, source.sheet_name, `${source.source_row}行目`].filter(Boolean).join(' ／ ') };
  })), [sources]);
  if (loading) return null;
  if (error) return <Card style={{ marginTop: space[3] }}><p role="alert" style={{ color: color.danger }}>取込情報を読み込めませんでした。<Button size="sm" variant="outline" onClick={() => setAttempt(n => n + 1)}>再読み込み</Button></p></Card>;
  if (!sources.length || (!showOriginal && !values.length)) return null;
  const original = sources.find(s => s.id === selected);
  return <Card title={showOriginal ? '取り込んだ元の列・値' : '企業の補足情報'} style={{ marginTop: space[3] }}>
    {!showOriginal && <DataTable ariaLabel="共有する企業の補足情報" rows={values} rowKey="id" height={260} columns={[
      { key: 'label', label: '項目', width: 160, align: 'left' }, { key: 'value', label: '値', width: 260, align: 'left' },
      { key: 'source', label: '出典', width: 450, align: 'left' },
    ]} />}
    {showOriginal && <>
      <Select label="取込ファイル" aria-label="取込情報のファイル" value={selected} onChange={e => { setSelected(e.target.value); setExpanded(false); }} options={sources.map(s => ({ value: s.id, label: `${s.file_name}${s.sheet_name ? ` ／ ${s.sheet_name}` : ''} ／ ${s.source_row}行目` }))} />
      <Button variant="outline" size="sm" aria-expanded={expanded} style={{ marginTop: space[3] }} onClick={() => setExpanded(v => !v)}>{expanded ? '元の列を閉じる' : '元の列・値を表示'}</Button>
      {expanded && original && <DataTable ariaLabel="取り込んだ元の列と値" rows={(original.headers || []).map((header, i) => ({ id: i, header: header || '（空欄）', value: original.raw_values[i] || '—' }))} rowKey="id" height={300} columns={[
        { key: 'header', label: '元の列名', width: 250, align: 'left' }, { key: 'value', label: '元の値', width: 550, align: 'left' },
      ]} />}
      <p style={{ color: color.textMid, fontSize: font.size.sm }}>直近50件の取込情報を表示しています。基本情報の手動修正後も、取り込んだ値は出典として残ります。</p>
    </>}
  </Card>;
}
