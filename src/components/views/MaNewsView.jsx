import { useEffect, useMemo, useState } from 'react';
import './maNews/MaNews.css';
import PageHeader from '../common/PageHeader';
import { Button, Input, Pager } from '../ui';
import { color, font, alpha } from '../../constants/design';
import { fetchMaNewsFeed, fetchMaNewsSummary } from '../../lib/phalanxNews';
import { MA_KINDS, matchesListIndustries } from '../../utils/maNewsIndustry';

// M&Aニュース（ライブラリーの下・2026-10-07 むー様確認の見本どおり）
// 東証の適時開示を Phalanx が毎日 8:15 と 19:15 に取り込み、AIが要旨と当事者を読んだもの。Spanavi は読むだけ。
const PAGE = 50;
const dt = (iso) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }),
    time: d.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }),
  };
};

export default function MaNewsView({ callListData = [] }) {
  const [summary, setSummary] = useState([]);
  const [kind, setKind] = useState(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(0);
  const [same, setSame] = useState(false);
  const [feed, setFeed] = useState({ rows: [], total: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  // 架電中（アーカイブしていない）のリストの業種
  const listIndustries = useMemo(
    () => [...new Set((callListData || []).filter(l => !l.is_archived && l.industry).map(l => l.industry))],
    [callListData],
  );

  useEffect(() => {
    const c = new AbortController();
    fetchMaNewsSummary(30, c.signal).then(setSummary).catch(() => {});
    return () => c.abort();
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true); setError('');
    // 同じ業種だけのときは、直近60日をまとめて読み、画面の側で絞る
    const req = same ? { days: 60, kind, q: query, limit: 200, offset: 0, sort } : { days: 60, kind, q: query, limit: PAGE, offset: page * PAGE, sort };
    fetchMaNewsFeed(req, c.signal)
      .then((d) => setFeed({ rows: d.rows || [], total: Number(d.total || 0) }))
      .catch((e) => { if (!c.signal.aborted) setError(e.message); })
      .finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [kind, query, sort, page, same]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const total30 = summary.reduce((t, r) => t + Number(r.n || 0), 0);
  const maxKind = Math.max(1, ...summary.map(r => Number(r.n || 0)));
  const rows = same ? feed.rows.filter(r => matchesListIndustries(r.jsic_name || r.target_industry, listIndustries)) : feed.rows;

  return (
    <div className="mn" style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader title="M&Aニュース" description="東証の適時開示から、買収・事業譲渡・資本参加・TOBなどを毎日 8:15 と 19:15 に取り込み、AIが要旨と当事者を読む" />

      <div className="mn-card mn-band">
        <div><span className="mn-lbl">直近30日</span><div className="mn-big mn-num">{total30.toLocaleString()}<small>件</small></div><span className="mn-lbl">形態を押すと絞り込み</span></div>
        <div className="mn-kinds">
          {Object.entries(MA_KINDS).map(([k, v], i) => {
            const r = summary.find(x => x.kind === k);
            const n = Number(r?.n || 0);
            return (
              <button key={k} type="button" className={`mn-kd${kind === k ? ' is-on' : ''}`} onClick={() => { setKind(kind === k ? null : k); setPage(0); }}>
                <span>{v.label}</span>
                <span className="mn-bar"><i style={{ width: `${(n / maxKind) * 100}%`, background: v.color, animationDelay: `${i * 0.05}s` }} /></span>
                <b className="mn-num">{n}</b>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mn-fb">
        <form onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPage(0); }} style={{ display: 'flex', gap: 8 }}>
          <Input size="sm" value={q} onChange={e => setQ(e.target.value)} placeholder="社名・キーワード" fullWidth={false} containerStyle={{ width: 240 }} />
          <Button size="sm" type="submit">探す</Button>
        </form>
        <button type="button" className={`mn-tog${same ? ' is-on' : ''}`} onClick={() => { setSame(v => !v); setPage(0); }} title={listIndustries.join('・')}>
          <i />架電中のリストと同じ業種だけ
        </button>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[['new', '新着順'], ['price', '金額順']].map(([k, l]) => (
            <Button key={k} size="sm" variant={sort === k ? 'primary' : 'ghost'} onClick={() => { setSort(k); setPage(0); }}>{l}</Button>
          ))}
        </div>
      </div>
      {same && <div className="mn-lbl" style={{ margin: '-4px 0 8px' }}>直近60日のうち、架電中のリスト（{listIndustries.length}業種）と業種の名前が近い開示 {rows.length}件</div>}

      <div className="mn-card mn-feed">
        {error && <div style={{ padding: 16, color: color.danger, fontSize: font.size.sm }}>{error}</div>}
        {loading && !rows.length && <div style={{ padding: 24, color: color.textLight, fontSize: font.size.sm }}>読み込み中…</div>}
        {!loading && !error && rows.length === 0 && <div style={{ padding: 24, color: color.textLight, fontSize: font.size.sm }}>当てはまる開示はありません</div>}
        {rows.map((r, i) => {
          const k = MA_KINDS[r.kind] || { label: r.kind };
          const t = dt(r.disclosed_at);
          return (
            <button key={r.id} type="button" className="mn-it" style={{ animationDelay: `${Math.min(i, 15) * 0.02}s` }} onClick={() => setOpen(r)}>
              <span className="mn-d"><b className="mn-num">{t.date}</b><span className="mn-num">{t.time}</span></span>
              <span className={`mn-kt k-${r.kind}`}>{k.label}</span>
              <span className="mn-main"><b>{r.title}</b>
                <span className="mn-par">{r.buyer || '—'}<span className="mn-ar">→</span>{r.target || '—'}{r.seller ? `（売り手 ${r.seller}）` : ''}</span></span>
              <span className="mn-ind">{(r.jsic_name || r.target_industry || '—').replace(/（.*?）/g, '')}<br />{r.company}</span>
            </button>
          );
        })}
      </div>
      {!same && feed.total > PAGE && <div style={{ marginTop: 12 }}><Pager page={page} pageSize={PAGE} total={feed.total} unit="件" onPage={setPage} disabled={loading} /></div>}

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.25), zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
          <div className="mn-drawer" onClick={e => e.stopPropagation()}>
            <div className="mn-dh">
              <span className="mn-lbl">{(MA_KINDS[open.kind] || {}).label} ・ {dt(open.disclosed_at).date} {dt(open.disclosed_at).time} ・ {open.company}</span>
              <h3>{open.title}</h3>
              <span className="mn-lbl">東証 適時開示</span>
            </div>
            <div className="mn-db">
              {open.summary && <div className="mn-sum">{open.summary}</div>}
              <div className="mn-parties"><div><span>買う側</span><b>{open.buyer || '—'}</b></div><em>→</em><div><span>対象</span><b>{open.target || '—'}</b></div></div>
              <div className="mn-box"><h4><span>くわしく</span><span>開示PDFをAIが読んだ値</span></h4>
                <dl>
                  <dt>売り手</dt><dd>{open.seller || '—'}</dd>
                  <dt>取得価額</dt><dd>{open.price_text || '—'}</dd>
                  <dt>取得後の比率</dt><dd>{open.stake_after_pct ? `${open.stake_after_pct}%` : '—'}</dd>
                  <dt>対象の売上</dt><dd>{open.revenue_text || '—'}</dd>
                  <dt>対象の業種</dt><dd>{open.jsic_name || open.target_industry || '—'}</dd>
                  <dt>対象の所在地</dt><dd>{open.target_location || '—'}</dd>
                </dl>
              </div>
              <div className="mn-box"><h4><span>営業での使い方</span></h4><div style={{ fontSize: 12.5, color: color.textMid, lineHeight: 1.8 }}>同じ業種の売り手に架電するときの話題に。「同業の会社が買収した」と具体的に言える</div></div>
            </div>
            <div className="mn-df">
              <Button variant="outline" size="sm" onClick={() => setOpen(null)}>閉じる</Button>
              {open.url && <Button variant="primary" size="sm" onClick={() => window.open(open.url, '_blank', 'noopener')}>開示PDFを開く</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
