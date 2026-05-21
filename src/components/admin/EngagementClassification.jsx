import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Button, Select, Badge, Card } from '../ui';
import DataTable from '../ui/DataTable';

// 営業代行系3業務種別（仕分け対象）
const SALES_AGENCY_SLUGS = ['seller_sourcing', 'matching', 'client_acquisition'];

const SLUG_LABEL = {
  seller_sourcing: '売り手ソーシング',
  matching: '買い手マッチング',
  client_acquisition: 'クライアント開拓',
};

// 自動推定: industry に「買い手」を含む → matching、is_prospecting=true → client_acquisition、その他 → seller_sourcing
function autoEstimate(row) {
  if (row.is_prospecting) return 'client_acquisition';
  if (row.industry && row.industry.includes('買い手')) return 'matching';
  return 'seller_sourcing';
}

export default function EngagementClassification({ onToast }) {
  const orgId = getOrgId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [engagements, setEngagements] = useState([]);
  const [rows, setRows] = useState([]); // { ...callList, client_name, _initial_engagement_id, _selected_engagement_id }
  const [filterSlug, setFilterSlug] = useState('all'); // all | unchanged | seller_sourcing | matching | client_acquisition
  const [showArchived, setShowArchived] = useState(true);

  // engagementsをロード（営業代行系3つ）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('engagements')
        .select('id, slug, name, status')
        .eq('org_id', orgId)
        .in('slug', SALES_AGENCY_SLUGS);
      if (cancelled) return;
      if (error) {
        onToast?.('タイプの取得に失敗しました: ' + error.message, 'error');
        return;
      }
      setEngagements(data || []);
    })();
    return () => { cancelled = true; };
  }, [orgId, onToast]);

  // call_lists を全件ロード（営業代行系engagementに紐付くもの。アーカイブ含む）
  const loadCallLists = async () => {
    setLoading(true);
    const salesAgencyIds = engagements.map(e => e.id);
    if (salesAgencyIds.length === 0) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('call_lists')
      .select(`
        id, name, industry, list_type, is_prospecting, is_archived,
        engagement_id, client_id, total_count, created_at,
        clients!inner ( id, name )
      `)
      .eq('org_id', orgId)
      .in('engagement_id', salesAgencyIds)
      .order('is_archived', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      onToast?.('リストの取得に失敗しました: ' + error.message, 'error');
      setLoading(false);
      return;
    }

    const mapped = (data || []).map(r => {
      const initial = r.engagement_id;
      const estimated = engagements.find(e => e.slug === autoEstimate(r))?.id || initial;
      // 初期値が seller_sourcing で自動推定がそれ以外なら推定値を初期セレクト
      const selected = (engagements.find(e => e.id === initial)?.slug === 'seller_sourcing' && estimated !== initial)
        ? estimated
        : initial;
      return {
        ...r,
        client_name: r.clients?.name || '(不明)',
        _initial_engagement_id: initial,
        _selected_engagement_id: selected,
      };
    });
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => {
    if (engagements.length > 0) loadCallLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagements]);

  // 統計
  const stats = useMemo(() => {
    const s = { all: rows.length, seller_sourcing: 0, matching: 0, client_acquisition: 0, changed: 0 };
    rows.forEach(r => {
      const slug = engagements.find(e => e.id === r._selected_engagement_id)?.slug;
      if (slug && s[slug] !== undefined) s[slug]++;
      if (r._initial_engagement_id !== r._selected_engagement_id) s.changed++;
    });
    return s;
  }, [rows, engagements]);

  // フィルタ適用
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (!showArchived && r.is_archived) return false;
      if (filterSlug === 'all') return true;
      if (filterSlug === 'unchanged') return r._initial_engagement_id !== r._selected_engagement_id;
      const slug = engagements.find(e => e.id === r._selected_engagement_id)?.slug;
      return slug === filterSlug;
    });
  }, [rows, filterSlug, showArchived, engagements]);

  const handleChangeEngagement = (rowId, newEngagementId) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, _selected_engagement_id: newEngagementId } : r));
  };

  const handleApplyAutoEstimate = () => {
    setRows(prev => prev.map(r => {
      const estimated = engagements.find(e => e.slug === autoEstimate(r))?.id;
      return estimated ? { ...r, _selected_engagement_id: estimated } : r;
    }));
    onToast?.('自動推定を全件に適用しました（保存はまだです）');
  };

  const handleSave = async () => {
    const changed = rows.filter(r => r._initial_engagement_id !== r._selected_engagement_id);
    if (changed.length === 0) {
      onToast?.('変更されたリストがありません');
      return;
    }
    if (!window.confirm(`${changed.length}件のリストのタイプを更新します。よろしいですか？`)) return;

    setSaving(true);
    const results = await Promise.allSettled(
      changed.map(r =>
        supabase
          .from('call_lists')
          .update({ engagement_id: r._selected_engagement_id })
          .eq('id', r.id)
      )
    );
    const errors = results.filter(x => x.status === 'rejected' || x.value?.error);
    setSaving(false);

    if (errors.length === 0) {
      onToast?.(`${changed.length}件のタイプを更新しました`);
      await loadCallLists();
    } else {
      onToast?.(`${changed.length - errors.length}件成功、${errors.length}件失敗`, 'error');
    }
  };

  const engagementSelectOptions = engagements
    .filter(e => SALES_AGENCY_SLUGS.includes(e.slug))
    .sort((a, b) => SALES_AGENCY_SLUGS.indexOf(a.slug) - SALES_AGENCY_SLUGS.indexOf(b.slug))
    .map(e => ({ value: e.id, label: SLUG_LABEL[e.slug] || e.name }));

  const columns = [
    {
      key: 'client_name', label: 'クライアント', width: 220, align: 'left',
      render: row => <span style={{ fontWeight: font.weight.semibold }}>{row.client_name}</span>,
    },
    {
      key: 'name', label: 'リスト名', width: 280, align: 'left',
      render: row => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{row.name}</span>
          {row.is_archived && (
            <span style={{ fontSize: font.size.xs, color: color.gray400 }}>アーカイブ</span>
          )}
        </div>
      ),
    },
    {
      key: 'industry', label: '業種', width: 200, align: 'left',
      render: row => row.industry || <span style={{ color: color.gray400 }}>—</span>,
    },
    {
      key: 'total_count', label: '社数', width: 80, align: 'right',
      render: row => (row.total_count ?? 0).toLocaleString(),
    },
    {
      key: 'flags', label: 'フラグ', width: 140, align: 'center',
      render: row => (
        <div style={{ display: 'flex', gap: space[1], justifyContent: 'center' }}>
          {row.is_prospecting && <Badge variant="warn">開拓</Badge>}
          {row.is_archived && <Badge variant="neutral">archived</Badge>}
        </div>
      ),
    },
    {
      key: '_selected_engagement_id', label: 'タイプ', width: 220, align: 'center',
      render: row => {
        const changed = row._initial_engagement_id !== row._selected_engagement_id;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch' }}>
            <Select
              value={row._selected_engagement_id || ''}
              onChange={e => handleChangeEngagement(row.id, e.target.value)}
              options={engagementSelectOptions}
              style={{
                fontSize: font.size.sm,
                borderColor: changed ? color.warn : undefined,
                background: changed ? alpha(color.warn, 0.05) : undefined,
              }}
            />
            {changed && (
              <span style={{ fontSize: 10, color: color.warn, textAlign: 'center' }}>変更あり（未保存）</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* 説明 */}
      <Card padding="md">
        <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.6 }}>
          営業代行系の架電リストを「売り手ソーシング／買い手マッチング／クライアント開拓」のいずれかに仕分けます。
          自動推定ルール：is_prospecting=true → クライアント開拓、industry に「買い手」を含む → 買い手マッチング、それ以外 → 売り手ソーシング。
        </div>
      </Card>

      {/* 統計 */}
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <StatCell label="全件" value={stats.all} active={filterSlug === 'all'} onClick={() => setFilterSlug('all')} />
        <StatCell label="売り手ソーシング" value={stats.seller_sourcing} active={filterSlug === 'seller_sourcing'} onClick={() => setFilterSlug('seller_sourcing')} />
        <StatCell label="買い手マッチング" value={stats.matching} active={filterSlug === 'matching'} onClick={() => setFilterSlug('matching')} />
        <StatCell label="クライアント開拓" value={stats.client_acquisition} active={filterSlug === 'client_acquisition'} onClick={() => setFilterSlug('client_acquisition')} />
        <StatCell label="変更あり（未保存）" value={stats.changed} accent="warn" active={filterSlug === 'unchanged'} onClick={() => setFilterSlug('unchanged')} />
      </div>

      {/* 操作バー */}
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.textMid }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          アーカイブも表示
        </label>
        <Button variant="outline" size="sm" onClick={handleApplyAutoEstimate} disabled={loading || saving}>
          全件を自動推定値にリセット
        </Button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], alignItems: 'center' }}>
          <span style={{ fontSize: font.size.sm, color: color.textMid }}>
            {stats.changed > 0 ? `${stats.changed}件 変更あり` : '変更なし'}
          </span>
          <Button variant="primary" onClick={handleSave} disabled={loading || saving || stats.changed === 0} loading={saving}>
            保存
          </Button>
        </div>
      </div>

      {/* テーブル */}
      <DataTable
        columns={columns}
        rows={filteredRows}
        rowKey="id"
        loading={loading}
        emptyMessage="該当するリストがありません"
        height="calc(100vh - 420px)"
        rowAccent={r => (r._initial_engagement_id !== r._selected_engagement_id ? 'warn' : null)}
      />
    </div>
  );
}

function StatCell({ label, value, active, accent, onClick }) {
  const accentColor = accent === 'warn' ? color.warn : color.navy;
  return (
    <button
      onClick={onClick}
      style={{
        flex: '1 1 140px',
        padding: `${space[3]}px ${space[4]}px`,
        background: active ? alpha(accentColor, 0.08) : color.white,
        border: `1px solid ${active ? accentColor : color.border}`,
        borderRadius: radius.md,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: accentColor, fontFamily: font.family.mono }}>
        {value.toLocaleString()}
      </div>
    </button>
  );
}
