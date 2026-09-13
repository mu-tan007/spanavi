import { useEffect, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { Button, Input, Select, Card, Badge, DataTable } from '../ui';
import { color, space, font } from '../../constants/design';
import { COMPANY_CRM_STAGES, COMPANY_REGISTRY_STATUSES } from '../../utils/companyProfileIdentity';
import { fetchCompanyProfileStats, searchCompanyProfiles } from '../../lib/companyProfileApi';
import CompanyProfileDialog from './CompanyProfileDialog';

const empty = { query: '', stage: '', home: '', registry: '', scope: '', industry: '', page: 0 };
const homeLabels = { available: '住所あり', unknown: '未確認', conflict: '相違あり' };
export default function CompanyDirectory({ revision = 0 }) {
  const [draft, setDraft] = useState(empty), [filters, setFilters] = useState(empty), [result, setResult] = useState({ rows: [], count: 0 });
  const [stats, setStats] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0), [target, setTarget] = useState(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    fetchCompanyProfileStats(controller.signal).then(data => { if (active) setStats(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; controller.abort(); };
  }, [revision, attempt]);
  useEffect(() => {
    const controller = new AbortController(); let active = true; setLoading(true); setError('');
    searchCompanyProfiles(filters, controller.signal).then(data => { if (active) setResult(data); })
      .catch(e => { if (active) setError(e.message || '企業一覧を取得できませんでした'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [filters, revision, attempt]);
  const select = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));
  const search = event => { event?.preventDefault(); setFilters({ ...draft, page: 0 }); };
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: space[3], marginBottom: space[4] }}>
      {[
        ['重複を除いた企業', 'total', ''], ['企業DBとリストに共通', 'shared', 'shared'],
        ['架電リストから追加', 'list_only', 'list_only'], ['代表者住所あり', 'home_available', 'home'],
      ].map(([label, key, scope]) => <Card key={key} padding="md">
        <div style={{ color: color.textMid, fontSize: font.size.sm }}>{label}</div>
        <div style={{ color: color.navy, fontWeight: font.weight.bold, fontSize: font.size.xl, marginTop: space[1] }}>{stats ? stats[key].toLocaleString() : '—'}<span style={{ fontSize: font.size.sm, marginLeft: space[1] }}>社</span></div>
        <Button variant="ghost" size="sm" onClick={() => { const f = { ...empty, scope: scope === 'home' ? '' : scope, home: scope === 'home' ? 'available' : '' }; setDraft(f); setFilters(f); }}>企業を表示</Button>
      </Card>)}
    </div>
    <Card style={{ marginBottom: space[3] }}>
      <form onSubmit={search}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: space[3] }}>
          <Input label="企業を検索" aria-label="共有企業を検索" placeholder="企業名・電話・法人番号・住所" value={draft.query} onChange={e => select('query', e.target.value)} />
          <Input label="業種" aria-label="共有企業の業種" placeholder="建設、製造など" value={draft.industry} onChange={e => select('industry', e.target.value)} />
          <Select label="対応状況" aria-label="共有企業の対応状況" value={draft.stage} onChange={e => select('stage', e.target.value)} options={[{ value: '', label: 'すべて' }, ...COMPANY_CRM_STAGES.map(value => ({ value, label: value }))]} />
          <Select label="代表者自宅住所" aria-label="共有企業の代表者自宅住所" value={draft.home} onChange={e => select('home', e.target.value)} options={[{ value: '', label: 'すべて' }, ...Object.entries(homeLabels).map(([value, label]) => ({ value, label }))]} />
          <Select label="対象" aria-label="共有企業の対象" value={draft.scope} onChange={e => select('scope', e.target.value)} options={[
            { value: '', label: 'すべての企業' }, { value: 'shared', label: '企業DB・リストに共通' }, { value: 'list_only', label: '架電リストから追加' },
            { value: 'review', label: '名寄せ・情報の確認が必要' }, { value: 'due', label: '次回対応の期限が到来' },
          ]} />
          <Select label="登記の確認状況" aria-label="共有企業の登記状況" value={draft.registry} onChange={e => select('registry', e.target.value)} options={[{ value: '', label: 'すべて' }, ...COMPANY_REGISTRY_STATUSES]} />
        </div>
        <div style={{ display: 'flex', gap: space[2], marginTop: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
          <Button type="submit" iconLeft={<Search size={16} />} loading={loading}>検索</Button>
          <Button variant="outline" type="button" onClick={() => { setDraft(empty); setFilters(empty); }}>条件を解除</Button>
          <Button variant="ghost" type="button" aria-label="共有企業を再読み込み" iconLeft={<RefreshCw size={16} />} onClick={() => setAttempt(n => n + 1)}>再読み込み</Button>
          <span style={{ marginLeft: 'auto', color: color.textMid, fontSize: font.size.sm }}>法人番号、または企業名と代表者・電話・住所の一致で紐付けています。</span>
        </div>
      </form>
    </Card>
    <DataTable ariaLabel="共有企業一覧" loading={loading} error={error} rows={result.rows} rowKey="id" fillWidth height="calc(100vh - 430px)" showCount={false}
      onRowClick={row => setTarget({ companyId: row.id })} emptyMessage="条件に合う企業はありません" rowAccent={row => row.needs_review ? 'warn' : null}
      columns={[
        { key: 'company_name', label: '企業名', width: 235, align: 'left', mobilePrimary: true },
        { key: 'representative', label: '代表者', width: 100, align: 'left' }, { key: 'phone', label: '電話番号', width: 130, align: 'left' },
        { key: 'address', label: '会社住所', width: 280, align: 'left' }, { key: 'industry', label: '業種', width: 160, align: 'left' },
        { key: 'crm_stage', label: '対応状況', width: 110, align: 'center', render: r => <Badge variant="primary">{r.crm_stage}</Badge> },
        { key: 'home_state', label: '代表者住所', width: 110, align: 'center', render: r => <Badge variant={r.home_state === 'conflict' ? 'warn' : r.home_state === 'available' ? 'success' : 'neutral'}>{homeLabels[r.home_state]}</Badge> },
        { key: 'list_count', label: 'リスト数', width: 80, align: 'right' }, { key: 'owner_name', label: '担当者', width: 100, align: 'left' },
        { key: 'next_action_at', label: '次回対応', width: 160, align: 'right', render: r => r.next_action_at ? new Date(r.next_action_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—' },
      ]} />
    <div style={{ display: 'flex', gap: space[3], alignItems: 'center', justifyContent: 'flex-end', marginTop: space[3], color: color.textMid, fontSize: font.size.sm }}>
      <span>{result.count.toLocaleString()}社 ／ {filters.page + 1} / {Math.max(1, Math.ceil(result.count / 50))}ページ</span>
      <Button variant="outline" size="sm" disabled={loading || filters.page === 0} onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}>前へ</Button>
      <Button variant="outline" size="sm" disabled={loading || (filters.page + 1) * 50 >= result.count} onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}>次へ</Button>
    </div>
    {target && <CompanyProfileDialog target={target} onClose={() => setTarget(null)} onChanged={() => setAttempt(n => n + 1)} onSelectCompany={companyId => setTarget({ companyId })} />}
  </>;
}
