import { useMemo, useState } from 'react';
import ScriptV2, { IND_NOUN, IND_RECEPTION } from '../callflow/ScriptV2';
import ScriptView from '../ScriptView';
import './CallListHome.css';
import '../callflow/CallPage.css';

// スクリプトのページ（2026-10-09 むー様・見本 script.html のつくり）
// 台本を見る：リストと業種を選ぶと、架電ページに出る台本がそのまま組み上がる（色の帯＝どこが業種・クライアントの差し込みか）
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

export default function ScriptsPage({ isAdmin, clientData, callListData, setCallListData }) {
  const [view, setView] = useState('build');
  const lists = useMemo(() => (callListData || []).filter(l => !l.is_archived).sort((a, b) => (a.company + a.industry).localeCompare(b.company + b.industry, 'ja')), [callListData]);
  const [listId, setListId] = useState(() => lists[0]?._supaId || '');
  const list = lists.find(l => l._supaId === listId) || lists[0];
  const [grp, setGrp] = useState('建築工事');
  const sample = { representative: '〇〇 〇〇', address: '', industry_group: grp };
  const cautions = parseCautions(list?.cautions);
  let rebuttal = null;
  try { rebuttal = list?.rebuttalData ? JSON.parse(list.rebuttalData) : null; } catch { /* 読めなければ共通のアウト返しだけ */ }
  const views = [['build', '台本を見る'], ['packs', '業種の一覧'], ...(isAdmin ? [['edit', '編集']] : [])];

  return (
    <div className="clh">
      <div className="pt">
        <div><h1>スクリプト</h1><p>どのリストも同じ基本台本に、業種ごと・クライアントごとの言葉を差し込んで出します</p></div>
        <div className="r">
          <div className="seg" style={{ position: 'relative' }}>
            {views.map(([k, t]) => <button key={k} className={view === k ? 'on' : ''} style={view === k ? { background: 'var(--navy)', color: '#fff' } : undefined} onClick={() => setView(k)}>{t}</button>)}
          </div>
        </div>
      </div>

      {view === 'build' && (
        <>
          <div className="fl2" style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            <div className="fl2-r"><span className="fl2-l" style={{ width: 'auto' }}>リスト</span>
              <select className="input" style={{ minWidth: 320 }} value={list?._supaId || ''} onChange={e => setListId(e.target.value)}>
                {lists.map(l => <option key={l._supaId} value={l._supaId}>{l.company}・{l.industry}</option>)}
              </select></div>
            <div className="fl2-r"><span className="fl2-l" style={{ width: 'auto' }}>この会社の業種</span>
              <select className="input" value={grp} onChange={e => setGrp(e.target.value)}>
                {Object.keys(IND_NOUN).map(g => <option key={g} value={g}>{g}</option>)}
              </select></div>
            <span className="fsum">{list?.scriptV2 ? '基本台本＋このリストの差し込み' : 'このリストは今までの台本のまま'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 14 }}>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="cfv" style={{ position: 'static' }}>
                {list && <ScriptV2 key={list._supaId} spec={list.scriptV2} list={list} row={sample} rebuttal={rebuttal}
                  renderLegacy={() => <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.8, margin: 0 }}>{list.scriptBody || '台本はまだありません'}</pre>} />}
              </div>
            </div>
            <div className="card" style={{ padding: '14px 16px', alignSelf: 'start' }}>
              <h4 style={{ fontSize: 14, color: 'var(--navy)', marginBottom: 8 }}>このリストの注意事項</h4>
              {cautions.length ? <dl style={{ fontSize: 12.5, lineHeight: 1.85 }}>{cautions.map((c, i) => [c.dt && <dt key={`t${i}`} style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: i ? 8 : 0 }}>{c.dt}</dt>, <dd key={`d${i}`} style={{ margin: 0 }}>{c.dd.join(' ／ ')}</dd>])}</dl>
                : <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>注意事項はまだありません</div>}
            </div>
          </div>
        </>
      )}

      {view === 'packs' && (
        <div className="card grp" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <colgroup><col style={{ width: 180 }} /><col style={{ width: 220 }} /><col /></colgroup>
            <thead><tr><th>業種</th><th>社長への言い方（〇〇会社様）</th><th>受付への一文（〇〇市の…アライアンスの件）</th></tr></thead>
            <tbody>{Object.keys(IND_NOUN).map(g => (
              <tr key={g}><td style={{ fontWeight: 500 }}>{g}</td><td>{IND_NOUN[g]}</td><td>{IND_RECEPTION[g] ? `${IND_RECEPTION[g]}アライアンス` : <span style={{ color: 'var(--ink-3)' }}>まだ決めていない（業種の言葉を入れて伝える）</span>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {view === 'edit' && isAdmin && (
        <ScriptView isAdmin={isAdmin} clientData={clientData} callListData={callListData} setCallListData={setCallListData} embedded />
      )}
    </div>
  );
}
