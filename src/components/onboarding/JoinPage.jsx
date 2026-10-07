import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './Onboarding.css';
import { callOnboarding, emailLooksOk } from '../../lib/onboarding';

// 入社の招待リンク（/join/:token）。ログインなしで開き、氏名・メール・住所・口座の4つを入れてもらう（2026-10-07）
const EMPTY = { last_name: '', first_name: '', email: '', email2: '', address: '', bank_name: '', branch_name: '', account_type: 'ordinary', account_number: '', account_holder: '' };

export default function JoinPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | open | used | expired | missing | sent
  const [hint, setHint] = useState('');
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    callOnboarding('peek', { token })
      .then(r => {
        setHint(r.name_hint || '');
        if (r.status !== 'sent') setState('used');
        else if (r.expired) setState('expired');
        else setState('open');
      })
      .catch(() => setState('missing'));
  }, [token]);

  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const emailBad = f.email && !emailLooksOk(f.email);
  const email2Bad = f.email2 && f.email2.trim().toLowerCase() !== f.email.trim().toLowerCase();
  const numBad = f.account_number && !/^\d{7}$/.test(f.account_number);
  const kanaBad = f.account_holder && !/^[ァ-ヶー　 ・．.()（）]+$/.test(f.account_holder);
  const filled = f.last_name && f.first_name && f.email && f.email2 && f.address && f.bank_name && f.branch_name && f.account_number && f.account_holder;
  const canSend = filled && !emailBad && !email2Bad && !numBad && !kanaBad && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true); setErr('');
    try {
      const r = await callOnboarding('submit', { token, ...f, email: f.email.trim() });
      setSentTo(r.email);
      setState('sent');
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  const Field = ({ k, label, type = 'text', ph, bad, note, ...rest }) => (
    <div className={`ob-f${bad ? ' bad' : ''}`}>
      <label>{label}<b>必須</b></label>
      <input type={type} value={f[k]} onChange={set(k)} placeholder={ph} {...rest} />
      {(bad || note) && <small>{bad || note}</small>}
    </div>
  );

  return (
    <div className="ob">
      <div className="ob-wrap">
        <div className="ob-brand"><i />Spanavi</div>
        {state === 'loading' && <p className="ob-lead">読み込み中…</p>}
        {state === 'missing' && <><h1>リンクが見つかりません</h1><p className="ob-lead">届いたリンクをもう一度確かめるか、担当者に連絡してください。</p></>}
        {state === 'expired' && <><h1>リンクの期限が切れています</h1><p className="ob-lead">担当者に新しいリンクを頼んでください。</p></>}
        {state === 'used' && <><h1>このリンクは入力済みです</h1><p className="ob-lead">届いたメールからパスワードを決めて、Spanaviにログインしてください。メールが届かないときは、担当者に連絡してください。</p></>}
        {state === 'sent' && (
          <div className="ob-card ob-done">
            <div className="mark" />
            <h1 style={{ display: 'inline-block' }}>受け付けました</h1>
            <p><b>{sentTo}</b> にメールを送りました。<br />メールのリンクからパスワードを決めてログインすると、業務委託契約書の確認に進みます。</p>
            <p style={{ fontSize: 12, color: '#8692A0' }}>数分たっても届かないときは、迷惑メールのフォルダを見てください。それでも無ければ担当者に連絡してください。</p>
          </div>
        )}
        {state === 'open' && (
          <form onSubmit={submit}>
            <h1>{hint ? `${hint}、ようこそ` : 'ようこそ'}</h1>
            <p className="ob-lead">入社の手続きをはじめます。下の4つを入れてください。入れた内容は、業務委託契約書と報酬の振込に使います。</p>
            {err && <div className="ob-err">{err}</div>}
            <div className="ob-card">
              <h2><span>1</span>氏名</h2>
              <div className="ob-row">
                {Field({ k: 'last_name', label: '姓', ph: '篠宮', autoComplete: 'family-name' })}
                {Field({ k: 'first_name', label: '名', ph: '拓武', autoComplete: 'given-name' })}
              </div>
            </div>
            <div className="ob-card" style={{ animationDelay: '.05s' }}>
              <h2><span>2</span>メールアドレス</h2>
              {Field({ k: 'email', label: 'メールアドレス', type: 'email', ph: 'name@example.com', bad: emailBad && '形が正しくありません（「.@」や「..」が入っていないか見てください）', autoComplete: 'email', note: 'ログインと連絡に使います。よく使うアドレスを入れてください' })}
              {Field({ k: 'email2', label: '確認のため、もう一度', type: 'email', ph: 'name@example.com', bad: email2Bad && '上のアドレスと一致しません', onPaste: (e) => e.preventDefault() })}
            </div>
            <div className="ob-card" style={{ animationDelay: '.1s' }}>
              <h2><span>3</span>住所</h2>
              {Field({ k: 'address', label: '住所', ph: '東京都港区西麻布1-2-3 マンション101', autoComplete: 'street-address', note: '都道府県から、建物名・部屋番号まで' })}
            </div>
            <div className="ob-card" style={{ animationDelay: '.15s' }}>
              <h2><span>4</span>報酬の振込口座</h2>
              <div className="ob-row">
                {Field({ k: 'bank_name', label: '銀行名', ph: '三井住友銀行' })}
                {Field({ k: 'branch_name', label: '支店名', ph: '六本木支店' })}
              </div>
              <div className="ob-row">
                <div className="ob-f">
                  <label>種別<b>必須</b></label>
                  <select value={f.account_type} onChange={set('account_type')}>
                    <option value="ordinary">普通</option>
                    <option value="checking">当座</option>
                  </select>
                </div>
                {Field({ k: 'account_number', label: '口座番号', ph: '1234567', inputMode: 'numeric', maxLength: 7, bad: numBad && '7桁の数字で入れてください' })}
              </div>
              {Field({ k: 'account_holder', label: '口座名義（カタカナ）', ph: 'シノミヤ タクム', bad: kanaBad && 'カタカナで入れてください' })}
            </div>
            <button className="ob-btn" type="submit" disabled={!canSend} style={{ width: '100%' }}>{busy ? '送っています…' : '送る'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
