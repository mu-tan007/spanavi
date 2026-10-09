import { useEffect, useMemo, useState } from 'react';
import ScriptV2, { IND_NOUN, IND_RECEPTION } from '../callflow/ScriptV2';
import ScriptView from '../ScriptView';
import ScriptBody from '../../common/ScriptBody';
import { updateCallListScriptV2, updateCallListCautions } from '../../../lib/supabaseWrite';

// スクリプトの編集（2026-10-10 むー様：今回の作り直しに合わせる）
// 左：リスト ／ 中：このリストだけの言葉（基本台本に差し込む値）と注意事項 ／ 右：架電ページに出る台本をその場で組み上げて見せる
// 保存先は call_lists.script_v2 と call_lists.cautions。顧客情報（cust）など、ここで触らない項目は元の値のまま残す
const MODES = [['face', '対面'], ['online', 'オンライン'], ['both', 'どちらも']];
const PITCHES = [['base', '基本（買い手がいる）'], ['nohint', '買い手を言わない'], ['buyer', '具体的な買い手'], ['custom', 'このリストだけの文']];
const CAUTION_HEADS = ['①訪問担当者', '②アポの形式', '③日程', '④予約の方法', '⑤アポ取得後のTODO', '⑥その他'];
const lines = v => (Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : x?.q || x?.t || '')).join('\n') : '');
const toList = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);

function Field({ label, hint, children }) {
  return (
    <label className="fe-f">
      <span className="fe-l">{label}{hint && <small>{hint}</small>}</span>
      {children}
    </label>
  );
}

export default function ScriptEditor({ list, isAdmin, clientData, callListData, setCallListData, grp, setGrp }) {
  const base = useMemo(() => ({ ...(list?.scriptV2 || {}) }), [list]);
  const [d, setD] = useState(base);
  const [ca, setCa] = useState(list?.cautions || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [old, setOld] = useState(false);
  useEffect(() => { setD({ ...(list?.scriptV2 || {}) }); setCa(list?.cautions || ''); setMsg(''); setOld(false); }, [list]);

  const dirty = JSON.stringify(d) !== JSON.stringify(base) || ca !== (list?.cautions || '');
  const set = (k, v) => setD(p => {
    const n = { ...p };
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete n[k]; else n[k] = v;
    return n;
  });
  const legacy = !!d.legacy || !list?.scriptV2;
  const sample = { representative: '〇〇 〇〇', address: '東京都港区西麻布4丁目12-13', industry_group: grp };
  let rebuttal = null;
  try { rebuttal = list?.rebuttalData ? JSON.parse(list.rebuttalData) : null; } catch { /* 読めなければ共通のアウト返しだけ */ }

  const save = async () => {
    if (!list?._supaId || busy) return;
    setBusy(true); setMsg('');
    const e1 = await updateCallListScriptV2(list._supaId, d);
    const e2 = ca !== (list?.cautions || '') ? await updateCallListCautions(list._supaId, ca) : null;
    setBusy(false);
    if (e1 || e2) { setMsg('保存できませんでした'); return; }
    setCallListData?.(prev => prev.map(l => (l._supaId === list._supaId ? { ...l, scriptV2: d, cautions: ca } : l)));
    setMsg('保存しました');
  };

  if (!isAdmin) return <div className="card hint">編集は管理者だけです</div>;
  if (!list) return <div className="card hint">リストを選んでください</div>;
  if (old) {
    return (
      <div className="fe-old">
        <div className="fe-oldh"><button className="btn sm" onClick={() => setOld(false)}>← 新しい編集画面へ戻る</button><span>今までの台本（自由文・分岐・アウト返し・PDF）の編集画面です</span></div>
        <ScriptView isAdmin={isAdmin} clientData={clientData} callListData={callListData} setCallListData={setCallListData} embedded />
      </div>
    );
  }

  const ins = (k, ph) => <input className="input" value={d[k] || ''} placeholder={ph} onChange={e => set(k, e.target.value)} />;
  const area = (k, ph, rows = 2) => <textarea className="input ta" rows={rows} value={d[k] || ''} placeholder={ph} onChange={e => set(k, e.target.value)} />;
  const listArea = (k, ph, rows = 3) => <textarea className="input ta" rows={rows} defaultValue={lines(d[k])} key={`${list._supaId}-${k}`} placeholder={ph} onBlur={e => set(k, toList(e.target.value))} />;

  return (
    <>
      <section className="card fe">
        <div className="fe-top">
          <div className="tt"><b>{list.company}</b><span>{list.industry}</span></div>
          <div className="seg">
            <button className={!legacy ? 'on' : ''} style={!legacy ? { background: 'var(--navy)', color: '#fff' } : undefined} onClick={() => set('legacy', null)}>基本台本に差し込む</button>
            <button className={legacy ? 'on' : ''} style={legacy ? { background: 'var(--navy)', color: '#fff' } : undefined} onClick={() => set('legacy', true)}>今までの台本</button>
          </div>
        </div>

        {legacy ? (
          <div className="fe-sec">
            <div className="fe-h"><b>今までの台本を使っています</b><span>架電ページには、自由文の台本がそのまま出ます</span></div>
            <p className="fe-note">基本台本に切り替えると、下の項目を埋めるだけで台本が組み上がります。自由文・分岐・アウト返し・PDFの編集は、今までの編集画面で行います。</p>
            <button className="btn" onClick={() => setOld(true)}>今までの編集画面を開く</button>
          </div>
        ) : (
          <>
            <div className="fe-sec">
              <div className="fe-h"><b>名乗りと面談</b><span>色の帯：<i className="v-c">クライアント・リストごと</i></span></div>
              <div className="fe-g2">
                <Field label="名乗る社名" hint="受付と社長への名乗り">{ins('client', list.company?.replace(/株式会社|有限会社/g, '').trim())}</Field>
                <Field label="面談する上長" hint="「私の上長の〇〇」">{ins('boss', '〇〇')}</Field>
                <Field label="面談の形">
                  <div className="seg sm">{MODES.map(([k, t]) => <button key={k} type="button" className={(d.mode || 'face') === k ? 'on' : ''} style={(d.mode || 'face') === k ? { background: 'var(--navy)', color: '#fff' } : undefined} onClick={() => set('mode', k)}>{t}</button>)}</div>
                </Field>
                <Field label="当日うかがう人" hint="空なら「私の上長の〇〇というもの」">{ins('closing_who', '')}</Field>
              </div>
              {d.mode === 'both' && <Field label="面談の形の補足">{ins('mode_note', '注意事項②：対面でもオンラインでも可')}</Field>}
            </div>

            <div className="fe-sec">
              <div className="fe-h"><b>相手の呼び方</b><span>空なら業種の言い方（{IND_NOUN[grp] || '—'}）と「社長」「御社」</span></div>
              <div className="fe-g3">
                <Field label="〇〇会社様">{ins('noun', IND_NOUN[grp] || '')}</Field>
                <Field label="相手の呼び方">{ins('honorific', '社長')}</Field>
                <Field label="相手の会社の呼び方">{ins('house', '御社')}</Field>
              </div>
            </div>

            <div className="fe-sec">
              <div className="fe-h"><b>受付への用件</b><span>空なら業種の一文（{IND_RECEPTION[grp] ? `${IND_RECEPTION[grp]}アライアンス` : 'まだ決めていない'}）</span></div>
              <Field label="受付への一文" hint="「〇〇市の［ここ］アライアンスの件」">{ins('reception', IND_RECEPTION[grp] || '')}</Field>
              <Field label="用件をまるごと差し替える" hint="入れると上の一文の代わりにこの文を出す">{area('reception_full', '')}</Field>
            </div>

            <div className="fe-sec">
              <div className="fe-h"><b>社長への用件</b></div>
              <Field label="用件の型">
                <div className="seg sm">{PITCHES.map(([k, t]) => <button key={k} type="button" className={(d.pitch || 'base') === k ? 'on' : ''} style={(d.pitch || 'base') === k ? { background: 'var(--navy)', color: '#fff' } : undefined} onClick={() => set('pitch', k)}>{t}</button>)}</div>
              </Field>
              {(d.pitch || 'base') === 'base' && (
                <label className="fe-ck"><input type="checkbox" checked={!!d.shimei} onChange={e => set('shimei', e.target.checked || null)} />「指名ではないものの、」を入れる</label>
              )}
              {d.pitch === 'buyer' && <Field label="買い手の言い方">{area('buyer', '例：関東で施工会社を探している上場企業様から、ぜひともお話しできないかというお話')}</Field>}
              {d.pitch === 'nohint' && <Field label="用件の文" hint="空なら共通の文">{area('nohint', '', 3)}</Field>}
              {d.pitch === 'custom' && <Field label="このリストだけの用件の文">{area('pitch_text', '', 4)}</Field>}
              {['base', 'buyer', undefined].includes(d.pitch) && <Field label="用件の後半" hint="空なら「その会社が具体的に…メリットがあるのか」">{area('pitch_tail', '')}</Field>}
              <Field label="最初の一文を差し替える" hint="空なら「我々が〇〇会社様の資本提携のご支援をしておりまして」">{area('support', '')}</Field>
            </div>

            <div className="fe-sec">
              <div className="fe-h"><b>足す言葉</b><span>1行に1つ</span></div>
              <div className="fe-g2">
                <Field label="社長への追加の質問・確認">{listArea('extra', '')}</Field>
                <Field label="アポが取れた後に足す言葉">{listArea('after_extra', '')}</Field>
              </div>
              <Field label="M&Aの可能性を聞く前の一言">{ins('pre_q', '')}</Field>
              <Field label="アポ取得後にやること" hint="台本の最後に小さく出る">{ins('after', '1. アポ取得報告の記載／2. …')}</Field>
              <Field label="このリストだけのNG" hint="1行に1つ。全クライアント共通のNGに足される">{listArea('ng', '')}</Field>
            </div>
          </>
        )}

        <div className="fe-sec">
          <div className="fe-h"><b>注意事項</b><span>架電ページの「注意事項」のタブに出る。見出しは①〜⑥のまま</span></div>
          <div className="fe-heads">{CAUTION_HEADS.map(h => <button key={h} type="button" className="chipb" onClick={() => setCa(v => (v.includes(h) ? v : `${v}${v && !v.endsWith('\n') ? '\n' : ''}${h}\n`))}>{h}</button>)}</div>
          <textarea className="input ta" rows={10} value={ca} onChange={e => setCa(e.target.value)} />
        </div>

        <div className="fe-save">
          <span className={`fe-msg ${msg === '保存しました' ? 'ok' : msg ? 'ng' : ''}`}>{msg || (dirty ? '保存していない変更があります' : '')}</span>
          <button className="btn" disabled={!dirty || busy} onClick={() => { setD({ ...(list.scriptV2 || {}) }); setCa(list.cautions || ''); setMsg(''); }}>元に戻す</button>
          <button className="btn pri" disabled={!dirty || busy} onClick={save}>{busy ? '保存中…' : '保存'}</button>
        </div>
      </section>

      <aside className="card stage fe-prev">
        <div className="sh">
          <div className="tt"><b>架電ページでの見え方</b><span>入力するとすぐ反映（保存前）</span></div>
          {setGrp && (
            <label className="as">この会社の業種
              <select className="input" value={grp} onChange={e => setGrp(e.target.value)}>
                {Object.keys(IND_NOUN).map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="cfv sb">
          <ScriptV2 key={`${list._supaId}-${legacy}`} spec={legacy ? { ...d, legacy: true } : d} list={list} row={sample} rebuttal={rebuttal}
            renderLegacy={() => (list.scriptBody ? <ScriptBody text={list.scriptBody} rebuttal={rebuttal} row={{ ...sample, company: '〇〇株式会社', representative: '〇〇' }} style={{ fontSize: 13, lineHeight: 1.8 }} /> : <div className="hint">台本はまだありません</div>)} />
        </div>
      </aside>
    </>
  );
}
