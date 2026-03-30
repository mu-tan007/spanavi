import { useNavigate } from 'react-router-dom'

const C = {
  navy: '#0D2247',
  navyLight: '#132D5E',
  blue: '#0176D3',
  blueDark: '#032D60',
  white: '#ffffff',
  textMuted: '#94A3B8',
  textLight: '#CBD5E1',
  gold: '#c8a45a',
  bg: '#f5f0e8',
  cardBg: 'rgba(255,255,255,0.06)',
  cardBorder: 'rgba(255,255,255,0.10)',
}

// 正式ロゴ: シールド + Spanavi テキスト（白+ゴールド、ダーク背景用）
const LOGO_FULL_WHITE = '/spanavi-logo-full-white.svg'
// 正式ロゴ: シールド + Spanavi テキスト（ネイビー+ゴールド、ライト背景用）
const LOGO_FULL = '/spanavi-logo-full.svg'

const features = [
  {
    icon: '📞',
    title: '架電管理',
    desc: 'コールリスト・架電ステータス・通話履歴を一元管理。チーム全体の架電状況をリアルタイムで把握。',
  },
  {
    icon: '📋',
    title: 'アポ管理',
    desc: 'アポイント獲得から商談管理まで。自動集計で成果を可視化し、チームの目標達成をサポート。',
  },
  {
    icon: '🎙️',
    title: '録音・文字起こし',
    desc: 'Zoom連携で通話を自動録音。AIによる文字起こしと分析で、トーク品質を継続的に改善。',
  },
  {
    icon: '📊',
    title: 'チーム分析',
    desc: '活動ランキング・時間帯別分析・パフォーマンス指標で、データドリブンなチーム運営を実現。',
  },
  {
    icon: '🎭',
    title: 'ロープレ研修',
    desc: 'ロールプレイング研修を録画・AI分析。新人教育の品質を均一化し、即戦力化を加速。',
  },
  {
    icon: '🏢',
    title: 'CRM',
    desc: 'クライアント情報・対応履歴・業種ルールを集約。架電先の情報を瞬時に確認して成約率向上。',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: "'Noto Sans JP', sans-serif", color: C.white, overflowX: 'hidden' }}>
      <style>{`
        .lp-btn { transition: all 0.2s ease; cursor: pointer; border: none; font-family: 'Noto Sans JP', sans-serif; }
        .lp-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
        .lp-card { transition: transform 0.2s ease; }
        .lp-card:hover { transform: translateY(-4px); }
        @media (max-width: 768px) {
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-hero-title { font-size: 28px !important; }
          .lp-hero-sub { font-size: 15px !important; }
          .lp-header-inner { padding: 0 16px !important; }
          .lp-section { padding: 60px 16px !important; }
          .lp-pricing-card { padding: 32px 24px !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(13,34,71,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div className="lp-header-inner" style={{
          maxWidth: 1100, margin: '0 auto', padding: '0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64,
        }}>
          <div style={{ cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src={LOGO_FULL_WHITE} alt="Spanavi" style={{ height: 36 }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="lp-btn" onClick={() => navigate('/login')} style={{
              background: 'transparent', color: C.white, padding: '8px 20px',
              borderRadius: 6, fontSize: 13, fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.25)',
            }}>
              ログイン
            </button>
            <button className="lp-btn" onClick={() => navigate('/signup')} style={{
              background: C.blue, color: C.white, padding: '8px 20px',
              borderRadius: 6, fontSize: 13, fontWeight: 600,
            }}>
              無料で始める
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{
        background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyLight} 40%, ${C.blueDark} 100%)`,
        paddingTop: 140, paddingBottom: 100, textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(1,118,211,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ marginBottom: 24 }}>
            <img src={LOGO_FULL_WHITE} alt="Spanavi" style={{ height: 56 }} />
          </div>
          <h1 className="lp-hero-title" style={{
            fontSize: 40, fontWeight: 800, lineHeight: 1.4, marginBottom: 20,
            letterSpacing: -0.5,
          }}>
            架電チームの成果を<br />最大化する
          </h1>
          <p className="lp-hero-sub" style={{
            fontSize: 17, color: C.textLight, lineHeight: 1.8, marginBottom: 40,
            maxWidth: 560, margin: '0 auto 40px',
          }}>
            架電管理・アポ管理・録音分析・チーム分析を一つに。<br />
            データドリブンな架電チーム運営を実現するSaaS。
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="lp-btn" onClick={() => navigate('/signup')} style={{
              background: C.blue, color: C.white, padding: '14px 36px',
              borderRadius: 8, fontSize: 15, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(1,118,211,0.3)',
            }}>
              無料で始める
            </button>
            <button className="lp-btn" onClick={() => {
              document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
            }} style={{
              background: 'rgba(255,255,255,0.08)', color: C.white, padding: '14px 36px',
              borderRadius: 8, fontSize: 15, fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.15)',
            }}>
              機能を見る
            </button>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="lp-section" style={{
        background: C.navy, padding: '80px 32px',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{
            textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 12,
          }}>
            主な機能
          </h2>
          <p style={{
            textAlign: 'center', color: C.textMuted, fontSize: 14, marginBottom: 48,
          }}>
            架電チームに必要な機能をオールインワンで提供
          </p>
          <div className="lp-features-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
          }}>
            {features.map((f) => (
              <div key={f.title} className="lp-card" style={{
                background: C.cardBg, border: `1px solid ${C.cardBorder}`,
                borderRadius: 12, padding: 28,
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-section" style={{
        background: `linear-gradient(180deg, ${C.navyLight} 0%, ${C.navy} 100%)`,
        padding: '80px 32px',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>料金</h2>
          <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 40 }}>
            シンプルな料金体系。必要な分だけ。
          </p>
          <div className="lp-pricing-card" style={{
            background: C.cardBg, border: `1px solid ${C.cardBorder}`,
            borderRadius: 16, padding: '40px 32px',
          }}>
            <div style={{ marginBottom: 32 }}>
              <span style={{ fontSize: 14, color: C.textMuted }}>月額</span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                <span style={{ fontSize: 48, fontWeight: 800, color: C.white }}>¥7,700</span>
                <span style={{ fontSize: 14, color: C.textMuted }}>/ユーザー（税込）</span>
              </div>
            </div>
            <div style={{
              borderTop: `1px solid ${C.cardBorder}`, paddingTop: 24, marginBottom: 32,
            }}>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
                初期費用: <span style={{ color: C.white, fontWeight: 600 }}>¥110,000</span>（税込）
              </div>
              <ul style={{
                listStyle: 'none', padding: 0, margin: 0,
                display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
              }}>
                {[
                  '全機能利用可能',
                  'ユーザー数に応じた柔軟な課金',
                  '導入サポート付き',
                  'Zoom / Slack 連携',
                ].map((item) => (
                  <li key={item} style={{ fontSize: 13, color: C.textLight, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: C.blue, fontSize: 16 }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <button className="lp-btn" onClick={() => navigate('/signup')} style={{
              background: C.blue, color: C.white, padding: '14px 40px',
              borderRadius: 8, fontSize: 15, fontWeight: 700, width: '100%',
              boxShadow: '0 4px 20px rgba(1,118,211,0.3)',
            }}>
              申し込む
            </button>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-section" style={{
        background: C.navy, padding: '80px 32px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
            架電チームの生産性を変えませんか？
          </h2>
          <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 32, lineHeight: 1.7 }}>
            導入は最短即日。まずはお気軽にお申し込みください。
          </p>
          <button className="lp-btn" onClick={() => navigate('/signup')} style={{
            background: C.blue, color: C.white, padding: '14px 40px',
            borderRadius: 8, fontSize: 15, fontWeight: 700,
            boxShadow: '0 4px 20px rgba(1,118,211,0.3)',
          }}>
            無料で始める
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        background: C.navy, borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '32px 32px', textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <img src={LOGO_FULL_WHITE} alt="Spanavi" style={{ height: 28 }} />
        </div>
        <p style={{ fontSize: 11, color: C.textMuted }}>
          © {new Date().getFullYear()} Spanavi. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
