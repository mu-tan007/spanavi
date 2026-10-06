import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { color, space, radius, font } from '../../../constants/design';
import { DataTable, Input, Badge } from '../../ui';

// ============================================================
// 顧客管理 > 開拓（2026-10-06）
// まだアポを取ったことがない潜在顧客を一覧で出す。元はデータベースの crm_prospects()：
//   ・自社の営業リスト（M&A 687社・金融商品仲介業者 637社）
//   ・買収タブでつながっている仲介会社（顧客管理に入っていない会社）
// 顧客管理に入っている会社と、アポ獲得済みの行は出さない。
// 「合うサービス」と「次の打ち手」は、区分と接点から決める（むー様と決めた9通りのサービスの範囲で）。
// ============================================================

// 接点の段階（上ほど次に動く価値が高い）
const STAGES = ['資料・HPを見た', '買収でつながり', '資料を送った', '架電のみ', '未接触', '断られた', '除外'];
const STAGE_VARIANT = { '資料・HPを見た': 'success', '買収でつながり': 'primary', '資料を送った': 'info', '架電のみ': 'neutral', '未接触': 'neutral', '断られた': 'warn', '除外': 'default' };
const NEXT = {
  '資料・HPを見た': '架電で面談を打診（見てくれた今が一番温かい）',
  '買収でつながり': 'むー様から「売り手企業の開拓をやらせてください」と打診',
  '資料を送った': '架電で資料の感想を伺い、面談を打診',
  '架電のみ': '資料をフォームかメールで送り、閲覧を計測',
  '未接触': 'フォームで資料を送る',
  '断られた': '時期を空け、別のサービス（買い手開拓・DM）で再提案',
  '除外': '—',
};
function servicesFor(kind) {
  if (kind === 'IFA') return 'IFA向けアポ（今の営業先のみ）';
  if (kind === '買い手FA') return '売り手開拓（テレアポ・DM・フォーム）';
  return '売り手開拓・買い手開拓（テレアポ・DM・フォーム）';
}

export default function CRMProspectsView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('all');
  const [kind, setKind] = useState('all');
  const [stage, setStage] = useState('active');   // active＝除外以外
  const [q, setQ] = useState('');

  useEffect(() => {
    supabase.rpc('crm_prospects').then(({ data, error: e }) => {
      if (e) setError(e.message);
      setRows((data || []).map(r => ({ ...r, services: servicesFor(r.kind), next: NEXT[r.contact_stage] || '' })));
      setLoading(false);
    });
  }, []);

  const bySource = useMemo(() => count(rows, 'source'), [rows]);
  const pool1 = rows.filter(r => source === 'all' || r.source === source);
  const byKind = count(pool1, 'kind');
  const pool2 = pool1.filter(r => kind === 'all' || r.kind === kind);
  const byStage = count(pool2, 'contact_stage');
  const shown = pool2
    .filter(r => stage === 'all' || (stage === 'active' ? r.contact_stage !== '除外' : r.contact_stage === stage))
    .filter(r => !q.trim() || (r.company || '').includes(q.trim()) || (r.prefecture || '').includes(q.trim()))
    .sort((a, b) => STAGES.indexOf(a.contact_stage) - STAGES.indexOf(b.contact_stage));

  const chip = (active) => ({
    padding: '4px 12px', borderRadius: radius.sm, fontSize: 11, fontWeight: font.weight.semibold, cursor: 'pointer',
    fontFamily: font.family.sans, border: '1px solid ' + (active ? color.navy : color.border),
    background: active ? color.navy : color.white, color: active ? color.white : color.textMid,
  });
  const row = { display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' };
  const label = (t) => <span style={{ fontSize: 11, color: color.textLight, fontWeight: font.weight.semibold, minWidth: 48 }}>{t}</span>;

  const columns = [
    { key: 'contact_stage', label: '接点', width: 120, align: 'center', sortable: true, sortType: 'string',
      sortValue: r => STAGES.indexOf(r.contact_stage),
      render: r => <Badge variant={STAGE_VARIANT[r.contact_stage] || 'neutral'}>{r.contact_stage}</Badge> },
    { key: 'company', label: '企業名', width: 240, align: 'left', sortable: true, sortType: 'string', sticky: true,
      render: r => r.url
        ? <a href={r.url.startsWith('http') ? r.url : 'https://' + r.url} target="_blank" rel="noreferrer" style={{ color: color.navy, fontWeight: font.weight.semibold }}>{r.company}</a>
        : <span style={{ color: color.navy, fontWeight: font.weight.semibold }}>{r.company}</span> },
    { key: 'kind', label: '区分', width: 100, align: 'center', sortable: true, sortType: 'string' },
    { key: 'prefecture', label: '所在地', width: 80, align: 'left', sortable: true, sortType: 'string' },
    { key: 'source', label: '出どころ', width: 120, align: 'left', sortable: true, sortType: 'string' },
    { key: 'call_count', label: '架電', width: 60, align: 'right', sortable: true,
      render: r => r.call_count ? `${r.call_count}回` : '—' },
    { key: 'call_status', label: '架電の結果', width: 110, align: 'left', render: r => r.call_status || '—' },
    { key: 'sent_channels', label: '資料送付', width: 110, align: 'left',
      render: r => r.sent_channels ? `${chName(r.sent_channels)}${r.viewed ? '・閲覧あり' : ''}${r.site_visited ? '・HP訪問' : ''}` : '—' },
    { key: 'services', label: '合うサービス', width: 260, align: 'left' },
    { key: 'next', label: '次の打ち手', width: 300, align: 'left' },
  ];

  return (
    <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg, padding: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[3], marginBottom: space[3], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>潜在顧客</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid }}>まだアポを取ったことがない会社（顧客管理に入っている会社は出しません）</span>
        <span style={{ flex: 1 }} />
        <div style={{ width: 240 }}><Input size="sm" placeholder="企業名・都道府県で探す" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      <div style={row}>
        {label('出どころ')}
        <button type="button" style={chip(source === 'all')} onClick={() => { setSource('all'); setKind('all'); }}>全て {rows.length}</button>
        {Object.entries(bySource).map(([k, n]) => <button key={k} type="button" style={chip(source === k)} onClick={() => { setSource(k); setKind('all'); }}>{k} {n}</button>)}
      </div>
      <div style={row}>
        {label('区分')}
        <button type="button" style={chip(kind === 'all')} onClick={() => setKind('all')}>全て {pool1.length}</button>
        {Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => <button key={k} type="button" style={chip(kind === k)} onClick={() => setKind(k)}>{k} {n}</button>)}
      </div>
      <div style={row}>
        {label('接点')}
        <button type="button" style={chip(stage === 'active')} onClick={() => setStage('active')}>除外以外 {pool2.length - (byStage['除外'] || 0)}</button>
        {STAGES.filter(s => byStage[s]).map(s => <button key={s} type="button" style={chip(stage === s)} onClick={() => setStage(s)}>{s} {byStage[s]}</button>)}
      </div>
      <DataTable
        columns={columns}
        rows={shown}
        rowKey="key"
        loading={loading}
        error={error}
        emptyMessage="該当する会社がありません"
        height="calc(100vh - 340px)"
        rowAccent={r => r.contact_stage === '資料・HPを見た' ? 'success' : r.contact_stage === '買収でつながり' ? 'primary' : null}
      />
    </div>
  );
}

function count(list, key) {
  return list.reduce((m, r) => { const k = r[key] || '不明'; m[k] = (m[k] || 0) + 1; return m; }, {});
}
function chName(ch) {
  return ch.split('・').map(c => ({ form: 'フォーム', email: 'メール', sns: 'DM' }[c] || c)).join('・');
}
