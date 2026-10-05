import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, Download, RefreshCw, Columns3 } from 'lucide-react';
import { Button, Select, Card, Badge, DataTable, Pager } from '../ui';
import { color, space, font, radius, shadow } from '../../constants/design';
import { fetchCompanyProfileStats } from '../../lib/companyProfileApi';
import { searchCompanyDirectory, buildDirectoryCsv } from '../../lib/companyDirectoryApi';
import {
  DIRECTORY_FILTERS, DIRECTORY_EXPORT_COLUMNS, DIRECTORY_DEFAULT_COLUMNS, normalizeDirectoryFilters, validateDirectoryFilters,
  advancedDirectoryConditionCount, directoryConditionChips,
} from '../../utils/companyDirectoryFilters';
import { useDirectoryFilterOptions } from '../../hooks/useDirectoryFilterOptions';
import { useIsMobile } from '../../hooks/useIsMobile';
import CompanyDirectoryFilters from './CompanyDirectoryFilters';
import CompanyProfileDialog from './CompanyProfileDialog';
import DatabaseChatPanel from '../database/DatabaseChatPanel';
import DatabaseExportColumnModal from '../database/DatabaseExportColumnModal';

// =====================================================================
// 企業DB（Phalanx の企業DBにならう・2026-10-05）
//   検索カード：見出しの段（企業検索・条件クリア・検索・畳む）→ 基本の条件 → 詳細条件（畳む）
//   畳んでいる間は、入っている条件をチップで出す。×は条件を外すだけで検索はしない。
//   結果：件数・列の切り替え・並び順・CSV → 表 → 下の中央にページ送り。
//   検索の仕組み（search_company_directory と引数）は変えていない。
// =====================================================================

const PAGE_SIZE = 50;
const COLUMN_STORE = 'spanavi.companyDb.columns';
const matchLabels = { same: '一致', different: '不一致', unknown: '判定不可' };
const NUMBER_KEYS = new Set(['revenue_k', 'net_income_k', 'ordinary_income_k', 'capital_k', 'employee_count', 'representative_age', 'established_year']);
const WIDTH = { business_description: 220, address: 240, shareholders: 200, officers: 200, clients: 200, remarks: 200, next_action_at: 150, phone: 130, industry_sub: 160, industry_major: 140, id: 280 };

const fmtNumber = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('ja-JP'));
function columnDef(c) {
  const base = { key: c.key, label: c.label, width: WIDTH[c.key] || (NUMBER_KEYS.has(c.key) ? 120 : 120) };
  if (NUMBER_KEYS.has(c.key)) return { ...base, align: 'right', render: (r) => fmtNumber(r[c.key]) };
  if (c.key === 'address_match') return { ...base, align: 'center', render: (r) => (r.address_match ? <Badge variant={r.address_match === 'same' ? 'success' : 'neutral'}>{matchLabels[r.address_match]}</Badge> : '—') };
  if (c.key === 'crm_stage' || c.key === 'registry_status') return { ...base, align: 'center', render: (r) => r[c.key] || '—' };
  if (c.key === 'next_action_at') return { ...base, align: 'right', render: (r) => (r.next_action_at ? new Date(r.next_action_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—') };
  if (c.key === 'industry_sub') return { ...base, align: 'left', render: (r) => r.industry_sub || r.industry || '—' };
  return { ...base, align: 'left', render: c.get ? (r) => c.get(r) || '—' : (r) => r[c.key] ?? r.values?.[c.key] ?? '—' };
}
const PICKABLE = DIRECTORY_EXPORT_COLUMNS.filter((c) => c.key !== 'company_name');

function loadColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_STORE) || 'null');
    if (Array.isArray(saved) && saved.length) return saved.filter((k) => PICKABLE.some((c) => c.key === k));
  } catch { /* 保存が読めなくても既定で出す */ }
  return DIRECTORY_DEFAULT_COLUMNS;
}

// 表示する列を選ぶ小窓。並びは定義の順に固定する（選んだ順にしない）。
function ColumnPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const set = (keys) => {
    const ordered = PICKABLE.map((c) => c.key).filter((k) => keys.includes(k));
    onChange(ordered);
    try { localStorage.setItem(COLUMN_STORE, JSON.stringify(ordered)); } catch { /* 保存できなくても画面は変える */ }
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button size="sm" variant="ghost" iconLeft={<Columns3 size={15} />} aria-expanded={open} onClick={() => setOpen((v) => !v)}>表示する列（{value.length}）</Button>
      {open && (
        <div role="dialog" aria-label="表示する列" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, width: 320, maxHeight: 420, overflowY: 'auto',
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg, boxShadow: shadow.lg, padding: 12,
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => set(DIRECTORY_DEFAULT_COLUMNS)}>既定に戻す</Button>
            <Button size="sm" variant="ghost" onClick={() => set(PICKABLE.map((c) => c.key))}>すべて</Button>
          </div>
          <div style={{ fontSize: 11, color: color.textLight, marginBottom: 6 }}>企業名はいつも左端に出ます。選んだ列はこの端末に残ります。</div>
          {PICKABLE.map((c) => (
            <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 12.5, color: color.textDark, cursor: 'pointer' }}>
              <input type="checkbox" checked={value.includes(c.key)}
                onChange={(e) => set(e.target.checked ? [...value, c.key] : value.filter((k) => k !== c.key))} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompanyDirectory({ revision = 0, isAdmin = false, aiOpen = false, onCloseAi }) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState(DIRECTORY_FILTERS), [request, setRequest] = useState(null);
  const [result, setResult] = useState({ rows: [], count: null, filters: DIRECTORY_FILTERS });
  const [stats, setStats] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [validation, setValidation] = useState(''), [expanded, setExpanded] = useState(true), [attempt, setAttempt] = useState(0), [target, setTarget] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(loadColumns);
  const [columnPicker, setColumnPicker] = useState(false), [exporting, setExporting] = useState(false), [exportProgress, setExportProgress] = useState(0), [exportError, setExportError] = useState('');
  const exportController = useRef(null), active = useRef(true);
  const { options, names, error: optionError, retry: retryOptions } = useDirectoryFilterOptions();

  useEffect(() => { active.current = true; return () => { active.current = false; exportController.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    fetchCompanyProfileStats(controller.signal).then((data) => { if (current) setStats(data); }).catch((e) => { if (current) setError(e.message); });
    return () => { current = false; controller.abort(); };
  }, [revision, attempt]);
  // 未検索のうちは一覧を出さない（Phalanxと同じ）。51万社を黙って引くと遅く、意味もない。
  useEffect(() => {
    if (!request) { setLoading(false); return undefined; }
    const controller = new AbortController(); let current = true; setLoading(true); setError('');
    searchCompanyDirectory(request.filters, controller.signal).then((data) => {
      if (current) { setResult({ ...data, filters: request.filters }); if (request.collapse) setExpanded(false); }
    }).catch((e) => { if (current) setError(e.message || '企業一覧を取得できませんでした'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [request, revision, attempt]);

  const change = (key, value) => setDraft((prev) => {
    const next = { ...prev, [key]: value };
    if (key === 'keyword') next.keywords = [];
    if (key === 'city') { next.cities = value.split(/[,、]/).map((s) => s.trim()).filter(Boolean); next.city = next.cities.length > 1 ? '' : value; if (next.cities.length < 2) next.cities = []; }
    if (key === 'phonePattern') next.phonePatterns = [];
    if (key === 'daibunrui') next.saibunrui = [];
    if (key.endsWith('NullMode') && value === 'only') { next[key.replace('NullMode', 'Min')] = ''; next[key.replace('NullMode', 'Max')] = ''; }
    return next;
  });
  const apply = (filters) => {
    const normalized = normalizeDirectoryFilters({ ...filters, page: 0, pageSize: PAGE_SIZE }), message = validateDirectoryFilters(normalized);
    setValidation(message);
    // 範囲の誤りは詳細条件にあるので、詳細も開く
    if (message) { setExpanded(true); setDetailsOpen(true); return; }
    setDraft(normalized); setRequest({ filters: normalized, collapse: true });
  };
  const clear = () => { setDraft(DIRECTORY_FILTERS); setValidation(''); setExpanded(true); setDetailsOpen(false); setError(''); setRequest(null); setResult({ rows: [], count: null, filters: DIRECTORY_FILTERS }); };
  const page = (index) => setRequest({ filters: { ...result.filters, page: index }, collapse: false });
  // チップの×：下書きだけを変える。検索はしない（押した後は検索ボタンへ）。
  const removeChip = (patch) => { setDraft((prev) => ({ ...prev, ...patch })); setTimeout(() => typeof document !== 'undefined' && document.querySelector('[data-directory-search]')?.focus(), 0); };

  const exportCsv = async (keys) => {
    setColumnPicker(false); setExporting(true); setExportProgress(0); setExportError('');
    const controller = new AbortController(); exportController.current = controller;
    try {
      const csv = await buildDirectoryCsv(result.filters, result.count, keys, { signal: controller.signal, onProgress: (n) => { if (active.current) setExportProgress(n); } });
      if (!active.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
      a.href = url; a.download = '企業リスト_' + new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) + '.csv'; a.click(); URL.revokeObjectURL(url);
    } catch (e) { if (active.current) setExportError(controller.signal.aborted ? 'CSV出力を中断しました。' : e.message); }
    finally { if (active.current) setExporting(false); exportController.current = null; }
  };

  const count = result.count;
  const chips = useMemo(() => directoryConditionChips(draft, names), [draft, names]);
  const strip = (f) => JSON.stringify({ ...f, page: 0, pageSize: PAGE_SIZE });
  const draftChanged = !!request && strip(normalizeDirectoryFilters(draft)) !== strip(result.filters);
  const columns = useMemo(() => [
    { key: 'company_name', label: '企業名', width: 230, align: 'left', mobilePrimary: true, render: (r) => <span style={{ fontWeight: 700, color: color.textDark }}>{r.company_name}</span> },
    ...PICKABLE.filter((c) => visibleColumns.includes(c.key)).map(columnDef),
  ], [visibleColumns]);

  const card = {
    background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.xl,
    boxShadow: shadow.sm, padding: isMobile ? 12 : 20, marginBottom: space[4],
  };

  return <>
    {/* ── 検索カード ── */}
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 20, flexWrap: 'wrap', marginBottom: expanded || chips.length ? 16 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'auto' }}>
          <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: color.navy, color: color.white }}><Search size={19} /></span>
          <h2 style={{ fontSize: 17, margin: 0, color: color.navy }}>企業検索</h2>
          <span style={{ fontSize: 11.5, color: color.textLight }}>全 {stats ? stats.total.toLocaleString() : '—'} 社</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="sm" variant="ghost" onClick={clear}>条件クリア</Button>
          <Button size="sm" data-directory-search loading={loading} onClick={() => apply(draft)} title="Enterで検索">検索</Button>
          <button type="button" aria-label={expanded ? '検索条件を閉じる' : '検索条件を変更'} title={expanded ? '検索条件を閉じる' : '検索条件を開く'} aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, padding: 0, cursor: 'pointer',
              border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.white, color: color.navy,
            }}>
            <span aria-hidden="true" style={{ display: 'flex', transform: expanded ? 'rotate(180deg)' : undefined }}><ChevronDown size={18} /></span>
          </button>
        </div>
      </div>

      {expanded && (
        <CompanyDirectoryFilters filters={draft} onChange={change} onSearch={() => apply(draft)}
          options={options} optionError={optionError} onRetryOptions={retryOptions} error={validation}
          detailsOpen={detailsOpen} onDetailsToggle={() => setDetailsOpen((v) => !v)} isMobile={isMobile} />
      )}

      {/* 入っている条件。×で外せる（検索はしない）。 */}
      {!expanded && chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: color.textMid, marginRight: 8 }}>選択中の条件</span>
          {chips.map((c) => (
            <button key={c.k} type="button" aria-label={c.label + 'を外す'} onClick={() => removeChip(c.patch)} style={{
              display: 'inline-flex', gap: 8, alignItems: 'center', padding: '4px 9px', cursor: 'pointer',
              background: color.infoSoft, border: `1px solid ${color.border}`, borderRadius: radius.md,
              color: color.navy, fontSize: 11.5, fontFamily: font.family.sans, textAlign: 'left', maxWidth: '100%',
            }}>{c.label}<span aria-hidden="true" style={{ color: color.textMid }}>×</span></button>
          ))}
        </div>
      )}
    </div>

    {exporting && <Card><span role="status">CSV出力用に {exportProgress.toLocaleString()} 社を取得しました。</span><Button size="sm" variant="ghost" onClick={() => exportController.current?.abort()}>出力を中断</Button></Card>}
    {exportError && <p role="alert" style={{ color: color.danger }}>{exportError}</p>}

    {!request ? (
      <div style={{ ...card, padding: '60px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: color.textDark, marginBottom: 8 }}>条件を指定して検索してください</div>
        <div style={{ fontSize: 12, color: color.textLight }}>条件なしで検索すると全社を表示します。</div>
      </div>
    ) : <>
    {/* ── 結果の段 ── */}
    {draftChanged && !loading && (
      <div role="status" style={{ fontSize: 12.5, color: color.textMid, margin: '0 0 10px' }}>変更した条件は未反映です。検索またはEnterで更新します。</div>
    )}
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[3] }}>
      <span role="status" style={{ fontSize: 13, color: color.textMid }}>
        {loading ? '検索中…' : count == null ? '—' : <><strong style={{ fontSize: 18, color: color.navy }}>{count.toLocaleString()}</strong> 社</>}
      </span>
      <div style={{ flex: 1 }} />
      <ColumnPicker value={visibleColumns} onChange={setVisibleColumns} />
      <Select size="sm" aria-label="企業一覧の並び順" value={result.filters.sortCol + ':' + result.filters.sortDir} disabled={loading} containerStyle={{ width: 180 }}
        onChange={(e) => { const [sortCol, sortDir] = e.target.value.split(':'); const filters = { ...result.filters, sortCol, sortDir, page: 0 }; setDraft((prev) => ({ ...prev, sortCol, sortDir })); setRequest({ filters, collapse: false }); }}
        options={[{ value: 'company_name:asc', label: '企業名順' }, { value: 'revenue_k:desc', label: '売上高が大きい順' }, { value: 'net_income_k:desc', label: '当期純利益が大きい順' }, { value: 'employee_count:desc', label: '従業員数が多い順' }, { value: 'representative_age:desc', label: '代表者年齢が高い順' }, { value: 'next_action_at:asc', label: '次回対応が近い順' }]} />
      <Button size="sm" variant="ghost" aria-label="企業一覧を再読み込み" iconLeft={<RefreshCw size={15} />} onClick={() => setAttempt((n) => n + 1)} disabled={loading}>再読み込み</Button>
      {isAdmin && <Button size="sm" variant="outline" iconLeft={<Download size={15} />} disabled={loading || !!error || !count || exporting} onClick={() => setColumnPicker(true)}>検索結果をCSV出力</Button>}
    </div>

    <DataTable ariaLabel="企業一覧" loading={loading} error={error} rows={result.rows} rowKey="id" fillWidth height="auto" showCount={false}
      onRowClick={(row) => setTarget({ companyId: row.id })} emptyMessage="条件に合う企業はありません" rowAccent={(row) => (row.needs_review ? 'warn' : null)} columns={columns} />

    <div style={{ marginTop: space[4] }}>
      <Pager page={result.filters.page} pageSize={PAGE_SIZE} total={count} unit="社" onPage={page} disabled={loading || !!error} />
    </div>
    </>}

    {target && <CompanyProfileDialog target={target} onClose={() => setTarget(null)} onChanged={() => setAttempt((n) => n + 1)} onSelectCompany={(companyId) => setTarget({ companyId })} />}
    {columnPicker && <DatabaseExportColumnModal columns={DIRECTORY_EXPORT_COLUMNS} totalCount={count} onCancel={() => setColumnPicker(false)} onConfirm={exportCsv} />}
    <DatabaseChatPanel open={aiOpen} onClose={onCloseAi} baseFilters={draft} onApplyFilters={(filters) => { apply(filters); if (advancedDirectoryConditionCount(normalizeDirectoryFilters(filters)) > 0) setDetailsOpen(true); onCloseAi?.(); }} />
  </>;
}
