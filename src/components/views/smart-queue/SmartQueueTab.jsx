import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { useEngagements } from '../../../hooks/useEngagements';

// スマートキュー：リスト跨ぎでベテランが効率的に拾うためのキュー
// サブタブA：期限超過再コール（受付/キーマン）横断

function fmtRecallAt(date, time) {
  if (!date) return '—';
  const t = (time || '00:00').slice(0, 5);
  const d = date.slice(5).replace('-', '/');
  return `${d} ${t}`;
}

function fmtOverdue(days) {
  if (days == null) return '—';
  if (days < 1) return `${Math.round(days * 24)}時間`;
  return `${Math.floor(days)}日`;
}

const STATUS_BADGE = {
  '受付再コール':   { variant: 'info',   label: '受付' },
  'キーマン再コール': { variant: 'warn',   label: 'キーマン' },
};

export default function SmartQueueTab({ setCallFlowScreen }) {
  const { engagements: allEngagements } = useEngagements();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [filterEng,    setFilterEng]    = useState('all'); // engagement_id | 'all'
  const [filterStatus, setFilterStatus] = useState('all'); // '受付再コール' | 'キーマン再コール' | 'all'
  const [sortKey,      setSortKey]      = useState('overdue_desc'); // overdue_desc | overdue_asc | recent

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // PostgREST は default 引数の override に弱い場合があるので明示的に null を渡す
    supabase.rpc('smart_queue_overdue_recalls', {
      p_engagement_id: null,
      p_status: null,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[SmartQueueTab] RPC failed:', error);
        setRows([]);
      } else {
        if (!Array.isArray(data) || data.length === 0) {
          console.log('[SmartQueueTab] RPC returned empty:', data);
        }
        setRows(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const salesAgencyEngagements = useMemo(() => {
    const order = ['seller_sourcing', 'matching', 'client_acquisition'];
    const label = { seller_sourcing: '売り手ソーシング', matching: '買い手マッチング', client_acquisition: 'クライアント開拓' };
    return (allEngagements || [])
      .filter(e => order.includes(e.slug))
      .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug))
      .map(e => ({ id: e.id, slug: e.slug, name: label[e.slug] || e.name }));
  }, [allEngagements]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filterEng !== 'all') list = list.filter(r => r.engagement_id === filterEng);
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus);
    if (sortKey === 'overdue_desc') list = [...list].sort((a, b) => (b.overdue_days || 0) - (a.overdue_days || 0));
    else if (sortKey === 'overdue_asc') list = [...list].sort((a, b) => (a.overdue_days || 0) - (b.overdue_days || 0));
    else if (sortKey === 'recent') list = [...list].sort((a, b) => new Date(b.called_at || 0) - new Date(a.called_at || 0));
    return list;
  }, [rows, filterEng, filterStatus, sortKey]);

  const handleCall = (row) => {
    if (!setCallFlowScreen || !row.list_id || !row.item_id) return;
    setCallFlowScreen({ listId: row.list_id, itemId: row.item_id });
  };

  const columns = [
    {
      key: 'status', label: '区分', width: 96, align: 'center',
      render: (row) => {
        const conf = STATUS_BADGE[row.status] || { variant: 'default', label: row.status };
        return <Badge variant={conf.variant} dot>{conf.label}</Badge>;
      },
    },
    { key: 'company', label: '企業名', width: 240, align: 'left',
      render: (row) => (
        <div>
          <div style={{ fontWeight: font.weight.semibold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.company || '—'}
          </div>
          {row.industry && (
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 1 }}>
              {row.industry}{row.prefecture ? ` ・ ${row.prefecture}` : ''}
            </div>
          )}
        </div>
      ),
    },
    { key: 'engagement', label: 'タイプ', width: 130, align: 'center',
      render: (row) => (
        <span style={{ fontSize: font.size.xs, color: color.textMid }}>
          {row.engagement_name || '—'}
        </span>
      ),
    },
    { key: 'list_name', label: '元リスト', width: 220, align: 'left',
      render: (row) => (
        <span style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {row.list_name || '—'}
        </span>
      ),
    },
    { key: 'recall_at', label: '再コール予定', width: 130, align: 'right',
      render: (row) => (
        <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textDark }}>
          {fmtRecallAt(row.recall_date, row.recall_time)}
        </span>
      ),
    },
    { key: 'overdue', label: '超過', width: 80, align: 'right',
      render: (row) => (
        <span style={{
          fontFamily: font.family.mono, fontSize: font.size.xs, fontWeight: font.weight.bold,
          color: (row.overdue_days || 0) >= 3 ? color.danger : color.warn,
        }}>
          {fmtOverdue(row.overdue_days)}
        </span>
      ),
    },
    { key: 'assignee', label: '担当', width: 80, align: 'center',
      render: (row) => (
        <span style={{ fontSize: font.size.xs, color: color.textMid }}>
          {row.assignee || row.getter_name || '—'}
        </span>
      ),
    },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (row) => (
        <Button size="sm" variant="primary" onClick={() => handleCall(row)}
          disabled={!setCallFlowScreen || !row.list_id || !row.item_id}>架電</Button>
      ),
    },
  ];

  const totalCount = rows.length;
  const filteredCount = filtered.length;

  return (
    <div>
      {/* サブタブ説明 + KPI */}
      <div style={{
        padding: '14px 18px', background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`, marginBottom: space[3],
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space[2] }}>
          <div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>
              期限超過再コール（リスト跨ぎ横断）
            </div>
            <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>
              受付再コール / キーマン再コールの予定日時を超過した案件。アクティブリストのみ。
            </div>
          </div>
          <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
            <KPI label="表示中" value={`${filteredCount} 件`} />
            <KPI label="全期限超過" value={`${totalCount} 件`} muted />
          </div>
        </div>
      </div>

      {/* フィルタ */}
      <div style={{
        display: 'flex', gap: space[2.5], marginBottom: space[3], flexWrap: 'wrap', alignItems: 'center',
        padding: '12px 16px', background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`,
      }}>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>区分:</span>
        {[['all', '全て'], ['受付再コール', '受付'], ['キーマン再コール', 'キーマン']].map(([v, lbl]) => (
          <FilterButton key={v} active={filterStatus === v} onClick={() => setFilterStatus(v)}>{lbl}</FilterButton>
        ))}
        <span style={{ color: color.border, fontSize: font.size.md }}>|</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>タイプ:</span>
        <FilterButton active={filterEng === 'all'} onClick={() => setFilterEng('all')}>全て</FilterButton>
        {salesAgencyEngagements.map(e => (
          <FilterButton key={e.id} active={filterEng === e.id} onClick={() => setFilterEng(e.id)}>{e.name}</FilterButton>
        ))}
        <span style={{ color: color.border, fontSize: font.size.md }}>|</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>並び順:</span>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{
          padding: '5px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`,
          fontSize: font.size.xs, color: color.textDark, fontFamily: font.family.sans, background: color.white, cursor: 'pointer',
        }}>
          <option value="overdue_desc">超過日数が多い順</option>
          <option value="overdue_asc">超過日数が少ない順</option>
          <option value="recent">最終架電が新しい順</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey="record_id"
        loading={loading}
        emptyMessage="期限超過の再コール案件はありません。"
        height="calc(100vh - 320px)"
        fillWidth
      />
    </div>
  );
}

function KPI({ label, value, muted = false }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.semibold, letterSpacing: 0.4 }}>{label}</div>
      <div style={{
        fontSize: font.size.lg, fontWeight: font.weight.bold,
        color: muted ? color.textLight : color.navy,
        fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
      }}>{value}</div>
    </div>
  );
}

function FilterButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: radius.md, fontSize: font.size.xs, fontWeight: font.weight.semibold,
      cursor: 'pointer', transition: 'all 0.12s', fontFamily: font.family.sans,
      ...(active
        ? { background: color.navy, color: color.white, border: `1px solid ${color.navy}` }
        : { background: color.white, color: color.textMid, border: `1px solid ${color.border}` }),
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = color.gray50; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = color.white; }}
    >{children}</button>
  );
}
