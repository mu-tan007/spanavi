import { useMemo, useState } from 'react';
import ScriptV2, { IND_NOUN, IND_RECEPTION } from '../callflow/ScriptV2';
import ScriptEditor from './ScriptEditor';
import ScriptBody from '../../common/ScriptBody';
import './CallListHome.css';
import '../callflow/CallPage.css';
import './ScriptsPage.css';

// スクリプトのページ（2026-10-09 むー様：架電リストと同じ部品・言葉づかいで）
// 台本を見る：左でリストを選ぶと、架電ページに出る台本がそのまま組み上がる。右に、このリストだけの言葉と注意事項
// 業種の一覧：業種ごとの「〇〇会社様」と受付の一文 ／ 編集：今までの編集画面（管理者だけ）
function parseCautions(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^[①-⑳]/.test(t)) out.push({ dt: t, dd: [] });
    else if (out.length) out[out.length - 1].dd.push(t);
    else out.push({ dt: '', dd: [t] });
  }
  return out;
}

// script_v2 の項目のうち、画面で「このリストだけの言葉」として見せるもの
const SPEC_LABEL = [
  ['client', '名乗る社名'], ['boss', '面談する上長'], ['honorific', '相手の呼び方'], ['house', '相手の会社の呼び方'], ['noun', '〇〇会社様'],
  ['mode', '面談の形'], ['mode_note', '面談の補足'], ['pitch', '用件の型'], ['buyer', '買い手の言い方'], ['pitch_text', '用件（このリストだけ）'],
  ['reception', '受付への一文'], ['reception_say', '受付で言うこと'], ['shimei', '指名'], ['support', '支援の中身'], ['closing_who', '当日うかがう人'], ['after', 'アポ後にやること'],
];
const MODE = { face: '対面', online: 'オンライン', both: '対面かオンライン' };
const PITCH = { base: '基本（買い手がいる）', nohint: '買い手を言わない', buyer: '具体的な買い手', custom: 'このリストだけの用件' };
const show = (k, v) => (k === 'mode' ? MODE[v] || v : k === 'pitch' ? PITCH[v] || v : v);

const readSaved = () => { try { return localStorage.getItem('spanavi_scripts_list') || ''; } catch { return ''; } };
const save = (id) => { try { localStorage.setItem('spanavi_scripts_list', id); } catch { /* 覚えられなくても選べる */ } };

export default function ScriptsPage({ isAdmin, clientData, callListData, setCallListData }) {
  const [view, setView] = useState('build');
  const lists = useMemo(() => (callListData || []).filter(l => !l.is_archived).sort((a, b) => (a.company + a.industry).localeCompare(b.company + b.industry, 'ja')), [callListData]);
  const [listId, setListIdRaw] = useState(readSaved);
  const setListId = (id) => { setListIdRaw(id); save(id); };
  const list = lists.find(l => l._supaId === listId) || lists[0];
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('');
  const g = grp || (list?.industryGroup && IND_NOUN[list.industryGroup] ? list.industryGroup : '建築工事');
  const sample = { representative: '〇〇 〇〇', address: '', industry_group: g };
  const cautions = parseCautions(list?.cautions);
  let rebuttal = null;
  try { rebuttal = list?.rebuttalData ? JSON.parse(list.rebuttalData) : null; } catch { /* 読めなければ共通のアウト返しだけ */ }
  // 台本を見ると編集は1つにまとめた（2026-10-10 むー様）。管理者は左で選んで中で直し、右で見え方を確かめる
  const views = [['build', '台本'], ['packs', '業種の一覧']];


  // クライアントごとにまとめる（検索はクライアント名・リスト名どちらでも）
  const byClient = useMemo(() => {
    const k = q.trim();
    const m = new Map();
    for (const l of lists) {
      if (k && !`${l.company}${l.industry}`.includes(k)) continue;
      if (!m.has(l.company)) m.set(l.company, []);
      m.get(l.company).push(l);
    }
    return [...m.entries()];
  }, [lists, q]);

  const spec = list?.scriptV2 || null;
  const own = spec ? SPEC_LABEL.filter(([k]) => spec[k] != null && spec[k] !== '' && typeof spec[k] !== 'object') : [];
  const extras = spec ? [...(spec.extra || []), ...(spec.after_extra || [])] : [];
  const ngs = spec?.ng || [];

  const picker = (
    <aside className="card picker">
      <div className="ph"><input className="input" placeholder="クライアント・リストで探す" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="pl">
        {byClient.map(([c, ls]) => (
          <div key={c} className="pg">
            <div className="pgh"><span>{c}</span><b className="n">{ls.length}</b></div>
            {ls.map(l => (
              <button key={l._supaId} className={`pr ${l._supaId === list?._supaId ? 'on' : ''}`} onClick={() => { setListId(l._supaId); setGrp(''); }}>
                <span className="ind">{l.industry || '—'}</span>
                <span className={`tag ${l.scriptV2 && !l.scriptV2.legacy ? 'blue' : 'gray'}`}>{l.scriptV2 && !l.scriptV2.legacy ? '基本台本' : '今までの台本'}</span>
              </button>
            ))}
          </div>
        ))}
        {!byClient.length && <div className="hint">見つかりません</div>}
      </div>
    </aside>
  );

  return (
    <div className="clh scp">
      <div className="pt">
        <div><h1>スクリプト</h1><p>どのリストも同じ基本台本に、業種ごと・クライアントごとの言葉を差し込んで出します</p></div>
        <div className="r">
          <div className="seg" style={{ position: 'relative' }}>
            {views.map(([k, t]) => <button key={k} className={view === k ? 'on' : ''} style={view === k ? { background: 'var(--navy)', color: '#fff' } : undefined} onClick={() => setView(k)}>{t}</button>)}
          </div>
        </div>
      </div>


      {view === 'build' && isAdmin && (
        <div className="scp-grid fe-grid">
          {picker}
          <ScriptEditor list={list} isAdmin={isAdmin} clientData={clientData} callListData={callListData} setCallListData={setCallListData} grp={g} setGrp={setGrp} />
        </div>
      )}

      {view === 'build' && !isAdmin && (
        <div className="scp-grid">
          {picker}

          <section className="card stage">
            <div className="sh">
              <div className="tt"><b>{list?.company || '—'}</b><span>{list?.industry || ''}</span></div>
              <div className="legend">
                <span><i className="v-i" />業種ごと</span><span><i className="v-c" />クライアントごと</span><span><i className="v-k" />その会社・その日</span>
              </div>
              <label className="as">この会社の業種
                <select className="input" value={g} onChange={e => setGrp(e.target.value)}>
                  {Object.keys(IND_NOUN).map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
            </div>
            <div className="cfv sb">
              {list && <ScriptV2 key={list._supaId} spec={list.scriptV2} list={list} row={sample} rebuttal={rebuttal}
                renderLegacy={() => (list.scriptBody ? <ScriptBody text={list.scriptBody} rebuttal={rebuttal} row={{ ...sample, company: '〇〇株式会社', representative: '〇〇' }} style={{ fontSize: 13, lineHeight: 1.8 }} /> : <div className="hint">台本はまだありません</div>)} />}
            </div>
          </section>

          <aside className="side-col">
            <div className="card side">
              <div className="card-h"><b>このリストだけの言葉</b></div>
              {spec && !spec.legacy ? (
                <dl className="own">
                  {own.map(([k, t]) => <div key={k}><dt>{t}</dt><dd>{show(k, spec[k])}</dd></div>)}
                  {extras.length > 0 && <div><dt>追加の質問・確認</dt><dd>{extras.map((x, i) => <span key={i} className="li">{typeof x === 'string' ? x : x?.q || x?.t || ''}</span>)}</dd></div>}
                  {ngs.length > 0 && <div><dt>言ってはいけないこと</dt><dd>{ngs.map((x, i) => <span key={i} className="li ng">{typeof x === 'string' ? x : x?.t || ''}</span>)}</dd></div>}
                  {!own.length && !extras.length && !ngs.length && <div className="hint">基本台本のまま</div>}
                </dl>
              ) : <div className="hint">このリストは今までの台本を使っています</div>}
            </div>
            <div className="card side">
              <div className="card-h"><b>{g}の言い方</b></div>
              <dl className="own">
                <div><dt>社長に</dt><dd>{IND_NOUN[g]}</dd></div>
                <div><dt>受付に</dt><dd>{IND_RECEPTION[g] ? `〇〇市の${IND_RECEPTION[g]}アライアンスの件で` : '業種の言葉を入れて伝える（まだ決めていない）'}</dd></div>
              </dl>
            </div>
            <div className="card side">
              <div className="card-h"><b>注意事項</b></div>
              {cautions.length ? (
                <dl className="own">{cautions.map((c, i) => <div key={i}>{c.dt && <dt>{c.dt}</dt>}<dd>{c.dd.join(' ／ ')}</dd></div>)}</dl>
              ) : <div className="hint">注意事項はまだありません</div>}
            </div>
          </aside>
        </div>
      )}

      {view === 'packs' && (
        <div className="card packs">
          <div className="card-h"><b>業種ごとの言い方</b><span>架電ページでは、会社の業種に合わせてこの言葉が台本に入ります</span></div>
          <div className="prow head"><span>業種</span><span>社長への言い方（〇〇会社様）</span><span>受付への一文（〇〇市の…アライアンスの件で）</span></div>
          {Object.keys(IND_NOUN).map(x => (
            <div key={x} className="prow">
              <b>{x}</b><span>{IND_NOUN[x]}</span>
              <span>{IND_RECEPTION[x] ? `${IND_RECEPTION[x]}アライアンス` : <em>まだ決めていない（業種の言葉を入れて伝える）</em>}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
