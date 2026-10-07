import { useEffect, useMemo, useState } from 'react';
import './DirectoryInsights.css';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { Button, Input } from '../ui';
import { color } from '../../constants/design';
import { searchCompanyDirectory } from '../../lib/companyDirectoryApi';
import { insertCallListItems, autoExcludeKnownExcluded } from '../../lib/supabaseWrite';
import { narrowingSteps, stepWidth } from '../../utils/directoryNarrowing';

// 企業DB の見本（2026-10-07 むー様確認）：都道府県の地図・段で減る件数・選んだ会社を架電リストに入れる

// 地図の置き場（列, 行）。北海道は右上、沖縄は左下
const PF = { 北海道: [12, 0], 青森県: [12, 2], 秋田県: [11, 3], 岩手県: [12, 3], 山形県: [11, 4], 宮城県: [12, 4], 石川県: [7, 4], 富山県: [8, 4], 新潟県: [9, 4],
  福井県: [7, 5], 岐阜県: [8, 5], 長野県: [9, 5], 群馬県: [10, 5], 栃木県: [11, 5], 福島県: [12, 5], 島根県: [2, 6], 鳥取県: [3, 6], 兵庫県: [5, 6], 京都府: [6, 6],
  滋賀県: [7, 6], 愛知県: [8, 6], 山梨県: [9, 6], 埼玉県: [10, 6], 茨城県: [11, 6], 山口県: [1, 7], 広島県: [2, 7], 岡山県: [3, 7], 大阪府: [5, 7], 奈良県: [6, 7],
  三重県: [7, 7], 静岡県: [8, 7], 東京都: [9, 7], 千葉県: [10, 7], 福岡県: [1, 8], 佐賀県: [0, 8], 愛媛県: [3, 8], 香川県: [4, 8], 和歌山県: [6, 8], 神奈川県: [9, 8],
  長崎県: [0, 9], 熊本県: [1, 9], 大分県: [2, 9], 高知県: [3, 9], 徳島県: [4, 9], 宮崎県: [2, 10], 鹿児島県: [1, 10], 沖縄県: [0, 11] };
const SHORT = { 鹿児島県: '鹿児島', 和歌山県: '和歌山', 神奈川県: '神奈川' };
const CACHE = 'spanavi.companyDb.prefCounts.v1';

function heat(n, max) {
  const t = Math.min(1, Math.max(0, Math.log(Math.max(n, 1) / 1500) / Math.log(max / 1500)));
  const a = [220, 234, 248], b = [1, 118, 211], c = [3, 45, 96];
  const [p, q, u] = t < 0.6 ? [a, b, t / 0.6] : [b, c, (t - 0.6) / 0.4];
  return `rgb(${p.map((x, i) => Math.round(x + (q[i] - x) * u)).join(',')})`;
}

/** 都道府県の地図。押すとその県を条件に足して検索する */
export function PrefectureMap({ selected = [], onPick }) {
  const [counts, setCounts] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c && Date.now() - c.at < 86400000) return c.data; } catch { /* 読めなければ取り直す */ }
    return null;
  });
  useEffect(() => {
    if (counts) return undefined;
    let alive = true;
    supabase.rpc('company_directory_prefecture_counts').then(({ data }) => {
      if (!alive || !data) return;
      const m = Object.fromEntries(data.map(r => [r.prefecture, Number(r.companies)]));
      setCounts(m);
      try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), data: m })); } catch { /* 残せなくても出す */ }
    });
    return () => { alive = false; };
  }, [counts]);
  const max = counts ? Math.max(...Object.values(counts)) : 1;
  const top = counts ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0] : null;
  const cells = [];
  for (let y = 0; y < 12; y++) for (let x = 0; x < 13; x++) {
    const hit = Object.entries(PF).find(([, v]) => v[0] === x && v[1] === y);
    if (!hit) { cells.push(<span key={`${x}-${y}`} />); continue; }
    const [name] = hit; const n = counts?.[name] || 0; const on = selected.includes(name);
    cells.push(
      <button key={name} type="button" className={`di-pf${on ? ' is-on' : ''}`} title={`${name} ${n.toLocaleString()}社`}
        style={{ background: counts ? heat(n, max) : '#EEF0F3', color: n > 9000 ? '#fff' : '#032D60', animationDelay: `${(x + y) * 15}ms` }}
        onClick={() => onPick(name)}>{SHORT[name] || name.replace(/[都府県]$/, '')}</button>,
    );
  }
  return (
    <div className="di-card di-map">
      <h4><span>都道府県 ・ 押すと条件に足す</span><span>{selected.join('・')}</span></h4>
      <div className="di-jp">{cells}</div>
      <div className="di-legend"><span>少ない</span><i /><span>{top ? `多い（${top[0].replace(/[都府県]$/, '')} ${top[1].toLocaleString()}）` : '多い'}</span></div>
    </div>
  );
}

/** 条件を足すごとに何社まで減ったか。適用した条件から、後ろを1つずつ外した件数を数える */
export function NarrowingBars({ applied, chipsOf, finalCount }) {
  const steps = useMemo(() => (applied ? narrowingSteps(applied, chipsOf) : null), [applied, chipsOf]);
  const [counts, setCounts] = useState({});
  const key = applied ? JSON.stringify({ ...applied, page: 0, sortCol: '', sortDir: '' }) : '';
  useEffect(() => {
    setCounts({});
    if (!steps) return undefined;
    const controller = new AbortController();
    (async () => {
      for (let i = 0; i < steps.length - 1; i++) {
        try {
          const r = await searchCompanyDirectory({ ...steps[i].filters, page: 0, pageSize: 1 }, controller.signal, true);
          if (controller.signal.aborted) return;
          setCounts(prev => ({ ...prev, [i]: r.count }));
        } catch { return; }
      }
    })();
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!steps) return null;
  const total = counts[0];
  return (
    <div className="di-steps">
      {steps.map((s, i) => {
        const n = i === steps.length - 1 ? finalCount : counts[i];
        return (
          <div key={i} className={`di-st${i === steps.length - 1 ? ' last' : ''}`}>
            <span className="di-l" title={s.label}>{s.label}</span>
            <span className="di-bar"><i style={{ width: n != null && total ? `${stepWidth(n, total)}%` : '0%' }} /></span>
            <span className="di-v">{n != null ? `${n.toLocaleString()}社` : '…'}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 選んだ会社を、稼働中の架電リストの末尾に足す（同じ会社が他リストで除外済みなら自動で除外） */
export function AddToCallListModal({ rows, onClose, onDone }) {
  const [lists, setLists] = useState([]);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    supabase.from('call_lists').select('id, name, status, is_archived, total_count').eq('org_id', getOrgId()).eq('is_archived', false).order('name').limit(1000)
      .then(({ data }) => setLists(data || []));
  }, []);
  const shown = lists.filter(l => !q || (l.name || '').includes(q)).slice(0, 80);
  const add = async () => {
    if (!pick) return;
    setBusy(true); setMsg(null);
    const items = rows.map(r => ({
      company: r.company_name, phone: r.phone || '', address: r.address || [r.prefecture, r.city].filter(Boolean).join(''),
      representative: r.representative || '', business: r.business_description || r.industry_sub || r.industry || '',
      revenue: r.revenue_k ?? null, net_income: r.net_income_k ?? null, employees: r.employee_count ?? null, corporate_number: r.corporate_number || null,
    }));
    const { error, insertedCount, startNo, endNo } = await insertCallListItems(pick.id, items);
    if (error) { setBusy(false); setMsg({ ok: false, text: '入れられませんでした：' + (error.message || '不明なエラー') }); return; }
    const { count } = await autoExcludeKnownExcluded(pick.id);
    setBusy(false);
    setMsg({ ok: true, text: `「${pick.name}」の No.${startNo}〜${endNo} に ${insertedCount}社を入れました${count ? `（うち${count}社は他リストで除外済みのため除外）` : ''}` });
    onDone?.();
  };
  return (
    <div className="di-veil" onClick={onClose}>
      <div className="di-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="架電リストに入れる">
        <div className="di-mh"><b>選んだ {rows.length}社を架電リストに入れる</b><span>リストの末尾に足します。新しいリストは架電リストのページで作ってから選んでください</span></div>
        <div style={{ padding: '12px 16px' }}>
          <Input size="sm" value={q} onChange={e => setQ(e.target.value)} placeholder="リスト名で探す" />
          <div className="di-lists">
            {shown.map(l => (
              <button key={l.id} type="button" className={`di-li${pick?.id === l.id ? ' is-on' : ''}`} onClick={() => setPick(l)}>
                <span>{l.name}</span><span className="di-sub">{l.status}{l.total_count ? ` ・ ${Number(l.total_count).toLocaleString()}社` : ''}</span>
              </button>
            ))}
            {shown.length === 0 && <div className="di-sub" style={{ padding: 12 }}>該当するリストがありません</div>}
          </div>
          {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? color.success : color.danger }}>{msg.text}</div>}
        </div>
        <div className="di-mf">
          <Button variant="outline" size="sm" onClick={onClose}>{msg?.ok ? '閉じる' : 'やめる'}</Button>
          {!msg?.ok && <Button variant="primary" size="sm" loading={busy} disabled={!pick || busy} onClick={add}>このリストに入れる</Button>}
        </div>
      </div>
    </div>
  );
}

