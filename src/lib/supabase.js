import { createClient } from '@supabase/supabase-js'

// Supabase の auth-js は初期化時に URL の hash を処理して即座にクリアする。
// 「招待リンクからの初回ログイン」を検知するには、createClient より先に hash を読む必要がある。
// hash 例: #access_token=...&type=invite&...
const _initialHash = typeof window !== 'undefined' ? window.location.hash : ''
export const isInviteFlow = _initialHash.includes('type=invite')

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
