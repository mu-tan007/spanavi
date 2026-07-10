import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius } from '../../../../constants/design';
import { Button, Input, Select, Card, DataTable } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import { useCompanySearch } from '../../../../hooks/useCompanySearch';
import { fetchCategoryGroups, fetchPrefectures, searchCompanies } from '../../../../lib/companyMasterApi';

// ============================================================
// スパキャリ受講生向け 企業DB（直案件用）
// ----------------------------------------------------------------
// 営業代行ポータルの企業DB（company_master / search_company_master RPC）を「読み取り専用」で
// 流用する受講生ビュー。第4回セッション完了で解禁（表示ゲートは SpacareerClientApp 側）。
//   - 表示は 8 列のみ（企業名/業種/事業内容/都道府県/住所/売上高/代表者/電話番号）
//   - 売上高は正確値を出さず「上1桁で四捨五入」した概算を表示（内部の並び替えは真値）
//   - 業種(細分類)・業態(大分類)・売上規模・企業名でソート可
//   - CSVエクスポート可。AIチャット/インポート等の管理機能は出さない
// ※ 営業代行の DatabaseView 本体には手を入れない（共通の検索フックのみ流用）。
// ============================================================

// 売上高(千円)を上1桁で四捨五入した概算にする（例 469,000→500,000 / 87,000→90,000 / 12,000→10,000）。
function roundRevenue(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 0;
  const digits = Math.floor(Math.log10(Math.abs(n)));
  const factor = Math.pow(10, digits);
  return Math.round(n / factor) * factor;
}

const SORT_OPTIONS = [
  { value: 'company_name', label: '企業名' },
  { value: 'industry_sub', label: '業種' },
  { value: 'industry_major', label: '業態（大分類）' },
  { value: 'revenue_k', label: '売上規模' },
];

const csvQuote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function SpacareerCompanyDbView() {
  const {
    filters, setFilter, setFilters, resetFilters,
    results, totalCount, loading, hasSearched, doSearch, setPage,
  } = useCompanySearch();

  const [daibunruiOptions, setDaibunruiOptions] = useState([{ value: '', label: '業態（大分類）すべて' }]);
  const [prefOptions, setPrefOptions] = useState([{ value: '', label: '都道府県すべて' }]);
  const [exporting, setExporting] = useState(false);

  // 初期表示: マスタ選択肢を読み込み、初回検索を実行
  useEffect(() => {
    (async () => {
      try {
        const groups = await fetchCategoryGroups();
        setDaibunruiOptions([
          { value: '', label: '業態（大分類）すべて' },
          ...groups.map((g) => ({ value: g.daibunrui, label: g.daibunrui })),
        ]);
      } catch (e) { console.warn('[SpacareerCompanyDb] category load', e); }
      try {
        const prefs = await fetchPrefectures();
        setPrefOptions([{ value: '', label: '都道府県すべて' }, ...prefs.map((p) => ({ value: p, label: p }))]);
      } catch (e) { console.warn('[SpacareerCompanyDb] pref load', e); }
    })();
    doSearch({ ...filters, page: 0 });
    // eslint-disable-line react-hooks/exhaustive-deps
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = () => doSearch({ ...filters, page: 0 });

  const handleSortChange = (col) => {
    const next = { ...filters, sortCol: col, page: 0 };
    setFilters(() => next);
    doSearch(next);
  };
  const handleSortDir = (dir) => {
    const next = { ...filters, sortDir: dir, page: 0 };
    setFilters(() => next);
    doSearch(next);
  };

  const rows = useMemo(() => (results || []).map((r) => ({
    ...r,
    _address: r.full_address || r.address || '',
    _revenue: roundRevenue(r.revenue_k),
  })), [results]);

  const columns = [
    { key: 'company_name', label: '企業名', width: 200, align: 'left',
      cellStyle: { fontWeight: font.weight.semibold } },
    { key: 'industry_sub', label: '業種', width: 150, align: 'left' },
    { key: 'business_description', label: '事業内容', width: 300, align: 'left' },
    { key: 'prefecture', label: '都道府県', width: 90, align: 'left' },
    { key: '_address', label: '住所', width: 200, align: 'left' },
    { key: '_revenue', label: '売上高(千円)', width: 130, align: 'right',
      cellStyle: { fontFamily: font.family.mono },
      render: (r) => r._revenue == null
        ? <span style={{ color: color.textLight }}>—</span>
        : `約${Number(r._revenue).toLocaleString()}` },
    { key: 'representative', label: '代表者', width: 120, align: 'left' },
    { key: 'phone', label: '電話番号', width: 130, align: 'left',
      cellStyle: { fontFamily: font.family.mono } },
  ];

  async function handleExportCsv() {
    setExporting(true);
    try {
      // 現在の絞り込み条件で最大1000件まで取得してCSV化（売上は概算値で出力）
      const { rows: allRows } = await searchCompanies({ ...filters, page: 0, pageSize: 1000 });
      const header = ['企業名', '業種', '事業内容', '都道府県', '住所', '売上高(千円/概算)', '代表者', '電話番号'];
      const lines = [header.map(csvQuote).join(',')];
      (allRows || []).forEach((r) => {
        const rev = roundRevenue(r.revenue_k);
        lines.push([
          r.company_name, r.industry_sub, r.business_description, r.prefecture,
          r.full_address || r.address || '',
          rev == null ? '' : rev,
          r.representative, r.phone,
        ].map(csvQuote).join(','));
      });
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `企業リスト_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[SpacareerCompanyDb] export error', e);
      alert('CSVの書き出しに失敗しました。時間をおいて再度お試しください。');
    } finally {
      setExporting(false);
    }
  }

  const pageSize = filters.pageSize || 50;
  const page = filters.page || 0;
  const maxPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <PageHeader
        title="企業データベース"
        description="直案件の開拓に使える企業情報を検索できます（TSRデータ）。業種・業態・売上規模で並び替えできます。"
      />

      <Card padding="md">
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <Input size="sm" label="キーワード（企業名・事業内容）"
              value={filters.keyword}
              onChange={(e) => setFilter('keyword', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="例) SaaS、製造、コンサル…" />
          </div>
          <div style={{ flex: '0 1 180px', minWidth: 150 }}>
            <Select label="業態（大分類）" value={filters.daibunrui?.[0] || ''}
              onChange={(e) => setFilter('daibunrui', e.target.value ? [e.target.value] : [])}
              options={daibunruiOptions} />
          </div>
          <div style={{ flex: '0 1 150px', minWidth: 130 }}>
            <Select label="都道府県" value={filters.prefecture?.[0] || ''}
              onChange={(e) => setFilter('prefecture', e.target.value ? [e.target.value] : [])}
              options={prefOptions} />
          </div>
          <div style={{ flex: '0 1 200px', minWidth: 180 }}>
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 4 }}>売上高（千円）</div>
            <div style={{ display: 'flex', gap: space[2] }}>
              <Input size="sm" type="number" value={filters.revenueMin}
                onChange={(e) => setFilter('revenueMin', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                placeholder="以上" containerStyle={{ width: '50%' }} />
              <Input size="sm" type="number" value={filters.revenueMax}
                onChange={(e) => setFilter('revenueMax', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                placeholder="未満" containerStyle={{ width: '50%' }} />
            </div>
          </div>
          <div style={{ flex: '0 1 160px', minWidth: 140 }}>
            <Input size="sm" label="電話番号（前方一致）"
              value={filters.phonePattern}
              onChange={(e) => setFilter('phonePattern', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="例) 03, 06, 080" />
          </div>
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button variant="primary" size="sm" onClick={runSearch} loading={loading}>検索</Button>
            <Button variant="outline" size="sm" onClick={() => { resetFilters(); setTimeout(() => doSearch({ page: 0, pageSize: 50, sortCol: 'id', sortDir: 'asc' }), 0); }}>リセット</Button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end', marginTop: space[3] }}>
          <div style={{ flex: '0 1 180px', minWidth: 150 }}>
            <Select label="並び替え" value={SORT_OPTIONS.some((o) => o.value === filters.sortCol) ? filters.sortCol : 'company_name'}
              onChange={(e) => handleSortChange(e.target.value)}
              options={SORT_OPTIONS} />
          </div>
          <div style={{ flex: '0 1 120px', minWidth: 110 }}>
            <Select label="順序" value={filters.sortDir || 'asc'}
              onChange={(e) => handleSortDir(e.target.value)}
              options={[{ value: 'asc', label: '昇順' }, { value: 'desc', label: '降順' }]} />
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="outline" size="sm" onClick={handleExportCsv} loading={exporting}
              disabled={!totalCount}>CSVダウンロード</Button>
          </div>
        </div>
      </Card>

      <div style={{ fontSize: font.size.sm, color: color.textMid }}>
        {hasSearched ? `${totalCount.toLocaleString()} 件` : '　'}
      </div>

      <Card padding="none">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          loading={loading}
          emptyMessage="該当する企業がありません。条件を変えて検索してください。"
          height="calc(100vh - 360px)"
        />
      </Card>

      {totalCount > pageSize && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
          <Button variant="outline" size="sm" disabled={page <= 0 || loading}
            onClick={() => setPage(page - 1)}>前へ</Button>
          <span style={{ fontSize: font.size.sm, color: color.textMid, fontFamily: font.family.mono }}>
            {page + 1} / {maxPage + 1}
          </span>
          <Button variant="outline" size="sm" disabled={page >= maxPage || loading}
            onClick={() => setPage(page + 1)}>次へ</Button>
        </div>
      )}
    </div>
  );
}
