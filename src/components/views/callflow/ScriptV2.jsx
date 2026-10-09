import { useState } from 'react';
import ScriptBody from '../../common/ScriptBody';

// 台本（2026-10-09 むー様の基本台本・見本 call.html）
// 共通の文に、業種ごと（青）・クライアントごと（金）・その会社とその日（灰）を差し込む。小タブ：台本・アウト返し・NGワード
// リストごとの違いは call_lists.script_v2（jsonb）に持つ：
//   { client, boss, mode: 'face'|'online'|'both', mode_note, shimei, pitch: 'base'|'nohint'|'buyer', buyer, pitch_tail, nohint,
//     pitch_text（pitch:'custom'）, support, visit_face, closing_who, noun, reception, reception_fallback, reception_say, pre_q,
//     ng: [], outs: [], extra: [], after_extra: [], after, legacy }
//   legacy: true のリスト（売り手ソーシング以外など）は、共通の台本ではなく今までの台本を出す（アウト返し・NGワードは共通＋このリスト）

// 業種（上の段）ごとの「〇〇会社様」と、受付に伝える一文（10/9 了承の12業種＋そのほか）
export const IND_NOUN = {
  '建築工事': '建設会社様', '専門工事': '専門工事会社様', '電気工事': '電気工事会社様', '管工事': '設備工事会社様', '土木': '土木会社様',
  '製造': '製造会社様', '食品製造': '食品メーカー様', '運送・物流': '運送会社様', 'IT': 'IT企業様', '人材': '人材会社様',
  '不動産': '不動産会社様', 'ビルメンテナンス': 'ビルメンテナンス会社様', '介護・福祉': '介護事業者様', '調剤薬局': '調剤薬局様', '歯科': '歯科医院様',
  '飲食・小売': '飲食・小売会社様', '自動車整備・販売': '自動車整備会社様', 'ガソリンスタンド': '石油販売会社様', '保険代理店': '保険代理店様', '酒造・製茶': '酒蔵・製茶会社様',
  '卸売': '卸売会社様', '産業廃棄物': '産業廃棄物処理会社様', '警備': '警備会社様', '医療': '医療法人様', '宿泊': '宿泊施設様', '教育・学習支援': '教育事業者様',
  '金融': '金融関連会社様', '専門サービス': '専門サービス会社様', '生活関連・娯楽': 'サービス会社様', '農林漁業': '農林水産会社様', 'その他サービス': 'サービス会社様',
};
export const IND_RECEPTION = {
  '建築工事': '元請案件の相互融通に関する', '専門工事': '元請案件の相互融通に関する', '電気工事': '受注案件の相互融通に関する', '管工事': '元請案件の相互融通に関する', '土木': '公共工事の施工体制に関する',
  '製造': '受注の相互融通に関する', '食品製造': '販路の共有に関するフード', '運送・物流': '荷主基盤の共有に関するロジスティクス', 'IT': '元請案件の相互融通に関する', '人材': '登録スタッフ基盤の共有に関する',
  '不動産': '管理物件の共有に関する', 'ビルメンテナンス': '管理物件の相互補完に関する', '介護・福祉': '利用者さまの相互紹介に関する', '調剤薬局': '薬剤師の確保に関する', '歯科': '医院の承継に関するデンタル',
  '飲食・小売': '仕入れの共同化に関する', '自動車整備・販売': '車両販売事業者との', 'ガソリンスタンド': '燃料調達の共同化に関する', '保険代理店': '契約基盤の承継に関する', '酒造・製茶': '販路の共有に関する',
  '卸売': '仕入れと販路の共有に関する', '産業廃棄物': '処理施設の相互活用に関する',
};

// 上位の架電者の通話から（10/8 の切り返し集）。{client} はクライアント名に置き換える
const OUTS = [
  ['受付', '「どういったご用件でしょうか」', '〇〇市の〇〇アライアンスの件で、{client}の（名前）と〇〇社長にお伝えください。', '上位6人全員が使用'],
  ['受付', '「アライアンスとは」「何の提携ですか」', '提携のお話になります。（さらに聞かれたら）資本提携であったりとか、そういった類のものになります。', 'M&Aという言葉は受付には自分から出さない'],
  ['受付', '「不在です」「外出中」「来客中」', '本日お戻りになられますかね。何時頃いらっしゃることが多いですかね。では〇時頃に改めます。', '受付再コールの共通の動き'],
  ['受付', '「折り返させます」「お急ぎですか」', 'いえいえ、お急ぎではないので、こちらから〇時頃に改めます。{client}の（名前）とだけお伝えください。', '用件は受付に預けない'],
  ['社長', '「M&Aでしょ」「売る話？」', 'はい、M&Aのお話です。ただ、すぐすぐにというのは社長にとってあまりにも唐突なのは承知しておりますので、あくまで将来の選択肢の一つとして、メリットだけでもお伝えできればと。', 'まず認める'],
  ['社長', '「興味ない」「考えていない」', 'もちろんでございます。今すぐM&Aをするというお話ではなく、将来の選択肢の一つとしての情報提供です。30分きっかりで終わらせますので、〇日と〇日でしたらどちらが…', '最後に必ず日付を2択で出す'],
  ['社長', '「相手はどこ？」「社名を教えて」', 'お電話口では申し上げられないのですが、御社の場合どういったお相手が考えられるかも含めて、当日、上長から直接お伝えいたします。', ''],
  ['社長', '「日程が分からない」「また電話して」', '仮置きで全く構いません。2日前に必ず確認のお電話をしますし、何度でも再調整できます。一旦〇日の〇時で押さえてもよろしいでしょうか。', ''],
  ['社長', '「忙しい」「今手が離せない」', '（運転中・来客中なら）失礼しました、〇時頃に改めます。（それ以外）お忙しいのは承知しております。来週以降で、30分きっかりで終わらせますので、〇日はいかがでしょうか。', ''],
  ['社長', '「資料を送って」', '資料は当日お持ちして詳しくご説明します。仮置きで構いませんので、このお電話で日程だけ決めさせてください。', ''],
  ['社長', '「うちは大した会社じゃない」', 'とんでもございません。御社は〇〇から〇〇まで幅広く手がけられていて、そういった会社様と一緒に成長したいというお話が上がっております。', '事業の中身を1つ言う（左上の「この会社の強み」）'],
  ['社長', '「なぜうちに？」', '東京商工リサーチなどのデータを基に企業を調べた中で、〇〇の強みがあるところに先方がご興味を持たれまして。', ''],
];
// 全クライアント共通のNG
const NG_ALL = [
  ['「指名」と言わない', '「指名ですか」に「はい」と答えない。'],
  ['相手先の社名を出さない', '「社名を伝えるだけ」「資料を渡してすぐ帰る」で誘わない。'],
  ['「興味ない」と言われたら押さない', '強引に日程を復唱しない。'],
  ['訪問者・代表者からの連絡を約束しない', '聞かれた時だけ答える。'],
  ['分からないことは作らない', '数字・実績・断定は言わない。'],
  ['クライアントの社名は正式名で', '略さない・別名を使わない・社員を装わない。'],
  ['「M&A」「資本提携」を濁さない', 'M&Aですかと聞かれたら「M&Aです」。'],
  ['「不慮の事故」の例え・接点がないのに「以前お電話した件の続き」', '実際に架電履歴があれば「以前お電話した件」は言ってよい。'],
];

const I = ({ children }) => <span className="v-i">{children}</span>;
const C = ({ children }) => <span className="v-c">{children}</span>;
const K = ({ children }) => <span className="v-k">{children}</span>;
const Miss = ({ children }) => <span className="miss">{children}</span>;
const cityOf = addr => {
  const a = String(addr || '').replace(/^\s*(東京都|北海道|京都府|大阪府|[^\s都道府県]{2,3}県)/, '');
  return (a.match(/^(.+?[市区町村])/) || ['', ''])[1];
};
const tailOf = addr => (String(addr || '').match(/[0-9０-９][0-9０-９\-－丁目番地号]*$/) || ['〇〇'])[0];

export default function ScriptV2({ spec, list, row, myNumber, renderLegacy, rebuttal }) {
  const [sub, setSub] = useState('dai');
  const [modeSel, setModeSel] = useState(spec?.mode === 'online' ? 'online' : 'face');
  const mode = spec?.mode === 'face' ? 'face' : spec?.mode === 'online' ? 'online' : modeSel;
  const client = spec?.client || list?.company?.replace(/株式会社|有限会社/g, '').trim() || '';
  const boss = spec?.boss || '〇〇';
  const grp = row?.industry_group && row.industry_group !== 'その他' ? row.industry_group : null;
  const noun = spec?.noun || (grp && IND_NOUN[grp]) || null;
  const rec = spec?.reception || (grp && IND_RECEPTION[grp]) || spec?.reception_fallback || null;
  const sur = String(row?.representative || '').split(/[\s　]/)[0] || '〇〇';
  const city = cityOf(row?.address);
  const ngList = [...(spec?.ng || [])];
  const outs = [...OUTS.map(o => [o[0], o[1], o[2].replaceAll('{client}', client), o[3]]), ...(spec?.outs || []).map(o => [o.who || '社長', o.q, o.a, o.why || ''])];
  // リストに登録されているアウト返し（{reception:[{q,a}], president:[...]}）も足す
  const listOuts = [];
  for (const [k, w] of [['reception', '受付'], ['president', '社長']]) for (const x of (rebuttal?.[k] || [])) if (x?.q && x?.a) listOuts.push([w, x.q, x.a, 'このリストの登録']);

  const hasText = !!spec?.text || !!spec?.legacy;
  const tail = spec?.pitch_tail || 'その会社が具体的にどういった会社で、御社が将来的にM&Aをした際にどういったメリットがあるのか';
  const pitchMiddle = () => {
    if (spec?.pitch === 'custom') return <><C>{spec.pitch_text}</C>、</>;
    if (spec?.pitch === 'nohint') return <>今回お電話したのが、<C>{spec?.nohint || '御社の事業内容等をお調べさせていただいた上で、将来的な資本提携の可能性について、ぜひともお力添えさせていただきたく、将来的なお相手候補先や、その際の御社にとってのメリット等々も詳細に資料におまとめの上、ぜひとも30分でお伝えできればと思っておりまして'}</C>、</>;
    if (spec?.pitch === 'buyer') return <>今回、<C>{spec?.buyer || '（買い手の言い方）'}</C>が上がっておりましてですね、<C>{tail}</C>、そちらについてぜひともお話させていただきたく思っておりまして、</>;
    return <>今回、とある我々と従前からお付き合いのある会社が、{spec?.shimei && <C>指名ではないものの、</C>}御社のような会社と将来的にぜひとも一緒に成長していきたいというお話が上がっておりましてですね、{tail}、そちらについてぜひともお話させていただきたく思っておりまして、</>;
  };
  const d1 = <K>〇日の〇曜日</K>, d2 = <K>〇日の〇曜日</K>;

  return (
    <div>
      <div className="st3">
        <button className={sub === 'dai' ? 'on' : ''} onClick={() => setSub('dai')}>台本</button>
        <button className={sub === 'out' ? 'on' : ''} onClick={() => setSub('out')}>アウト返し</button>
        <button className={sub === 'ng' ? 'on' : ''} onClick={() => setSub('ng')}>NGワード<span className="bd2">{NG_ALL.length + ngList.length}</span></button>
      </div>

      {sub === 'dai' && (
        <div className="sv on">
          {hasText || !spec ? (renderLegacy ? renderLegacy() : <ScriptBody text={spec?.text || ''} row={row} />) : (
            <>
              <div className="lg3"><span><i style={{ background: '#E8F2FC' }} />業種ごと（{grp || row?.industry_label || list?.industry || '業種'}）</span><span><i style={{ background: '#F7F0E1' }} />クライアント・リストごと</span><span><i style={{ background: '#EEF0F3' }} />この会社・今日</span></div>
              {spec.mode === 'both' && (
                <div className="mrow"><span>アポの形式</span>
                  <span className="sw2"><button className={mode === 'face' ? 'on' : ''} onClick={() => setModeSel('face')}>対面</button><button className={mode === 'online' ? 'on' : ''} onClick={() => setModeSel('online')}>オンライン</button></span>
                  <small>{spec.mode_note || '注意事項②：対面でもオンラインでも可'}</small></div>
              )}
              <div className="blk"><h5>受付</h5>
                <div className="ln"><C>{client}</C>の（あなたの名前）です。お世話様です。<K>{sur}社長</K>をお願いします。</div>
                {spec.reception_say
                  ? <div className="ln"><span className="who">用件は聞かれる前に一息で</span><C>{spec.reception_say}</C></div>
                  : <div className="ln"><span className="who">ご用件は？と聞かれたら</span><K>{city || '〇〇市'}</K>の{rec ? (spec.reception ? <C>{rec}</C> : <I>{rec}</I>) : <Miss>（業種の一文）</Miss>}{spec.reception_suffix ?? 'アライアンス'}の件とお伝えください。</div>}
              </div>
              <div className="blk"><h5>受付・不在のとき</h5>
                <div className="ln">承知しました。何時頃でしたらお戻りでしょうか。<span className="who">分からなければ</span>折り返しをお願いできますでしょうか。番号は <K>{myNumber || 'あなたの番号'}</K> です。<span className="who">「こちらには来ない」→</span>ふだんはどちらの事業所にいらっしゃいますか。そちらのお電話番号を伺えますでしょうか。<span className="who">「退任した・代わった」→</span>その場で「社長名を調べる」を押してから、お礼を言って切る（新しい社長の名前は聞かなくてよい）。</div>
              </div>
              <div className="blk"><h5>社長</h5>
                <div className="ln">お世話になります。私、<C>{client}</C>の（あなたの名前）と申します。<K>{sur}社長</K>、ただいまお時間1分だけよろしいでしょうか？すぐに終わらせます。</div>
                <div className="ln"><span className="who">（「どうぞ」）</span>ありがとうございます。<br />まず、{spec.support ? <C>{spec.support}</C> : <>我々が{noun ? <I>{noun}</I> : <Miss>（〇〇会社様）</Miss>}の資本提携のご支援をしておりまして</>}、{pitchMiddle()}社長もなかなかお忙しいかと思いますが、
                  {mode === 'face' ? (spec.visit_face ? <><C>{spec.visit_face}</C>、</> : <>私の上長の者が、{d1}と{d2}に、ちょうど御社のすぐ近くにおりますので、その際にぜひともお話しできればと思っておりましたが、</>) : <>私の上長の者から一度<C>オンラインで</C>お話しさせていただければと思っておりましたが、</>}
                  {d1}か、{d2}でしたら、どちらの方がご都合よろしいでしょうか？</div>
                {(spec.extra || []).map((x, i) => <div key={i} className="ln"><C>{x}</C></div>)}
              </div>
              <div className="blk"><h5>アポが取れたら（{mode === 'face' ? '対面' : 'オンライン'}）</h5>
                {mode === 'face'
                  ? <div className="ln">お伺いさせていただく先は、末尾<K>{tailOf(row?.address)}</K>の御社の住所の方でよろしいでしょうか？<span className="who">（「はい」）ありがとうございます。</span></div>
                  : <div className="ln">後ほどオンライン面談のリンクをお送りさせていただきますので、社長のメールアドレスか携帯番号をお伺いしてもよろしいでしょうか？<span className="who">（聞いたら）</span>ありがとうございます。念のため復唱させていただきます。〇〇でお間違いございませんでしょうか？</div>}
                <div className="ln">ちなみに社長、今までにこういったM&Aに関するご面談というのはご経験ございますでしょうか？<span className="who">（「あります」）</span>左様でしたか。その際、ご検討が進まなかった理由などございますでしょうか？</div>
                <div className="ln"><span className="who">（答え）</span>ありがとうございます。{spec.pre_q && <C>{spec.pre_q}</C>}ちなみに、<K>{sur}社長</K>として、お相手様や金額次第で将来的にM&Aをする可能性というのは、少しでもございますでしょうか？</div>
                <div className="ln"><span className="who">（答え）</span>ありがとうございます。でしたら、<K>〇月〇日〇曜日の〇時</K>に、{spec.closing_who ? <C>{spec.closing_who}</C> : <>私の上長の<C>{boss}</C>というもの</>}が{mode === 'face' ? 'お伺い' : '担当'}させていただきますので、どうぞよろしくお願いいたします。</div>
                {(spec.after_extra || []).map((x, i) => <div key={i} className="ln"><C>{x}</C></div>)}
                {spec.after && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>アポ取得後：{spec.after}</div>}
              </div>
            </>
          )}
        </div>
      )}

      {sub === 'out' && (
        <div className="sv on">
          <div className="lg3">押すと返しが開く。言われた言葉から探す</div>
          {[...outs, ...listOuts].map(([w, q, a, why], i) => (
            <details key={i} className="oq"><summary><span className="tg2">{w}</span>{q}</summary><div className="ans">{a}{why && <div className="why">{why}</div>}</div></details>
          ))}
        </div>
      )}

      {sub === 'ng' && (
        <div className="sv on">
          <div className="ngh">全クライアント共通</div>
          <ul className="ng2">{NG_ALL.map(([a, b]) => <li key={a}><b>{a}</b><small>{b}</small></li>)}</ul>
          <div className="ngh">このリスト（{list?.company}・{list?.industry}）</div>
          <ul className="ng2">{ngList.length ? ngList.map((x, i) => <li key={i}><b>{x}</b></li>) : <li><b>このリストだけのNGは無し</b></li>}</ul>
        </div>
      )}
    </div>
  );
}
