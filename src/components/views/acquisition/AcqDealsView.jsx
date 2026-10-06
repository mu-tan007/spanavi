import React, { useMemo, useState } from 'react';
import { color, space, font } from '../../../constants/design';
import { Badge, Button, DataTable, Input, Select } from '../../ui';
import PageHeader from '../../common/PageHeader';
import {
  STAGES, STAGE_BY_VALUE, stageLabel, isOpenStage,
  priceRange, priceBasisLabel, schemeLabel, yen, fmtDate,
} from './acqConstants';
import { KeyFigure, ProgressDots } from './AcqShared';
import AcqDealFormModal from './AcqDealFormModal';

// 買収 > 案件：紹介を受けた全案件の一覧
const VIEW_OPTIONS = [
  { value: 'open', label: '進行中' },
  { value: 'all', label: 'すべて' },
  { value: 'closed', label: '終了' },
];

// 1行に収まらない文字は「…」で切り、押さなくても全文は title で見られるようにする（隣の列へはみ出さない）
const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
function Two({ top, sub, topStyle }) {
  const t = typeof top === 'string' ? top : undefined;
  return (
    <div style={{ lineHeight: 1.35, minWidth: 0 }} title={[t, sub].filter(Boolean).join(' / ') || undefined}>
      <div style={{ ...clip, ...topStyle }}>{top}</div>
      {sub && <div style={{ ...clip, fontSize: font.size.xs, color: color.textLight }}>{sub}</div>}
    </div>
  );
}

function DocMarks({ row }) {
  const items = [['NN', row.has_nonname], ['IM', row.has_im], ['QA', row.has_qa]];
  return (
    <span style={{ display: 'inline-flex', gap: space[1] }}>
      {items.map(([k, on]) => (
        <span key={k} style={{
          fontSize: font.size.xs, fontFamily: font.family.mono, padding: '0 4px',
          color: on ? color.navy : color.textLight, fontWeight: on ? font.weight.semibold : font.weight.normal,
          border: `1px solid ${on ? color.navy : color.borderLight}`, borderRadius: 3,
        }}>{k}</span>
      ))}
    </span>
  );
}

export default function AcqDealsView({ data, onOpenDeal }) {
  const { deals, firms, contacts, loading, error, reload } = data;
  const [view, setView] = useState('open');
  const [stageFilter, setStageFilter] = useState('');
  const [q, setQ] = useState('');
  const [firmFilter, setFirmFilter] = useState('');
  const [creating, setCreating] = useState(false);

  const stats = useMemo(() => ({
    total: deals.length,
    open: deals.filter(d => isOpenStage(d.current_stage)).length,
    top: deals.filter(d => d.reached_top_meeting).length,
  }), [deals]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return deals.filter(d => {
      const st = d.current_stage;
      // 段階を選んだときは、進行中・終了の切り替えより段階を優先する
      if (!stageFilter && view === 'open' && !isOpenStage(st)) return false;
      if (!stageFilter && view === 'closed' && isOpenStage(st)) return false;
      if (stageFilter && st !== stageFilter) return false;
      if (firmFilter && d.source_firm_id !== firmFilter) return false;
      if (kw) {
        const hay = [d.name, d.project_name, d.pj_code, d.industry, d.region, d.source_firm_name, d.source_contact_name, d.summary]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [deals, view, stageFilter, q, firmFilter]);

  const columns = [
    { key: 'display_name', label: '案件名', width: 240, align: 'left', sortable: true,
      render: (r) => (
        <Two
          top={r.im_disclosed ? (r.name || '企業名が未入力') : r.project_name}
          topStyle={{ fontWeight: font.weight.semibold, color: r.im_disclosed && !r.name ? color.danger : color.navy }}
          sub={[r.im_disclosed ? r.project_name : 'ノンネーム', r.pj_code].filter(Boolean).join('・')}
        />
      ) },
    { key: 'industry', label: '業種・地域', width: 180, align: 'left',
      render: (r) => <Two top={r.industry || '—'} sub={r.region} /> },
    { key: 'source_firm_name', label: '紹介元', width: 190, align: 'left', sortable: true,
      render: (r) => <Two top={r.source_firm_name || '—'} sub={r.source_contact_name ? `${r.source_contact_name}様` : null} /> },
    { key: 'received_on', label: '受領日', width: 96, align: 'right', sortable: true,
      cellStyle: { fontFamily: font.family.mono }, render: (r) => fmtDate(r.received_on) },
    { key: 'current_stage', label: '段階', width: 170, align: 'left', sortable: true, sortType: 'number',
      // 並びは「どこまで進んだか」。同じ段なら進行中を先に
      sortValue: (r) => (r.progress_rank || 0) * 10 + (r.is_closed ? 0 : 1),
      render: (r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
            <Badge variant={STAGE_BY_VALUE[r.current_stage]?.variant || 'default'} dot>{stageLabel(r.current_stage)}</Badge>
            {r.is_closed && r.progress_stage && (
              <span style={{ fontSize: font.size.xs, color: color.textMid }}>{stageLabel(r.progress_stage)}で</span>
            )}
          </div>
          <div style={{ marginTop: 3 }}>
            <ProgressDots progressStage={r.progress_stage} closedStage={r.is_closed ? r.current_stage : null} compact />
          </div>
        </div>
      ) },
    { key: 'revenue', label: '売上', width: 90, align: 'right', sortable: true, sortType: 'number',
      cellStyle: { fontFamily: font.family.mono }, render: (r) => yen(r.revenue) },
    { key: 'ebitda', label: '修正EBITDA', width: 130, align: 'right', sortable: true, sortType: 'number',
      sortValue: (r) => r.ebitda_ours ?? r.ebitda_im,
      cellStyle: { fontFamily: font.family.mono },
      render: (r) => (
        <div style={{ lineHeight: 1.35 }}>
          <div>{yen(r.ebitda_ours ?? r.ebitda_im)}</div>
          {r.ebitda_ours != null && r.ebitda_im != null && Number(r.ebitda_ours) !== Number(r.ebitda_im) && (
            <div style={{ fontSize: font.size.xs, color: color.textLight }}>IM {yen(r.ebitda_im)}</div>
          )}
        </div>
      ) },
    { key: 'asking', label: '希望価格', width: 140, align: 'right', sortable: true, sortType: 'number',
      sortValue: (r) => r.asking_price_min ?? r.asking_price_max,
      cellStyle: { fontFamily: font.family.mono },
      render: (r) => (
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontWeight: font.weight.semibold, color: color.navy }}>{priceRange(r.asking_price_min, r.asking_price_max)}</div>
          {(r.asking_price_min != null || r.asking_price_max != null) && (
            <div style={{ fontSize: font.size.xs, color: color.textLight }}>{priceBasisLabel(r.asking_price_basis)}</div>
          )}
          {r.asking_price_min == null && r.asking_price_max == null && r.asking_price_text && (
            <div style={{ fontSize: font.size.xs, color: color.textMid }}>{r.asking_price_text}</div>
          )}
        </div>
      ) },
    { key: 'multiple', label: '倍率', width: 70, align: 'right', sortable: true, sortType: 'number',
      cellStyle: { fontFamily: font.family.mono }, render: (r) => (r.multiple != null ? `${r.multiple}倍` : '—') },
    { key: 'net_cash', label: 'ネットキャッシュ', width: 110, align: 'right', sortable: true, sortType: 'number',
      cellStyle: { fontFamily: font.family.mono }, render: (r) => yen(r.net_cash) },
    { key: 'scheme', label: 'スキーム', width: 84, align: 'center', render: (r) => schemeLabel(r.scheme) },
    { key: 'next_deadline_on', label: '次の期限', width: 120, align: 'right', sortable: true,
      render: (r) => (r.next_deadline_on
        ? <div style={{ lineHeight: 1.35 }}><div style={{ fontFamily: font.family.mono }}>{fmtDate(r.next_deadline_on)}</div>{r.next_deadline_label && <div style={{ fontSize: font.size.xs, color: color.textLight }}>{r.next_deadline_label}</div>}</div>
        : '—') },
    { key: 'docs', label: '書類', width: 120, align: 'center', render: (r) => <DocMarks row={r} /> },
    { key: 'closed_reason', label: '結果・理由', width: 240, align: 'left',
      render: (r) => <div title={r.closed_reason || undefined} style={{ ...clip, fontSize: font.size.xs, color: color.textMid }}>{r.closed_reason || ''}</div> },
  ];

  const firmOptions = [{ value: '', label: 'すべての紹介元' }, ...firms.map(f => ({ value: f.id, label: f.name }))];

  return (
    <div>
      <PageHeader
        title="案件"
        description="仲介会社・FAから紹介を受けた売却案件。行を押すと詳細が開きます"
        right={<Button variant="primary" onClick={() => setCreating(true)}>案件を追加</Button>}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[3], marginBottom: space[4] }}>
        <KeyFigure label="紹介を受けた案件" value={`${stats.total}件`} />
        <KeyFigure label="進行中" value={`${stats.open}件`} />
        <KeyFigure label="トップ面談まで進んだ案件" value={`${stats.top}件`} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], marginBottom: space[3], alignItems: 'flex-end' }}>
        <div style={{ width: 200 }}><Select size="sm" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
          options={[{ value: '', label: 'すべての段階' }, ...STAGES.map(s2 => ({ value: s2.value, label: s2.label }))]} /></div>
        <div style={{ width: 220 }}><Select size="sm" value={view} onChange={(e) => setView(e.target.value)} options={VIEW_OPTIONS} /></div>
        <div style={{ width: 240 }}><Select size="sm" value={firmFilter} onChange={(e) => setFirmFilter(e.target.value)} options={firmOptions} /></div>
        <div style={{ width: 260 }}><Input size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="案件名・業種・紹介元で探す" /></div>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey="id"
        loading={loading}
        error={error}
        emptyMessage="該当する案件がありません"
        onRowClick={(r) => onOpenDeal(r.id)}
        rowAccent={(r) => (!r.is_closed && (r.progress_rank || 0) >= 4 ? 'primary' : null)}
        defaultSort={{ key: 'received_on', dir: 'desc' }}
        height="calc(100vh - 330px)"
      />
      {creating && (
        <AcqDealFormModal
          firms={firms}
          contacts={contacts}
          onClose={() => setCreating(false)}
          onSaved={async (id) => { setCreating(false); await reload(); if (id) onOpenDeal(id); }}
        />
      )}
    </div>
  );
}
