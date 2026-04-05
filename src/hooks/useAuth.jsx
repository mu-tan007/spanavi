import { useState, useEffect, useContext, createContext } from 'react'
import { supabase } from '../lib/supabase'
import { setOrgId, clearOrgId } from '../lib/orgContext'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    // 現在のセッションを取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session)
        if (event === 'PASSWORD_RECOVERY') {
          setRecoveryMode(true)
        }
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error || !data) {
        // フォールバック1: user_idでmembersを検索（RLSを通過しやすい最も確実な方法）
        const { data: memberByUserId } = await supabase
          .from('members')
          .select('id, name, email, rank, org_id')
          .eq('user_id', userId)
          .maybeSingle()
        if (memberByUserId) {
          if (memberByUserId.org_id) setOrgId(memberByUserId.org_id)
          setProfile({ id: userId, name: memberByUserId.name, email: memberByUserId.email, role: memberByUserId.rank || 'caller', org_id: memberByUserId.org_id })
          return
        }
        // フォールバック2: auth.usersのemailからmember_idを抽出してmembersから名前取得
        const { data: authUser } = await supabase.auth.getUser()
        const email = authUser?.user?.email || ''
        const match = email.match(/^user_(.+)@(?:masp-internal\.com|[a-f0-9-]+\.spanavi\.internal)$/)
        if (match) {
          const memberId = match[1]
          const { data: member } = await supabase
            .from('members')
            .select('id, name, email, rank, org_id')
            .eq('id', memberId)
            .single()
          if (member) {
            if (member.org_id) setOrgId(member.org_id)
            setProfile({ id: userId, name: member.name, email: member.email, role: member.rank || 'caller', org_id: member.org_id })
            return
          }
        }
        // フォールバック3: 実メールアドレスでmembersテーブルを検索（外部テナント用）
        const { data: memberByEmail } = await supabase
          .from('members')
          .select('id, name, email, rank, org_id')
          .eq('email', email)
          .maybeSingle()
        if (memberByEmail) {
          if (memberByEmail.org_id) setOrgId(memberByEmail.org_id)
          setProfile({ id: userId, name: memberByEmail.name, email: memberByEmail.email, role: memberByEmail.rank || 'caller', org_id: memberByEmail.org_id })
          return
        }

        console.warn('Profile fetch failed (RLS or missing row):', error?.message)
        setProfile(null)
      } else {
        // users テーブルから取得成功 → members テーブルから org_id を補完（user_idで一意検索）
        const { data: memberRow } = await supabase
          .from('members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const orgId = memberRow?.org_id || null
        if (orgId) setOrgId(orgId)
        setProfile({ ...data, org_id: orgId })
      }
    } catch (err) {
      console.error('Profile fetch error:', err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error

    // 異常ログイン検知（非同期・エラー無視）
    try {
      const userId = data.user?.id
      if (userId) {
        const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null)
        const ip = ipRes ? (await ipRes.json()).ip : 'unknown'
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
        fetch(`${supabaseUrl}/functions/v1/check-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({ user_id: userId, member_name: '', email: data.user?.email || email, ip_address: ip, user_agent: navigator.userAgent }),
        }).catch(e => console.warn('[Security] check-login error:', e))
      }
    } catch (e) { console.warn('[Security] check-login error:', e) }

    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    clearOrgId()
    setSession(null)
    setProfile(null)
  }

  const clearRecoveryMode = () => setRecoveryMode(false)

  const value = {
    session,
    profile,
    loading,
    signIn,
    signOut,
    isAdmin: profile?.role === 'admin',
    isManager: profile?.role === 'admin' || profile?.role === 'manager',
    orgId: profile?.org_id || null,
    recoveryMode,
    clearRecoveryMode,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
