import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Settings } from 'lucide-react';
import { Button, Input, Select, Card, Badge, DataTable } from '../ui';
import { color, space, font, radius, shadow, alpha } from '../../constants/design';
import { parseImportFile, IMPORT_FILE_ACCEPT } from '../views/csvImportUtils';
import { IMPORT_PROVIDERS, MONEY_FACTORS, STANDARD_COMPANY_FIELDS, guessImportProvider, detectCompanyImportMapping,
  validateCompanyImportMapping, applyCompanyImportTemplate, companyImportTemplateSettings, normalizeCompanyImportRow, selectCompanyImportHeader } from '../../utils/companyImportFields';
import { fetchCompanyImportConfig, saveCompanyImportTemplate, companyImportFingerprint, executeCompanyImport, fetchCompanyImportJob } from '../../lib/companyImportApi';
import CompanyImportSettings from './CompanyImportSettings';

export default function CompanyImportDialog({ initialFile = null, listId = null, listName = '', initialTab = 'import', onClose, onDone }) {
  const [config, setConfig] = useState(null), [configError, setConfigError] = useState('');
  const [book, setBook] = useState(null), [sheetIndex, setSheetIndex] = useState(0), [mapping, setMapping] = useState([]);
  const [provider, setProvider] = useState('client'), [providerName, setProviderName] = useState('');
  const [templateId, setTemplateId] = useState(''), [templateName, setTemplateName] = useState('');
  const [tab, setTab] = useState(initialTab), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [job, setJob] = useState(null), [done, setDone] = useState(false);
  const [historyJob, setHistoryJob] = useState(null);
  const dialog = useRef(null), active = useRef(true), controller = useRef(null), initialRead = useRef(false);
  const fields = config?.fields || STANDARD_COMPANY_FIELDS;
  const sheet = book?.sheets[sheetIndex];
  const headers = sheet?.headersOriginal || [];
  const locked = busy || !!job;
  const visibleJob = tab === 'history' ? historyJob : job;
  const refresh = async () => { const value = await fetchCompanyImportConfig(); if (active.current) { setConfig(value); setConfigError(''); } };
  useEffect(() => {
    active.current = true;
    refresh().catch(e => { if (active.current) setConfigError(e.message); });
    dialog.current?.focus();
    return () => { active.current = false; controller.current?.abort(); };
  }, []);
  const selectSheet = (parsed, index, currentFields = fields) => {
    const next = parsed.sheets[index], source = guessImportProvider(next.headers);
    setBook(parsed); setSheetIndex(index); setProvider(source); setProviderName('');
    setMapping(detectCompanyImportMapping(next.headersOriginal, source, currentFields));
    setTemplateId(''); setTemplateName(''); setJob(null); setDone(false); setNotice(''); setError('');
  };
  const read = async file => {
    if (!file) return; setBusy(true); setError('');
    try {
      const parsed = await parseImportFile(file);
      if (parsed.sheets.some(s => s.headers.length > 256 || s.dataRows.length > 500000)) throw new Error('1シートにつき256列・50万行まで取り込めます。シートを分けてください。');
      if (active.current) selectSheet(parsed, 0);
    } catch (e) { if (active.current) setError(e.message); }
    finally { if (active.current) setBusy(false); }
  };
  useEffect(() => {
    if (initialFile && config && !initialRead.current) { initialRead.current = true; void read(initialFile); }
  }, [initialFile, config]);
  const settingsErrors = useMemo(() => sheet ? validateCompanyImportMapping(headers, mapping, fields, provider) : [], [sheet, headers, mapping, fields, provider]);
  const preview = useMemo(() => (sheet?.dataRows || []).slice(0, 5).map((cells, index) => {
    const row = sheet.sourceRowNumbers?.[index] || index + 2;
    try {
      const skipped = [], value = normalizeCompanyImportRow(cells, mapping, fields, skipped);
      return { row, ...value, error: skipped.length ? `読めない値は空欄で登録：${skipped.join('、')}` : '' };
    }
    catch (e) { return { row, error: e.message }; }
  }), [sheet, mapping, fields]);
  const changeMapping = (index, patch) => { setMapping(prev => prev.map((m, i) => i === index ? { ...m, ...patch } : m)); setNotice(''); };
  const changeProvider = value => {
    setProvider(value); setTemplateId(''); setTemplateName(''); setNotice('出所に合わせて列の対応と単位の候補を更新しました。');
    setMapping(detectCompanyImportMapping(headers, value, fields));
  };
  const changeHeader = index => {
    const next = selectCompanyImportHeader(sheet, index);
    const parsed = { ...book, sheets: book.sheets.map((s, i) => i === sheetIndex ? next : s) };
    selectSheet(parsed, sheetIndex);
  };
  const applyTemplate = id => {
    setTemplateId(id); const template = config.templates.find(t => t.id === id); if (!template) return;
    try { const applied = applyCompanyImportTemplate(headers, provider, template, fields); setMapping(applied.mapping); setTemplateName(template.name); setNotice(applied.warnings.join('\n') || '保存した列の対応を適用しました。プレビューを確認してください。'); }
    catch (e) { setError(e.message); }
  };
  const remember = async () => {
    setBusy(true); setError('');
    const existing = config.templates.find(t => t.id === templateId);
    try {
      const saved = await saveCompanyImportTemplate({ id: existing?.id || crypto.randomUUID(), name: templateName.trim(), provider,
        version: existing?.version || 0, active: true, settings: companyImportTemplateSettings(headers, mapping) });
      if (!active.current) return;
      await refresh(); setTemplateId(saved.id); setNotice('列の対応を保存しました。企業データの取込は「取り込む」で実行します。');
    } catch (e) { if (active.current) setError(`${e.message} 保存した取込設定を再読み込みしてから確認してください。`); }
    finally { if (active.current) setBusy(false); }
  };
  const start = async () => {
    if (!sheet || settingsErrors.length || busy) return;
    setBusy(true); setError(''); setDone(false); controller.current = new AbortController();
    try {
      const metadata = { fileName: book.fileName, sheetName: sheet.name || '', headerRow: sheet.headerRow || 1, provider, providerName: providerName.trim(), headers, mapping };
      const rows = sheet.dataRows.map((values, i) => ({ row_no: i + 1, source_row: sheet.sourceRowNumbers?.[i] || i + 2, values }));
      const fingerprint = await companyImportFingerprint(listId, metadata, rows);
      const result = await executeCompanyImport({ listId, metadata, rows, fingerprint, signal: controller.current.signal,
        onProgress: progress => { if (active.current) setJob(progress); } });
      if (!active.current) return;
      setJob(result); setDone(true);
      try { await onDone?.(result); }
      catch { if (active.current) setNotice('取込は完了しました。一覧の最新情報は画面を開き直して確認してください。'); }
    } catch (e) { if (active.current) setError(e.message || '取込を完了できませんでした。同じファイルから再開できます。'); }
    finally { controller.current = null; if (active.current) setBusy(false); }
  };
  const mappingRows = headers.map((header, i) => ({ id: i, header, rule: mapping[i] || { key: '' }, sample: sheet.dataRows.slice(0, 5).map(r => r[i]).find(v => v) || '—' }));
  return <div style={{ position: 'fixed', inset: 0, zIndex: 20010, background: alpha(color.navyDeep, 0.5), display: 'flex', justifyContent: 'center', alignItems: 'center', padding: space[3] }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="企業リストの取り込み" tabIndex={-1} onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const nodes = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(n => n.getClientRects().length);
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
      }
    }} style={{ width: 'min(1100px,98vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl, overflow: 'hidden' }}>
      <div style={{ padding: space[4], background: color.navy, color: color.white, display: 'flex', alignItems: 'center', gap: space[3] }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold }}>企業リストの取り込み</div><div style={{ fontSize: font.size.sm, marginTop: space[1] }}>{listId ? `${listName || '架電リスト'} ・ 企業DBへ自動登録` : '企業DBへ登録'}</div></div>
        <Button variant="ghost" aria-label="取込画面を閉じる" disabled={busy} onClick={onClose} iconLeft={<X size={20} />} style={{ color: color.white }}>閉じる</Button>
      </div>
      <div style={{ padding: space[4], overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: space[2], marginBottom: space[4], flexWrap: 'wrap' }}>
          <Button variant={tab === 'import' ? 'primary' : 'outline'} disabled={busy} onClick={() => setTab('import')} iconLeft={<Upload size={16} />}>ファイル取込</Button>
          <Button variant={tab === 'settings' ? 'primary' : 'outline'} disabled={busy || !!job} onClick={() => setTab('settings')} iconLeft={<Settings size={16} />}>項目・取込設定</Button>
          <Button variant={tab === 'history' ? 'primary' : 'outline'} disabled={busy} onClick={() => { setTab('history'); refresh().catch(e => setError(e.message)); }}>取込履歴</Button>
        </div>
        {configError && <p role="alert" style={{ color: color.danger }}>{configError} <Button size="sm" onClick={() => refresh().catch(e => setConfigError(e.message))}>再読み込み</Button></p>}
        {error && <p role="alert" style={{ color: color.danger, whiteSpace: 'pre-wrap' }}>{error}</p>}
        {notice && <p role="status" style={{ color: color.textMid, whiteSpace: 'pre-wrap' }}>{notice}</p>}
        {!config && !configError && <p role="status">取込設定を読み込んでいます…</p>}
        {config && tab === 'settings' && <CompanyImportSettings config={config} onChanged={refresh} />}
        {config && tab === 'history' && <Card title="取込履歴（直近20件）">
          <DataTable ariaLabel="企業の取込履歴" rows={config.jobs} rowKey="id" height={350} columns={[
            { key: 'file_name', label: 'ファイル名', width: 300, align: 'left' }, { key: 'saved', label: '登録した行', width: 100, align: 'right' },
            { key: 'rejected', label: '要修正', width: 80, align: 'right' }, { key: 'state', label: '状況', width: 150, align: 'center', render: r => r.processed === r.total ? '処理済み' : `${r.processed} / ${r.total}行` },
            { key: 'actions', label: '', width: 130, align: 'center', render: r => <Button size="sm" variant="outline" onClick={async () => { try { const value = await fetchCompanyImportJob(r.id); if (active.current) setHistoryJob(value); } catch (e) { if (active.current) setError(e.message); } }}>結果を確認</Button> },
          ]} /><p style={{ color: color.textMid, fontSize: font.size.sm }}>中断した取込は、同じファイル・同じ列の対応で再実行すると続きから登録されます。</p>
        </Card>}
        {config && tab === 'import' && <>
          <Input type="file" accept={IMPORT_FILE_ACCEPT} aria-label="取り込むCSVまたはExcel" label="CSV / Excel（.xlsx・.xlsm）" disabled={busy || !!job} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void read(file); }} />
          {sheet && <>
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginTop: space[3], flexWrap: 'wrap' }}>
              <strong>{book.fileName}</strong><Badge>{sheet.dataRows.length.toLocaleString()}行</Badge>{sheet.encoding && <Badge variant="neutral">{sheet.encoding.toUpperCase()}</Badge>}
              {book.sheets.length > 1 && <Select aria-label="取込シート" value={sheetIndex} disabled={locked} onChange={e => selectSheet(book, Number(e.target.value))} options={book.sheets.map((s, i) => ({ value: i, label: s.name || 'CSV' }))} />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: space[3], marginTop: space[4] }}>
              <Select label="列名が書かれている行" aria-label="取込ファイルの見出し行" disabled={locked} value={sheet.headerIndex || 0} onChange={e => changeHeader(Number(e.target.value))}
                options={(sheet.matrix || [sheet.headersOriginal, ...sheet.dataRows]).slice(0, -1).slice(0, 30).map((row, index) => ({ value: index, label: `${sheet.rowNumbers?.[index] || index + 1}行目：${row.slice(0, 3).join(' / ').slice(0, 60)}` }))} />
              <Select label="出所" aria-label="取込データの出所" value={provider} options={IMPORT_PROVIDERS} disabled={locked} onChange={e => changeProvider(e.target.value)} />
              <Input label="提供元・資料名（任意）" aria-label="取込データの提供元" value={providerName} maxLength={120} disabled={locked} onChange={e => setProviderName(e.target.value)} placeholder="クライアント名、商品名など" />
              <Select label="保存した列の対応" aria-label="保存した列の対応" value={templateId} disabled={locked} onChange={e => applyTemplate(e.target.value)}
                options={[{ value: '', label: '選択してください' }, ...config.templates.filter(t => t.provider === provider && t.active).map(t => ({ value: t.id, label: t.name }))]} />
            </div>
            {mapping.some(m => m.needsChoice && !m.key) && <p role="status" style={{ color: color.warn }}>同じ候補に当てはまる列があります。該当する列の取込先を選んでください。指定しない列も元の列名・値として保存します。</p>}
            <p style={{ color: color.textMid, fontSize: font.size.sm }}>列の対応と金額の単位を確認してください。元の列と値は出典として保存し、同じ企業の情報を企業DB・各架電リストで共有します。</p>
            <DataTable ariaLabel="インポート列の対応" rows={mappingRows} rowKey="id" height={330} showCount={false} columns={[
              { key: 'header', label: '元の列名', width: 200, align: 'left', render: r => `${r.id + 1}. ${r.header || '（空欄）'}` },
              { key: 'sample', label: '値の例', width: 230, align: 'left' },
              { key: 'target', label: '取込先の項目', width: 250, align: 'left', render: r => <Select size="sm" aria-label={`${r.id + 1}列目の取込先`} disabled={locked} value={r.rule.key}
                onChange={e => changeMapping(r.id, { key: e.target.value, unit: r.rule.unit || '千円', unitConfirmed: false })}
                options={[{ value: '', label: '出典として保存' }, ...fields.filter(f => f.active !== false).map(f => ({ value: f.key, label: f.label }))]} /> },
              { key: 'unit', label: '元の金額単位', width: 200, align: 'left', render: r => fields.find(f => f.key === r.rule.key)?.money && <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
                <Select size="sm" aria-label={`${r.id + 1}列目の金額単位`} disabled={locked} value={r.rule.unit || '千円'} onChange={e => changeMapping(r.id, { unit: e.target.value, unitConfirmed: true })} options={Object.keys(MONEY_FACTORS).map(value => ({ value, label: value }))} />
                {!r.rule.unitConfirmed && <Button size="sm" variant="outline" disabled={locked} onClick={() => changeMapping(r.id, { unitConfirmed: true })}>この単位で確認</Button>}
              </div> },
            ]} />
            {config.can_manage && <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap', marginTop: space[3] }}>
              <Input label="取込設定名" aria-label="取込設定名" value={templateName} disabled={locked} maxLength={120} onChange={e => setTemplateName(e.target.value)} containerStyle={{ maxWidth: 340 }} />
              <Button variant="outline" disabled={locked || !templateName.trim() || settingsErrors.length > 0} onClick={remember}>列の対応を保存</Button>
            </div>}
            <Card title="プレビュー（先頭5行）" style={{ marginTop: space[4] }}>
              <DataTable ariaLabel="企業取込プレビュー" rows={preview} rowKey="row" height={240} showCount={false} columns={[
                { key: 'row', label: '元の行', width: 70, align: 'right' }, { key: 'company_name', label: '企業名', width: 210, align: 'left' },
                { key: 'phone', label: '電話番号', width: 130, align: 'left' }, { key: 'address', label: '会社住所', width: 230, align: 'left' },
                { key: 'representative_address', label: '代表者自宅住所', width: 230, align: 'left' },
                { key: 'revenue_k', label: '売上高（千円）', width: 130, align: 'right' }, { key: 'error', label: '確認事項', width: 320, align: 'left' },
              ]} />
            </Card>
            {settingsErrors.length > 0 && <ul style={{ color: color.warn, fontSize: font.size.sm }}>{settingsErrors.map((message, i) => <li key={i}>{message}</li>)}</ul>}
            <p style={{ color: color.textMid, fontSize: font.size.sm }}>企業名が空欄の行は登録せず、取込結果に残します。数値・日付・電話番号として読めない値（「該当しない」など）は、その項目だけ空欄で登録し、元の値は出典として保存します。</p>
          </>}
        </>}
        {visibleJob && <Card title={busy ? '取り込み中' : visibleJob.processed === visibleJob.total ? '取込結果' : '中断した取込'} style={{ marginTop: space[4] }}>
          <p role="status">{visibleJob.processed?.toLocaleString()} / {visibleJob.total?.toLocaleString()}行　登録 {visibleJob.saved?.toLocaleString()}行{visibleJob.rejected > 0 ? ` ／ 要修正 ${visibleJob.rejected.toLocaleString()}行` : ''}</p>
          {!busy && visibleJob.saved > 0 && <p>企業DBへの登録を確認しました。{visibleJob.list_id ? `架電リストのNo.${visibleJob.first_no}〜${visibleJob.last_no}に登録した取込です。` : ''}</p>}
          {visibleJob.errors?.length > 0 && <DataTable ariaLabel="修正が必要な取込行" rows={visibleJob.errors} rowKey="row_no" height={200} columns={[
            { key: 'source_row', label: '元の行', width: 90, align: 'right' }, { key: 'error', label: '確認内容', width: 500, align: 'left' },
          ]} />}
          {!busy && visibleJob.rejected > (visibleJob.errors?.length || 0) && <p>修正が必要な行は先頭100行を表示しています。</p>}
        </Card>}
      </div>
      <div style={{ padding: space[4], borderTop: `1px solid ${color.border}`, display: 'flex', justifyContent: 'flex-end', gap: space[2], flexWrap: 'wrap' }}>
        <Button variant="outline" disabled={busy} onClick={onClose}>閉じる</Button>
        {busy && controller.current && <Button variant="outline" onClick={() => controller.current?.abort()}>中断</Button>}
        {tab === 'import' && done && <Button variant="outline" disabled={busy} onClick={() => { setBook(null); setMapping([]); setJob(null); setDone(false); setNotice(''); setError(''); }}>別のファイルを取り込む</Button>}
        {tab === 'import' && !done && <Button iconLeft={<Upload size={16} />} loading={busy} disabled={!config || !sheet || settingsErrors.length > 0} onClick={start}>{job ? '取込を再開' : '取り込む'}</Button>}
      </div>
    </div>
  </div>;
}
