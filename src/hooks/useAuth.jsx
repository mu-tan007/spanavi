import { useState, useEffect, useContext, createContext } from 'react'
import { supabase } from '../lib/supabase'
import { setOrgId, clearOrgId } from '../lib/orgContext'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

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
      (_event, session) => {
        setSession(session)
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
        // フォールバック：auth.usersのemailからmember_idを抽出してmembersから名前取得
        const { data: authUser } = await supabase.auth.getUser()
        const email = authUser?.user?.email || ''
        const match = email.match(/^user_(.+)@masp-internal\.com$/)
        if (match) {
          const memberId = match[1]
          const { data: member } = await supabase
            .from('members')
            .select('id, name, email, role, org_id')
            .eq('id', memberId)
            .single()
          if (member) {
            if (member.org_id) setOrgId(member.org_id)
            setProfile({ id: userId, name: member.name, email: member.email, role: member.role || 'caller', org_id: member.org_id })
            return
          }
        }
        // フォールバック2: 実メールアドレスでmembersテーブルを検索（外部テナント用）
        const { data: memberByEmail } = await supabase
          .from('members')
          .select('id, name, email, role, org_id')
          .eq('email', email)
          .single()
        if (memberByEmail) {
          if (memberByEmail.org_id) setOrgId(memberByEmail.org_id)
          setProfile({ id: userId, name: memberByEmail.name, email: memberByEmail.email, role: memberByEmail.role || 'caller', org_id: memberByEmail.org_id })
          return
        }

        console.warn('Profile fetch failed (RLS or missing row):', error?.message)
        setProfile(null)
      } else {
        // users テーブルから取得成功 → members テーブルから org_id を補完
        const { data: memberRow } = await supabase
          .from('members')
          .select('org_id')
          .eq('name', data.name)
          .single()
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
    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    clearOrgId()
    setSession(null)
    setProfile(null)
  }

  const value = {
    session,
    profile,
    loading,
    signIn,
    signOut,
    isAdmin: profile?.role === 'admin',
    isManager: profile?.role === 'admin' || profile?.role === 'manager',
    orgId: profile?.org_id || null,
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
