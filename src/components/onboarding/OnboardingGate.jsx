import React, { useCallback, useEffect, useRef, useState } from 'react';
import './Onboarding.css';
import { callOnboarding } from '../../lib/onboarding';

// ログインした直後に入社手続きの続きを出す（2026-10-07）。
// 契約に同意するまでは先に進めない。同意後は Slack・LINE・Zoom の案内を出し、「Spanaviをはじめる」で閉じられる。
const DISMISS_KEY = 'sp_onboarding_dismissed';

export default function OnboardingGate({ children }) {
  const [st, setSt] = useState(null); // null=確認中 / {invite:null} / {...}
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  const load = useCallback(() => callOnboarding('status').then(setSt).catch(() => setSt({ invite: null })), []);
  useEffect(() => { load(); }, [load]);

  if (!st) return children; // 確認中も通常画面（招待のない人を待たせない）
  const inv = st.invite;
  if (!inv || inv.status === 'done' || inv.status === 'revoked') return children;
  if (inv.status === 'submitted') return <ContractStep name={st.member?.name} onSigned={load} />;
  if (dismissed) return children;
  return <WelcomeSteps st={st} onClose={() => { try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } setDismissed(true); }} />;
}

function ContractStep({ name, onSigned }) {
  const box = useRef(null);
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await callOnboarding('contract');
        if (!alive) return;
        setDoc(r);
        const buf = await (await fetch(r.url)).arrayBuffer();
        const { renderAsync } = await import('docx-preview');
        if (alive && box.current) await renderAsync(buf, box.current, null, { inWrapper: true, ignoreLastRenderedPageBreak: true });
      } catch (e) {
        if (alive) setErr(e.message);
      }
    })();
    return () => { alive = false; };
  }, []);

  const agree = async () => {
    setBusy(true); setErr('');
    try {
      await callOnboarding('agree', { sha256: doc.sha256 });
      await onSigned();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="ob">
      <div className="ob-wrap wide">
        <div className="ob-brand"><i />Spanavi</div>
        <h1>業務委託契約書の確認</h1>
        <p className="ob-lead">{name ? `${name}さん、` : ''}入れていただいた内容を差し込んだ契約書です。最後まで読んで、内容に同意できたら下のボタンを押してください。押した時刻と、この契約書の内容の記録を残し、同意したことの証にします。</p>
        {err && <div className="ob-err">{err}</div>}
        <div className="ob-doc" ref={box}>{!doc && !err && <p className="ob-lead" style={{ padding: 20 }}>契約書を用意しています…</p>}</div>
        {doc && <div className="ob-meta">契約期間 {doc.start_date} 〜 {doc.end_date} ・ 文書の指紋（SHA-256）{doc.sha256}</div>}
        <label className="ob-agree">
          <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} disabled={!doc} />
          <span>上の業務委託契約書を読み、内容に同意します。この操作をもって契約を結ぶことに同意します。</span>
        </label>
        <button className="ob-btn" disabled={!ok || !doc || busy} onClick={agree}>{busy ? '記録しています…' : '同意して契約する'}</button>
      </div>
    </div>
  );
}

function Qr({ url }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    import('qrcode').then(m => m.toDataURL(url, { margin: 1, width: 132, color: { dark: '#032D60' } })).then(setSrc).catch(() => {});
  }, [url]);
  return src ? <img src={src} alt="" width={66} height={66} style={{ borderRadius: 6, border: '1px solid #E3E6EB' }} /> : null;
}

function WelcomeSteps({ st, onClose }) {
  const steps = st.invite.steps || {};
  const L = st.links || {};
  const rows = [
    { k: 'spanavi', t: 'Spanaviにログイン', d: 'このページを見られていれば完了です', done: true },
    { k: 'contract', t: '業務委託契約', d: '同意の記録を残しました', done: true },
    { k: 'slack', t: 'Slackに参加', d: L.slack ? '押すと参加の画面が開きます。参加すると、必要なチャンネルに自動で入ります' : '参加のリンクを準備中です。担当者から届くまでお待ちください', done: steps.slack === 'joined', href: L.slack, cta: '参加する' },
    { k: 'line', t: 'LINEのグループに参加', d: L.line ? 'スマホで開くか、QRを読み取ってください' : '参加のリンクを準備中です', done: steps.line === 'joined', href: L.line, cta: '開く', qr: L.line },
    { k: 'zoom', t: 'Zoom Phoneを有効にする', d: steps.zoom === 'active' ? '電話番号の割り当てまで済みました' : steps.zoom === 'invited' ? 'Zoomから届いたメールの「アカウントを有効にする」を押してください。押すと電話番号まで自動で付きます' : '準備ができたら、Zoomから招待メールが届きます', done: steps.zoom === 'active' },
  ];
  return (
    <div className="ob">
      <div className="ob-wrap">
        <div className="ob-brand"><i />Spanavi</div>
        <h1>ようこそ、{st.member?.name}さん</h1>
        <p className="ob-lead">契約が済みました。あと少しで準備が終わります。</p>
        <div className="ob-steps">
          {rows.map((r, i) => (
            <div key={r.k} className={`ob-step${r.done ? ' ok' : ''}`} style={{ animationDelay: `${i * 0.05}s` }}>
              <span className="ic">{r.done ? '✓' : i + 1}</span>
              <span><b>{r.t}</b><small>{r.d}</small></span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {r.done ? <span className="ob-tag">完了</span>
                  : r.href ? <>{r.qr && <Qr url={r.qr} />}<a className="ob-btn ghost" href={r.href} target="_blank" rel="noreferrer">{r.cta}</a></>
                  : <span className="ob-tag wait">待ち</span>}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="ob-btn" onClick={onClose}>Spanaviをはじめる</button>
        </div>
      </div>
    </div>
  );
}
