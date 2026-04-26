import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Phone, Calendar, Mic, BarChart3, ListChecks, Users,
  ShieldCheck, Sparkles, ArrowRight, ChevronRight, Plus, Minus,
  TrendingUp, Target, Zap, Database,
} from 'lucide-react';
import SpanaviLogo from '../common/SpanaviLogo';
import { BRAND, FONTS, SHADOW, RADIUS } from '../../constants/brand';

// ============================================================
// Spanavi LP — M&A ソーシング / 営業組織向け SaaS
// クリーンB2B SaaS デザイン (hummingbird.co の構造を参考に再設計)
// ============================================================

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ background: BRAND.white, color: BRAND.navy, fontFamily: FONTS.body, lineHeight: 1.6 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap');
        body { margin: 0; }
        a { color: inherit; text-decoration: none; }
        button { font-family: inherit; }
        .lp-fade-in { animation: lpFade 0.6s ease both; }
        @keyframes lpFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      <Nav onLogin={() => navigate('/login')} onSignup={() => navigate('/signup')} />

      <Hero onSignup={() => navigate('/signup')} onLogin={() => navigate('/login')} />

      <ClientLogoStrip />

      <PlatformOverview />

      <FeatureGrid />

      <FeatureAccordion />

      <UseCases />

      <MetricsBlock />

      <CTABlock onSignup={() => navigate('/signup')} />

      <Footer />
    </div>
  );
}

// ============================================================
// Nav
// ============================================================
function Nav({ onLogin, onSignup }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: scrolled ? 'rgba(255,255,255,0.92)' : BRAND.white,
      backdropFilter: scrolled ? 'saturate(180%) blur(8px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(8px)' : 'none',
      borderBottom: scrolled ? `1px solid ${BRAND.gray200}` : '1px solid transparent',
      transition: 'all 0.2s',
    }}>
      <div style={{ ...container, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
        <SpanaviLogo size={26} textSize={18} uidSuffix="lp-nav" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#features" style={navLink}>機能</a>
          <a href="#usecases" style={navLink}>導入事例</a>
          <a href="#metrics" style={navLink}>実績</a>
          <button onClick={onLogin} style={{ ...btnGhost, padding: '8px 16px', fontSize: 13 }}>
            ログイン
          </button>
          <button onClick={onSignup} style={{ ...btnPrimary, padding: '9px 18px', fontSize: 13 }}>
            14日間無料で試す
          </button>
        </div>
      </div>
    </nav>
  );
}

// ============================================================
// Hero
// ============================================================
function Hero({ onSignup, onLogin }) {
  return (
    <section style={{ ...container, paddingTop: 88, paddingBottom: 72 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 72, alignItems: 'center' }}>
        <div className="lp-fade-in">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: RADIUS.pill,
            background: BRAND.blueWash, color: BRAND.blue,
            fontSize: 12, fontWeight: 600, marginBottom: 24,
            border: `1px solid ${BRAND.blueSoft}`,
          }}>
            <Sparkles size={13} /> 営業組織のための戦略 SaaS
          </div>

          <h1 style={{
            fontFamily: FONTS.display,
            fontSize: 60, fontWeight: 800, lineHeight: 1.08,
            color: BRAND.navy, margin: '0 0 20px',
            letterSpacing: '-0.02em',
          }}>
            ソーシングを、<br />
            <span style={{ color: BRAND.blue }}>体系化する。</span>
          </h1>

          <p style={{
            fontSize: 18, color: BRAND.gray600, lineHeight: 1.7,
            margin: '0 0 32px', maxWidth: 540,
          }}>
            架電・アポ獲得・録音分析・パフォーマンス可視化まで。
            M&A ソーシングや営業組織が必要とするすべての機能を、ひとつのプラットフォームに。
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 36 }}>
            <button onClick={onSignup} style={{ ...btnPrimary, padding: '14px 28px', fontSize: 14 }}>
              14日間無料で試す <ArrowRight size={16} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
            </button>
            <button onClick={onLogin} style={{ ...btnGhost, padding: '14px 28px', fontSize: 14 }}>
              ログイン
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 12, color: BRAND.gray500 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} color={BRAND.blue} /> クレジットカード不要
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} color={BRAND.blue} /> 5分で導入
            </span>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="lp-fade-in" style={{ position: 'relative', height: 480 }}>
      {/* メインカード: ダッシュボード風 */}
      <div style={{
        position: 'absolute', top: 20, left: 0, right: 0,
        background: BRAND.white, borderRadius: RADIUS.lg,
        border: `1px solid ${BRAND.gray200}`, boxShadow: SHADOW.lg,
        padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.navy }}>本日のパフォーマンス</div>
          <div style={{ fontSize: 11, color: BRAND.gray500 }}>2026/04/26</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
          <StatCell label="架電数" value="1,284" delta="+12%" />
          <StatCell label="社長接続" value="87" delta="+8%" />
          <StatCell label="アポ獲得" value="14" delta="+22%" />
        </div>
        <BarChart />
      </div>
      {/* 装飾カード1 */}
      <div style={{
        position: 'absolute', bottom: 0, left: -20, width: 220,
        background: BRAND.navy, color: BRAND.white,
        borderRadius: RADIUS.lg, boxShadow: SHADOW.xl,
        padding: 18, transform: 'rotate(-2deg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Mic size={14} color={BRAND.blueLight} />
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>通話録音</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>株式会社○○</div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 28 }}>
          {[8, 14, 20, 24, 18, 22, 16, 12, 24, 18, 10, 14, 22, 16, 8].map((h, i) => (
            <div key={i} style={{
              width: 3, height: h, background: BRAND.blueLight, borderRadius: 2, opacity: 0.4 + i * 0.04,
            }} />
          ))}
        </div>
        <div style={{ fontSize: 9, color: BRAND.gray300, marginTop: 6 }}>AI 文字起こし完了</div>
      </div>
      {/* 装飾カード2 */}
      <div style={{
        position: 'absolute', top: 0, right: -20, width: 200,
        background: BRAND.white, borderRadius: RADIUS.lg,
        border: `1px solid ${BRAND.gray200}`, boxShadow: SHADOW.lg,
        padding: 16, transform: 'rotate(3deg)',
      }}>
        <div style={{ fontSize: 10, color: BRAND.gray500, marginBottom: 4 }}>今週のリーダー</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.navy, marginBottom: 10 }}>植木 帆希</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <TrendingUp size={12} color={BRAND.green} />
          <span style={{ color: BRAND.green, fontWeight: 700 }}>+34%</span>
          <span style={{ color: BRAND.gray500 }}>前週比</span>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value, delta }) {
  return (
    <div style={{ background: BRAND.gray50, borderRadius: RADIUS.md, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: BRAND.gray500, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.navy, fontFamily: FONTS.mono, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 10, color: BRAND.green, fontWeight: 700, marginTop: 2 }}>{delta}</div>
    </div>
  );
}

function BarChart() {
  const heights = [40, 55, 70, 50, 80, 65, 90, 75, 85, 95, 70, 85];
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
      {heights.map((h, i) => (
        <div key={i} style={{
          flex: 1, height: `${h}%`,
          background: i === heights.length - 1 ? BRAND.blue : BRAND.blueSoft,
          borderRadius: '3px 3px 0 0',
        }} />
      ))}
    </div>
  );
}

// ============================================================
// Client logo strip (placeholder)
// ============================================================
function ClientLogoStrip() {
  const labels = ['M&Aソーシング', '○○キャピタル', '△△アドバイザリー', '株式会社□□', 'リーガル◇◇', '××パートナーズ'];
  return (
    <section style={{ background: BRAND.gray50, padding: '40px 0', borderTop: `1px solid ${BRAND.gray150}`, borderBottom: `1px solid ${BRAND.gray150}` }}>
      <div style={container}>
        <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: BRAND.gray500, marginBottom: 18, textTransform: 'uppercase' }}>
          導入企業
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 32 }}>
          {labels.map((l, i) => (
            <div key={i} style={{
              fontSize: 14, fontWeight: 700, color: BRAND.gray400,
              fontFamily: "'Outfit', sans-serif", letterSpacing: 1,
            }}>{l}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Platform overview
// ============================================================
function PlatformOverview() {
  return (
    <section id="features" style={{ ...container, paddingTop: 96, paddingBottom: 24 }}>
      <div style={{ maxWidth: 720 }}>
        <div style={eyebrowStyle}>PLATFORM</div>
        <h2 style={h2Style}>ソーシングの全工程を、ひとつのプラットフォームへ。</h2>
        <p style={{ fontSize: 16, color: BRAND.gray600, lineHeight: 1.8, margin: '24px 0 0' }}>
          架電リスト管理、コールフロー、録音、アポ管理、KPI分析、給与計算まで。
          いままで Excel・Google スプレッドシート・録音ツール・チャットに散らばっていた業務を、
          Spanavi で一気通貫に管理できます。
        </p>
      </div>
    </section>
  );
}

// ============================================================
// Feature grid
// ============================================================
function FeatureGrid() {
  const features = [
    { Icon: Phone,     title: '架電管理',         desc: 'リスト・架電フロー・ステータスを統合。架電の進捗状況をリアルタイムでチームと共有。' },
    { Icon: Calendar,  title: 'アポ管理',         desc: '獲得アポを案件単位で追跡。事前確認・面談・契約まで全工程をパイプライン管理。' },
    { Icon: Mic,       title: '録音 & AI 分析',    desc: 'Zoom 連携で通話を自動録音。AI が文字起こし・要約・温度感を解析。' },
    { Icon: BarChart3, title: '戦略分析',         desc: '時間帯×曜日のヒートマップ、ファネル、ランキング。データから打ち手を導く。' },
  ];
  return (
    <section style={{ ...container, paddingTop: 56, paddingBottom: 96 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {features.map((f, i) => (
          <div key={i} style={{
            background: BRAND.white, padding: '28px 24px',
            border: `1px solid ${BRAND.gray200}`, borderRadius: RADIUS.lg,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = SHADOW.md; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = BRAND.gray200; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: RADIUS.md,
              background: BRAND.blueWash, color: BRAND.blue, marginBottom: 16,
            }}>
              <f.Icon size={20} strokeWidth={2} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: BRAND.navy, margin: '0 0 8px' }}>{f.title}</h3>
            <p style={{ fontSize: 13, color: BRAND.gray600, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Feature accordion
// ============================================================
function FeatureAccordion() {
  const items = [
    { title: 'データドリブンな意思決定', desc: '時間帯・曜日・業種・チームでセグメントしたヒートマップとファネルで、「いつ・誰が・何の業種に架電すべきか」を客観的に判断できます。' },
    { title: '自動化された録音と AI 文字起こし', desc: 'Zoom Phone と連携し、通話終了と同時に録音アップロード・AI 文字起こし・温度感解析が走ります。レビューにかかる時間を90%削減。' },
    { title: '明確な役割と給与計算', desc: 'ランク・役割・チームを事業ごとに定義。インセンティブ率と役割ボーナスを GUI で管理し、月次の給与を自動計算します。' },
    { title: 'チーム横断のリアルタイム可視化', desc: 'ライブステータス、ランキング、推奨リスト。チーム全員の動きが一画面に集約され、リーダーは即座に状況把握とコーチングができます。' },
    { title: 'マルチ事業対応', desc: 'ソーシング、人材紹介、M&Aアドバイザリー等、複数事業を同一組織内で運営。事業ごとに独立したランク・役割・KPI 体系を持てます。' },
  ];
  const [open, setOpen] = useState(0);
  return (
    <section style={{ background: BRAND.gray50, padding: '96px 0', borderTop: `1px solid ${BRAND.gray150}` }}>
      <div style={container}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={eyebrowStyle}>WHY SPANAVI</div>
          <h2 style={{ ...h2Style, maxWidth: 680, margin: '0 auto' }}>
            プロフェッショナル組織のための、信頼できる基盤。
          </h2>
        </div>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          {items.map((it, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${BRAND.gray200}` }}>
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                style={{
                  width: '100%', padding: '24px 0', background: 'transparent', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  fontSize: 18, fontWeight: 700, color: BRAND.navy,
                  fontFamily: FONTS.display,
                }}>{it.title}</span>
                {open === i ? <Minus size={20} color={BRAND.blue} /> : <Plus size={20} color={BRAND.gray500} />}
              </button>
              {open === i && (
                <div style={{ paddingBottom: 24, fontSize: 14, color: BRAND.gray600, lineHeight: 1.8 }}>
                  {it.desc}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Use cases
// ============================================================
function UseCases() {
  const cases = [
    { Icon: Target,    title: 'M&A 仲介・アドバイザリー', desc: '譲渡候補企業へのソーシング架電を体系化。獲得アポから商談・成約までを一気通貫で管理。' },
    { Icon: Users,     title: 'エグゼクティブサーチ',    desc: '候補者へのアプローチ進捗、面談履歴、紹介ファームとの連携をすべて Spanavi 上で。' },
    { Icon: Database,  title: '法人営業・代行ソーシング', desc: '大量架電を行う組織向け。リスト管理から成果可視化、給与計算までを自動化。' },
  ];
  return (
    <section id="usecases" style={{ ...container, paddingTop: 96, paddingBottom: 96 }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={eyebrowStyle}>USE CASES</div>
        <h2 style={{ ...h2Style, maxWidth: 680, margin: '0 auto' }}>
          こんな組織に選ばれています。
        </h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {cases.map((c, i) => (
          <div key={i} style={{
            background: BRAND.white, padding: '32px 28px',
            border: `1px solid ${BRAND.gray200}`, borderRadius: RADIUS.lg,
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: RADIUS.md,
              background: BRAND.navy, color: BRAND.white, marginBottom: 20,
            }}>
              <c.Icon size={22} strokeWidth={2} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: BRAND.navy, margin: '0 0 10px' }}>{c.title}</h3>
            <p style={{ fontSize: 13.5, color: BRAND.gray600, lineHeight: 1.75, margin: 0 }}>{c.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Metrics
// ============================================================
function MetricsBlock() {
  const stats = [
    { value: '40,000+', label: '月間架電数' },
    { value: '6.5%',   label: '社長接続率' },
    { value: '0.8%',   label: 'アポ獲得率' },
    { value: '<5min',  label: '初期セットアップ' },
  ];
  return (
    <section id="metrics" style={{ background: BRAND.navy, padding: '80px 0', color: BRAND.white }}>
      <div style={container}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ ...eyebrowStyle, color: BRAND.blueLight }}>BY THE NUMBERS</div>
          <h2 style={{ ...h2Style, color: BRAND.white, maxWidth: 680, margin: '0 auto' }}>
            実運用でも証明されている、確かな成果。
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: FONTS.mono, fontSize: 44, fontWeight: 800,
                color: BRAND.white, letterSpacing: '-0.02em', marginBottom: 8,
              }}>{s.value}</div>
              <div style={{ fontSize: 13, color: BRAND.gray300, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// CTA
// ============================================================
function CTABlock({ onSignup }) {
  return (
    <section style={{ ...container, paddingTop: 96, paddingBottom: 96, textAlign: 'center' }}>
      <h2 style={{ ...h2Style, maxWidth: 680, margin: '0 auto 16px' }}>
        まずは14日間、無料で。
      </h2>
      <p style={{ fontSize: 16, color: BRAND.gray600, lineHeight: 1.7, marginBottom: 32, maxWidth: 540, margin: '0 auto 32px' }}>
        クレジットカード不要、5分で導入。あなたのチームに合うかどうか、実データで判断してください。
      </p>
      <button onClick={onSignup} style={{ ...btnPrimary, padding: '16px 32px', fontSize: 15 }}>
        14日間無料で試す <ArrowRight size={16} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
      </button>
    </section>
  );
}

// ============================================================
// Footer
// ============================================================
function Footer() {
  const cols = [
    { title: 'プロダクト', links: [
      { label: '機能', href: '#features' },
      { label: '導入事例', href: '#usecases' },
      { label: '実績', href: '#metrics' },
    ]},
    { title: 'リソース', links: [
      { label: 'ログイン', href: '/login' },
      { label: '新規登録', href: '/signup' },
    ]},
    { title: '会社', links: [
      { label: '特定商取引法', href: '/tokushoho' },
    ]},
  ];
  return (
    <footer style={{ borderTop: `1px solid ${BRAND.gray200}`, background: BRAND.white, padding: '48px 0 32px' }}>
      <div style={container}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(3, 1fr)', gap: 40, marginBottom: 40 }}>
          <div>
            <SpanaviLogo size={28} textSize={20} uidSuffix="lp-foot" />
            <p style={{ fontSize: 12, color: BRAND.gray500, lineHeight: 1.7, marginTop: 14, maxWidth: 280 }}>
              ソーシングを、体系化する。
            </p>
          </div>
          {cols.map((c, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.gray500, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                {c.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.links.map(l => (
                  <a key={l.label} href={l.href} style={{ fontSize: 13, color: BRAND.gray700 }}>{l.label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${BRAND.gray150}`, paddingTop: 24, fontSize: 11, color: BRAND.gray500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>© {new Date().getFullYear()} Spanavi. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}

// ============================================================
// Shared styles
// ============================================================
const container = {
  maxWidth: 1180, margin: '0 auto', padding: '0 32px',
};
const navLink = {
  fontSize: 13, fontWeight: 500, color: BRAND.gray700,
};
const eyebrowStyle = {
  display: 'inline-block',
  fontSize: 11, fontWeight: 700, color: BRAND.blue,
  letterSpacing: '0.18em', textTransform: 'uppercase',
  marginBottom: 14,
};
const h2Style = {
  fontFamily: FONTS.display,
  fontSize: 40, fontWeight: 800, color: BRAND.navy,
  lineHeight: 1.15, letterSpacing: '-0.015em', margin: 0,
};
const btnPrimary = {
  background: BRAND.navy, color: BRAND.white,
  border: 'none', borderRadius: RADIUS.md,
  fontWeight: 700, cursor: 'pointer',
  transition: 'all 0.15s',
};
const btnGhost = {
  background: 'transparent', color: BRAND.navy,
  border: `1px solid ${BRAND.gray200}`, borderRadius: RADIUS.md,
  fontWeight: 700, cursor: 'pointer',
  transition: 'all 0.15s',
};
