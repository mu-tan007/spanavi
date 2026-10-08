// 面談前の1枚資料（A4縦）。クライアントへのアポ報告にPDFで添付する（2026-10-07 むー様決定）。
// 見本：outputs/spanavi_mihon_v2/report.html。PDFは briefPdf.js で html2canvas → jsPDF にする。
// 右下に Spartia のロゴ（新ロゴの仕様：Georgia Bold・紺の文字・金の線 y=29.5 x1=54 x2=314.6879506）。
import './OnePageBrief.css';

export function SpartiaLogo({ width = 130 }) {
  return (
    <svg viewBox="0 0 380 60" width={width} aria-label="SPARTIA" style={{ display: 'block' }}>
      <defs>
        <clipPath id="sp-brief-logo"><rect x="0" y="0" width="380" height="28" /><rect x="0" y="31" width="380" height="29" /></clipPath>
      </defs>
      <text x="190" y="44" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="40" letterSpacing="8" fill="#1B3A8C" clipPath="url(#sp-brief-logo)">SPARTIA</text>
      <line x1="54" y1="29.5" x2="314.6879506" y2="29.5" stroke="#C8A84B" strokeWidth="1.6" />
    </svg>
  );
}

export default function OnePageBrief({ m, createdOn }) {
  const b = m.brief || {};
  const temp = Number(b.temperature) || 0;
  return (
    <div className="ob-page">
      <div className="ob-bar" />
      <div className="ob-head">
        <div>
          <div className="ob-kicker">面談前資料 ・ {m.client} 御中</div>
          <h2>{m.company}</h2>
          <div className="ob-sub">{[m.rep && `${m.rep} 様`, m.address].filter(Boolean).join(' ・ ')}</div>
        </div>
        <div className="ob-meet">
          <div className="ob-s">面談</div>
          <div className="ob-d">{m.meeting}</div>
          <div className="ob-s">{[m.format, m.travel].filter(Boolean).join(' ・ ')}</div>
        </div>
      </div>
      {b.one_liner && <div className="ob-one"><b>ひとことで：</b>{b.one_liner}</div>}
      <div className="ob-grid">
        <div className="ob-col">
          {/* 東京商工リサーチ（企業DB）の概要（2026-10-08） */}
          <div className="ob-box"><h3>会社の概要（東京商工リサーチ）</h3>
            <dl className="ob-kv">
              {(m.industry || m.businessDesc) && <><dt>業種</dt><dd>{[m.industry, m.businessDesc].filter(Boolean).join(' ・ ')}</dd></>}
              {m.established && <><dt>設立</dt><dd>{m.established}年</dd></>}
              {m.employees && <><dt>従業員</dt><dd>{m.employees}名</dd></>}
              {m.rep && <><dt>代表</dt><dd>{m.rep} 様{m.repAge ? `（${m.repAge}歳）` : ''}</dd></>}
              {m.shareholders && <><dt>大株主</dt><dd>{String(m.shareholders).replace(/[，,]/g, '、')}</dd></>}
            </dl>
          </div>
          {(m.revenueShort || m.netIncomeShort || m.years != null) && (
            <div className="ob-box"><h3>数字</h3>
              <div className="ob-nums">
                {m.revenueShort && <div><b>{m.revenueShort}</b><span>売上</span></div>}
                {m.netIncomeShort && <div><b className={m.netNeg ? 'neg' : ''}>{m.netIncomeShort}</b><span>当期純利益</span></div>}
                {m.years != null && m.years >= 0 && <div><b>{m.years}年</b><span>創業から</span></div>}
              </div>
            </div>
          )}
          {m.business.length > 0 && <div className="ob-box"><h3>事業の詳細（公開情報より）</h3><ul>{m.business.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {m.strengths.length > 0 && <div className="ob-box"><h3>強み</h3><ul>{m.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {m.history.length > 0 && (
            <div className="ob-box"><h3>沿革</h3>
              <div className="ob-tl">{m.history.map((h, i) => <div key={i}><b>{h.year}</b>{h.event}</div>)}</div>
            </div>
          )}
        </div>
        <div className="ob-col">
          <div className="ob-box ob-voice"><h3>社長との会話</h3>
            {temp > 0 && (
              <div className="ob-meter"><span>温度感</span>
                <span className="ob-dots">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= temp ? 'on' : ''} />)}</span>
                <b>{b.temperature_label}</b></div>
            )}
            {(b.quotes || []).map((q, i) => (
              <q key={i}>{q.text}{q.source === 'report' ? '（趣旨）' : ''}<small>{q.context}</small></q>
            ))}
            {m.personality && <p><b>お人柄：</b>{m.personality.slice(0, 150)}{m.personality.length > 150 ? '…' : ''}</p>}
            {m.meetingExp && <p><b>面談経験：</b>{m.meetingExp.slice(0, 90)}{m.meetingExp.length > 90 ? '…' : ''}</p>}
            {m.futureConsider && <p><b>将来の検討：</b>{m.futureConsider.slice(0, 90)}{m.futureConsider.length > 90 ? '…' : ''}</p>}
          </div>
          {(b.cautions || []).length > 0 && <div className="ob-box"><h3>気をつけること</h3><ul>{b.cautions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {b.successor && <div className="ob-box"><h3>後継者</h3><p>{b.successor}</p></div>}
        </div>
      </div>
      <div className="ob-foot">
        <span>出典：東京商工リサーチ（弊社の企業DB）・会社HPなどの公開情報・通話録音<br />{createdOn} 作成{m.getter ? ` ・ 取得 ${m.getter.split(/\s/)[0]}` : ''}</span>
        <SpartiaLogo />
      </div>
    </div>
  );
}
