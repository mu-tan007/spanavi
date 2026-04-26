import { useState, useEffect } from 'react'
import { supabase, isInviteFlow } from '../lib/supabase'

const C = {
  navy: '#0D2247',
  navyDeep: '#021D47',
  gold: '#C8A84B',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  white: '#ffffff',
  textMuted: '#6B7280',
  textDark: '#111827',
  labelColor: '#374151',
  errorRed: '#DC2626',
  warnYellow: '#F59E0B',
  navyHover: '#1a3366',
  green: '#16a34a',
}

// パスワード強度評価 (0-3)
function evaluatePasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: C.gray200, hint: '6文字以上で設定' };
  if (password.length < 6) return { score: 0, label: '短すぎ', color: C.errorRed, hint: '最低6文字必要です' };

  // 弱いパスワード（よくあるもの）
  const weakPasswords = ['password', 'password1', 'password123', '12345678', 'qwerty', '11111111', '00000000', 'spanavi'];
  if (weakPasswords.some(p => password.toLowerCase().includes(p))) {
    return { score: 0, label: '危険', color: C.errorRed, hint: 'よくあるパスワードは推測されやすいです' };
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: '弱い', color: C.warnYellow, hint: '英大文字・数字・記号を混ぜてください' };
  if (score <= 3) return { score: 2, label: '普通', color: C.gold, hint: 'もう少し強くするには記号を追加' };
  return { score: 3, label: '強い', color: C.green, hint: '十分な強度です' };
}

export default function ResetPasswordPage({ onComplete }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    // 招待フローの場合、user_metadata から name を取り出して挨拶に使う
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.name) setUserName(user.user_metadata.name);
      else if (user?.email) setUserName(user.email.split('@')[0]);
    });
  }, []);

  const strength = evaluatePasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('パスワードは6文字以上で設定してください')
      return
    }
    if (strength.score === 0) {
      setError(strength.hint)
      return
    }
    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 4,
    border: '1px solid ' + C.gray200, fontSize: 14, color: C.textDark,
    fontFamily: "'Noto Sans JP'", outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box', background: C.white,
  }

  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.labelColor, marginBottom: 4 }

  const btnStyle = {
    width: '100%', padding: '12px 16px', borderRadius: 4, border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    background: C.navy, color: C.white, fontSize: 14, fontWeight: 600,
    fontFamily: "'Noto Sans JP'", opacity: loading ? 0.6 : 1,
  }

  // ── 完了画面 ──
  if (done && isInviteFlow) {
    return <WelcomeScreen userName={userName} onComplete={onComplete} />;
  }
  if (done) {
    return (
      <Container>
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
            ✓ パスワードを更新しました
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8, marginBottom: 24 }}>
            新しいパスワードでログインできます。
          </div>
          <button onClick={onComplete} style={{ ...btnStyle, cursor: 'pointer', opacity: 1 }}>
            ログインへ進む
          </button>
        </div>
      </Container>
    )
  }

  // ── 入力画面 ──
  return (
    <Container>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 6 }}>
          {isInviteFlow ? 'Spanavi へようこそ' : 'パスワード再設定'}
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
          {isInviteFlow
            ? <>{userName && <span style={{ color: C.navy, fontWeight: 600 }}>{userName} さん、</span>}<br />ログイン用のパスワードを設定してください</>
            : '新しいパスワードを入力してください'}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>
            {isInviteFlow ? 'パスワード' : '新しいパスワード'}<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="6文字以上"
            required autoFocus
            style={inputStyle}
            onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = '0 0 0 2px rgba(13,34,71,0.1)' }}
            onBlur={e => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = 'none' }}
          />
          {/* 強度メーター */}
          {password && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: i < strength.score ? strength.color : C.gray200,
                    transition: 'background 0.2s',
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                <span style={{ color: C.textMuted }}>{strength.hint}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>
            パスワード確認<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
          </div>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="もう一度入力"
            required
            style={inputStyle}
            onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = '0 0 0 2px rgba(13,34,71,0.1)' }}
            onBlur={e => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = 'none' }}
          />
          {confirmPassword && (
            <div style={{ marginTop: 4, fontSize: 10, color: confirmPassword === password ? C.green : C.errorRed }}>
              {confirmPassword === password ? '✓ 一致' : '一致しません'}
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 10px', fontSize: 12, color: C.errorRed, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 3 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={btnStyle}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.navyHover }}
          onMouseLeave={e => e.currentTarget.style.background = C.navy}
        >
          {loading ? '更新中...' : (isInviteFlow ? 'パスワードを設定して始める' : 'パスワードを更新')}
        </button>
      </form>
    </Container>
  )
}

// ─── ウェルカム画面（招待フロー完了後） ────────────────────
function WelcomeScreen({ userName, onComplete }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${C.navyDeep} 0%, ${C.navy} 100%)`,
      fontFamily: "'Noto Sans JP', sans-serif", padding: 20,
    }}>
      <div style={{
        background: C.white, borderRadius: 8, padding: '40px 36px',
        width: '100%', maxWidth: 540,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy, marginBottom: 6 }}>
            ようこそ、{userName} さん
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.7 }}>
            パスワード設定が完了しました。<br />
            Spanavi で何から始めますか？
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <ActionCard
            icon="👤" title="プロフィールを完成させる"
            description="氏名・連絡先・写真を登録"
            onClick={() => onComplete('mypage')}
          />
          <ActionCard
            icon="📞" title="架電リストを見る"
            description="今日のおすすめリストから始める"
            onClick={() => onComplete('lists')}
          />
          <ActionCard
            icon="📊" title="Dashboard を確認"
            description="自分の数字と、次の一手"
            onClick={() => onComplete('dashboard')}
          />
        </div>

        <button
          onClick={() => onComplete('dashboard')}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: 4,
            background: 'transparent', color: C.textMuted,
            border: 'none', fontSize: 12, cursor: 'pointer',
            fontFamily: "'Noto Sans JP'",
          }}
        >
          あとで（Dashboard へ）
        </button>
      </div>
    </div>
  );
}

function ActionCard({ icon, title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', padding: '14px 16px', borderRadius: 6,
        background: C.gray100, border: `1px solid ${C.gray200}`,
        cursor: 'pointer', textAlign: 'left',
        fontFamily: "'Noto Sans JP'", transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.boxShadow = '0 2px 8px rgba(13,34,71,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = C.gray100; e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ fontSize: 22, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted }}>{description}</div>
      </div>
      <div style={{ color: C.navy, fontSize: 18 }}>›</div>
    </button>
  );
}

function Container({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.navy, fontFamily: "'Noto Sans JP', sans-serif", padding: 20,
    }}>
      <div style={{
        background: C.white, border: '1px solid ' + C.gray200, borderRadius: 4,
        padding: 40, width: '100%', maxWidth: 420,
        boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
      }}>
        {children}
      </div>
    </div>
  );
}
