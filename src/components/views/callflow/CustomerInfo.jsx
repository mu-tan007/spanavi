// 顧客情報のタブ（2026-10-09 むー様・見本 call.html）
// ① このリストの訪問担当者（氏名・ふりがな・役職。役職が分からないときは「確認中」）
// ② 社長に話せる、この会社の強み（買い手のリストは「一緒になると社長にとって何が良いか」＋手数料・なぜうちに・投資方針・グループ実績）
// ③ 「〇〇ってどんな会社？」と聞かれたら ④ 会社の基本＋出典
// 中身は call_lists.script_v2.cust。まだ無いリストは、今までの「企業概要」（company_info）を出す
export default function CustomerInfo({ cust, client, legacy }) {
  if (!cust) return legacy ? legacy() : <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>顧客情報はまだありません</div>;
  const t = cust.tanto || {};
  const name = client ? client.replace(/株式会社|有限会社|合同会社/g, '').trim() : '';
  const B = cust.buyer;
  return (
    <div className="cust">
      {(t.name || t.family) && (
        <section><h6>このリストの訪問担当者</h6>
          <div className="tanto">{t.kana ? <ruby>{t.name || t.family}<rt>{t.kana}</rt></ruby> : <ruby>{t.name || t.family}</ruby>}
            {t.title ? <span className="yaku">{t.title}</span> : <span className="yaku miss">役職：確認中</span>}</div>
          <p className="sm">社長に「誰が来るのか」と聞かれたら：「私の上長の{t.family || (t.name || '').split(/\s/)[0]}という者が伺います」</p>
        </section>
      )}
      {B ? (
        <section><h6>一緒になると社長にとって何が良いか</h6>
          {B.merit && <p className="say">{B.merit}</p>}
          <dl className="kv" style={{ marginTop: 8 }}>
            {B.fee && <><dt>手数料</dt><dd>{B.fee}</dd></>}
            {B.why_us && <><dt>なぜうちに</dt><dd>{B.why_us}</dd></>}
            {B.policy && <><dt>投資方針</dt><dd>{B.policy}</dd></>}
            {B.group && <><dt>グループ実績</dt><dd>{B.group}</dd></>}
          </dl>
        </section>
      ) : (cust.strengths || []).length > 0 && (
        <section><h6>社長に話せる、この会社の強み</h6>
          <ol className="str">{cust.strengths.map((x, i) => <li key={i}><b>{x.b}</b><span>{x.s}</span></li>)}</ol>
        </section>
      )}
      {cust.what && <section><h6>「{name}ってどんな会社？」と聞かれたら</h6><p className="say">{cust.what}</p></section>}
      {(cust.basics || []).length > 0 && (
        <section><h6>会社の基本</h6><dl className="kv">{cust.basics.map(([k, v]) => [<dt key={`k${k}`}>{k}</dt>, <dd key={`v${k}`}>{v}</dd>])}</dl></section>
      )}
      {cust.src && <p className="src">出典：{cust.src}</p>}
    </div>
  );
}
