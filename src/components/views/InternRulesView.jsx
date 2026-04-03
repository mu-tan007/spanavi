import { useState, useEffect, useRef } from 'react';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';

const RULES = [
  {
    no: 1,
    title: '目的を明確にせよ',
    body: 'なぜMASPのインターンに入ったのか。「将来M&A仲介会社に行きたい」「ソーシング技術を身につけたい」——その"なぜ"を自分の言葉で語れない人間に、毎日400件500件の架電は絶対に続けられない。フルリモートで、家で一人、断られ続ける日々を乗り越えるには、揺るがない目的意識が必要だ。まずはそれを明確にするところから始めろ。',
  },
  {
    no: 2,
    title: '目標を数字で持て',
    body: '「頑張ります」は目標ではない。今月何件アポを取るのか、いくら稼ぐのか、数字で語れ。代表の篠宮は大学4年のインターン時代、毎朝「今月は死んでも○件取って○円稼ぐ」と自分の頭に刷り込んでから架電をしていた。だからこそ毎日600〜700件の架電をやり切り、月100件アポという前人未到の数字を叩き出せた。数字なき努力はただの作業だ。',
  },
  {
    no: 3,
    title: '毎朝、目標を声に出せ',
    body: '「言霊」という言葉がある通り、口に出すことで思考は現実に近づく。篠宮が尊敬するM&AキャピタルパートナーズのO社長は、創業当初から毎朝「M&Aキャピタルパートナーズを世界最高峰の投資銀行にする」と口にしている。毎朝、自分の目標と目的を声に出せ。そこから逆算して「今日何をすべきか」が明確になる。',
  },
  {
    no: 4,
    title: 'M&Aの社会的意義を理解せよ',
    body: '日本全国の中小企業は約336万社。そのうち約半数が後継者未定。社長の平均年齢はおよそ60歳。このまま何も手を打たなければ、向こう10年で約100万社が後継者問題を主因に消滅しかねない。中小企業は日本のGDPの付加価値額ベースで半数以上を占める。その消滅は国力の衰退を意味する。俺たちの営業は、それを食い止める仕事だ。この事実を腹の底から理解しろ。',
  },
  {
    no: 5,
    title: '断られても一切気にするな',
    body: '中小企業の社長の中には、M&Aに対して「乗っ取り」「ハゲタカ」というイメージを持っている人がまだ多い。「二度とかけてくるな」と罵倒されることもあるだろう。だが、M&Aの提案を聞く必要がない会社など一社もない。後継者がいると思い込んでいる社長でも、息子が本当に継ぐかは本人にしか分からない。承継が実現しなければ、従業員も取引先も全員が路頭に迷う。俺たちの提案は、それを防ぐためにある。断りの言葉は、相手の無知であって、お前の価値の否定ではない。',
  },
  {
    no: 6,
    title: '圧倒的な自信を持って架電せよ',
    body: '自信のない営業から提案を受けても、社長の気持ちは1ミリも動かない。「アポが取れたら数万円入るからお願いします」——そんな下心が滲む話しぶりでは絶対に取れない。正しい心持ちはこうだ。「社長、この話を聞かないと絶対に損ですよ。御社の将来にとってM&Aは切っても切り離せない選択肢です。この30分の提案を聞かないと、将来本当に損しますよ。いいんですか、社長?」——この気迫で挑め。',
  },
  {
    no: 7,
    title: '「何を話すか」より「どう話すか」',
    body: 'テレアポは3〜4分の勝負だ。30分〜1時間かける対面商談とは違う。中小企業のオーナー社長は、現場叩き上げで成り上がった人が多い。そんな相手に短時間で合理的な説明を冷静にしても響かない。大事なのは「こいつはイケてるな、ちょっと面白い提案をしてくれそうだから話くらい聞いてやるか」と思わせること。話の中身よりも、話しぶりで勝負しろ。',
  },
  {
    no: 8,
    title: '断られた時こそ余裕を見せろ',
    body: '「M&Aなんて興味ないよ」と言われた瞬間にたじろぐな。断られた時こそどっしりと構え、まず社長の言葉に寄り添え。その上で、再度メリットをパッションを込めて提示し、そのままの流れで日程調整に持ち込む。この一連の流れを自然にやれるようになれば、アポイントは必ず取れる。焦りは社長に見透かされる。余裕こそが最強の武器だ。',
  },
  {
    no: 9,
    title: '社長の時間を1秒たりとも無駄にするな',
    body: '中小企業の社長はとてつもなく忙しい。そんな社長の貴重な数分間を奪っている自覚を持て。自信のない話しぶりで社長に「なんだこいつ、俺の時間を無駄にしやがって」と思わせることは、営業として最大の失礼だ。数ある電話営業の中で「こいつと話して良かった」と思わせろ。死んでも社長の時間を無駄にするな。',
  },
  {
    no: 10,
    title: '組織内で圧倒的1位だけを目指せ',
    body: '2位も3位もいらない。毎月のアポ数・売上で、死んでも1位を取れ。「そんな狭い世界で1位を取っても」と思うかもしれないが、狭い世界で1位を取れない人間が、広い世界で大成することは絶対にない。MASPは国内M&Aインターンの中で最大規模であり、就職先を見ても圧倒的に質の高い人間が集まっている。ここで1位を取れば、社会に出てからもトップを取る力がつく。',
  },
  {
    no: 11,
    title: '学生気分を捨てろ、プロになれ',
    body: 'MASPでインターンをやる以上、学生という気分は完全に捨てろ。自分はM&Aソーシングのプロフェッショナルであるという自覚を持て。Slackの返信スピードと正確さ、敬語の使い方、期限の遵守——すべてにおいてプロとしての振る舞いを徹底しろ。約束を守り、嘘をつかない。ビジネスは信頼の上に成り立つ。その土台を学生のうちから築け。',
  },
  {
    no: 12,
    title: '仲間を称え、その上で勝て',
    body: 'チームメンバーが結果を出したら、心から称えろ。「自分なんか」と卑下するな。仲間の成功を一緒に喜んだ上で、「次は絶対に俺が勝つ」と闘志を燃やせ。自分が主役でありつつも、仲間と共に組織を作り上げるのがビジネスだ。称え合い、競い合い、高め合う。その循環の中にいる人間だけが、本当に強くなれる。',
  },
  {
    no: 13,
    title: 'できる人間に圧倒的に質問しろ',
    body: '結果を出すための最短ルートは、すでに結果を出している人間に聞くことだ。代表の篠宮でも、チームリーダーでも、売上を上げている仲間でも、とにかく質問しまくれ。ただし「教えてください」だけではダメだ。「社長にこう言われて、自分はこう返したけどアポに至らなかった。○○さんならどう返しますか?」——必ず自分の仮説を持った上で聞け。聞いて、取り入れて、即実行。このサイクルを誰よりも速く、大量に回した人間が勝つ。',
  },
  {
    no: 14,
    title: '報連相は"即"が鉄則',
    body: 'シフトのイレギュラー、架電中のクレーム、何かやらかした時——とりわけ問題が起きた時こそ、1秒でも早く報告しろ。一人で抱え込むな。問題の先送りで得をすることは何もない。報告し、解決策について判断を仰ぎ、すぐに対処する。このスピード感がプロとアマの分水嶺だ。',
  },
  {
    no: 15,
    title: '耐え忍べ、結果は必ず来る',
    body: '1日500件架電してもアポが0件の日はある。月間ドベに沈む時期もある。だが、そこで投げ出すな。適切な努力を続けていれば、中長期的に見て必ず結果は出る。これは紛れもない真実だ。成功は、耐え忍びながら正しい努力を継続した人間だけに訪れる。逆に結果が出ている時も驕るな。「どうすればさらに高みへ行けるか」だけを考えろ。1ミリでも毎日成長し続けること。',
  },
  {
    no: 16,
    title: '目的のためなら道を自分で作れ',
    body: '既存の道がなければ、自分で作ればいい。篠宮は大学4年の時、新卒採用の実績が一度もなかったM&Aキャピタルパートナーズにどうしても入りたかった。採用窓口すらない。ならば最高意思決定権者に直接会えばいいと考え、O社長が会食をする店を突き止め、1ヶ月半張り込んだ。そして会食後に直接声をかけ、その場で人事部長につないでもらい、新卒第1号として内定を勝ち取った。「恥ずかしい」「面倒くさい」は捨てろ。倫理に即した上で、目的達成のためには一切の手段を厭うな。',
  },
  {
    no: 17,
    title: '稼いだ金は浪費するな、投資せよ',
    body: 'MASPで結果を出せば、月50万〜100万の報酬が手に入る。実際に100万を超えた学生もいる。問題はその金をどう使うかだ。全額を飲み代に注ぎ込むのは愚の骨頂。自己投資、株式投資——金がさらに金を生む使い方、自分の市場価値を高める使い方をしろ。若くして稼ぐ力を得たなら、その力を複利で回す知恵も身につけろ。',
  },
  {
    no: 18,
    title: '稼いでも驕るな、人格者であれ',
    body: 'たとえ月100万稼げても、それで周囲を見下す人間は三流だ。若くして金を手にすると「自分は特別だ」と錯覚しがちだが、その傲慢さは必ず外に滲み出る。それを感じ取った瞬間、人は離れていく。孤独でビジネスはできない。結果を出しつつも周囲に柔らかく接し、協力を得られる人格者であれ。一流は、実力と謙虚さを両立させる。',
  },
  {
    no: 19,
    title: 'この環境を使い倒せ',
    body: 'MASPには、テレアポだけでなく、M&Aニュースの毎日共有、チームマネジメント経験、週次の成功事例共有、IT活用レクチャー、就活対策まで揃っている。国内M&Aインターンの中でも圧倒的な教育体制だ。この環境にいるだけで満足するな。チームメンバーもリーダーも代表の篠宮も、全員を使い倒せ。資本主義社会で大成するための礎を、ここで築き上げろ。',
  },
  {
    no: 20,
    title: '学生時代の営業経験は一生の武器になる',
    body: '学生のうちから何百回、何千回と中小企業の社長に営業をかける経験は、サークルやバイトでは絶対に手に入らない。篠宮自身、大学4年で何千回と社長を口説き続けた結果、20代前半で海千山千のオーナー社長と対等に話せるようになった。就職後の対面営業でも全く物怖じしない胆力は、このテレアポ経験から生まれた。MASPを卒業する頃には、圧倒的なコミュニケーション能力が身についているはずだ。その未来を信じて架電しろ。',
  },
  {
    no: 21,
    title: '規則正しい生活を徹底せよ',
    body: 'M&Aの世界で戦う人間はアスリートと同じだ。結果を出せば何千万、何億が入るが、そのためにはハードワークが必要であり、ハードワークを支えるのは健康な体だ。無駄な夜更かしをするな、酒は程々にしろ、朝は早く起きろ、三食健康的なものを食べろ。日中に全力で集中するために、生活リズムを整えろ。体をおろそかにしている人間は三流以下だ。短期で結果を出しても、体が壊れれば長くは戦えない。',
  },
  {
    no: 22,
    title: 'ここでの成功体験を引っ提げて社会に出ろ',
    body: '学生のうちにビジネスで圧倒的な成功体験を積むこと。MASPで1位を取り、その実績と自信を引っ提げて社会に出ていけば、怖いものはなくなる。君たちが想像する以上に、資本主義社会は残酷だ。中途半端な覚悟では生き残れない。だからこそ、今ここで本気になれ。MASPでの日々が、君たちのビジネスパーソン人生の原点になる。',
  },
];

function RuleCard({ rule, refCallback }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={refCallback}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#ffffff',
        borderRadius: 4,
        border: '1px solid #E5E7EB',
        borderLeft: `3px solid ${hovered ? NAVY : '#E5E7EB'}`,
        padding: '20px 22px',
        display: 'flex',
        gap: 16,
        transition: 'border-color 200ms ease',
        cursor: 'default',
      }}
    >
      {/* 番号バッジ */}
      <div style={{
        width: 40,
        height: 40,
        minWidth: 40,
        borderRadius: '50%',
        background: NAVY,
        color: rule.no === 1 ? GOLD : '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 13,
        flexShrink: 0,
      }}>
        {rule.no}
      </div>

      {/* テキスト */}
      <div>
        <p style={{
          fontWeight: 600,
          color: '#1F2937',
          fontSize: 15,
          marginBottom: 8,
          lineHeight: 1.4,
        }}>
          {rule.title}
        </p>
        <p style={{
          color: '#4B5563',
          fontSize: 13,
          lineHeight: 1.8,
        }}>
          {rule.body}
        </p>
      </div>
    </div>
  );
}

export default function InternRulesView() {
  const headerRef = useRef(null);
  const cardRefs = useRef([]);
  const footerRef = useRef(null);

  useEffect(() => {
    // ヘッダー: マウント時に上からフェードイン
    const headerEl = headerRef.current;
    if (headerEl) {
      headerEl.style.opacity = '0';
      headerEl.style.transform = 'translateY(-20px)';
      requestAnimationFrame(() => {
        headerEl.style.transition = 'opacity 600ms ease-out, transform 600ms ease-out';
        headerEl.style.opacity = '1';
        headerEl.style.transform = 'translateY(0)';
      });
    }

    // カード・フッター: スクロールでIntersection Observerによりフェードイン
    const cardEls = cardRefs.current.filter(Boolean);
    const footerEl = footerRef.current;
    const allEls = [...cardEls, footerEl].filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );

    cardEls.forEach((el, i) => {
      const delay = Math.min(Math.floor(i / 2) * 50, 300); // 2列なので行単位でstagger
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = `opacity 500ms ease-out ${delay}ms, transform 500ms ease-out ${delay}ms`;
      observer.observe(el);
    });

    if (footerEl) {
      footerEl.style.opacity = '0';
      footerEl.style.transform = 'translateY(20px)';
      footerEl.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
      observer.observe(footerEl);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ paddingBottom: 64, animation: 'fadeIn 0.3s ease' }}>

      {/* Page Header */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>22 Rules</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>インターン22か条</div>
      </div>

      {/* ヘッダーエリア */}
      <div
        ref={headerRef}
        style={{ background: NAVY, border: '1px solid #E5E7EB', borderRadius: 4, padding: '36px 40px', marginBottom: 32 }}
      >
        <div style={{ width: 48, height: 4, background: '#1E40AF', borderRadius: 2, marginBottom: 16 }} />
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#ffffff', marginBottom: 8, letterSpacing: '0.02em' }}>
          インターン22箇条
        </h1>
        <p style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 500 }}>
          M&amp;A Sourcing Partners, Inc.
        </p>
      </div>

      {/* カードグリッド */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 480px), 1fr))',
        gap: 20,
      }}>
        {RULES.map((rule, i) => (
          <RuleCard
            key={rule.no}
            rule={rule}
            refCallback={(el) => { cardRefs.current[i] = el; }}
          />
        ))}
      </div>

      {/* フッター */}
      <div
        ref={footerRef}
        style={{ marginTop: 64, textAlign: 'center', padding: '0 16px' }}
      >
        <p style={{ color: '#0D2247', fontSize: 22, fontWeight: 700, marginBottom: 12, letterSpacing: '0.04em' }}>
          以上、22箇条。
        </p>
        <p style={{ color: '#4B5563', fontSize: 15, marginBottom: 8 }}>
          これを胸に刻み、圧倒的な結果を出せ。
        </p>
        <p style={{ color: '#6B7280', fontSize: 13, fontWeight: 500 }}>
          代表取締役 篠宮 拓武
        </p>
      </div>
    </div>
  );
}
