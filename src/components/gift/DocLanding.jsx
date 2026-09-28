import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { color, space, font } from '../../constants/design'

// フォーム営業で送った資料リンク（/d/:token）の中継ページ。
// 開かれたことを記録して、そのまま資料のPDFへ移る（間にボタンを挟まない）。
// 認証なしの公開ページ。設計: tasks/sekkei_form_eigyo_doc_tracking.md

const RECORD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/doc-view`
const DOC_URL = '/docs/spartia-uri-sourcing.pdf'

export default function DocLanding() {
  const { token } = useParams()

  useEffect(() => {
    let moved = false
    const go = () => {
      if (moved) return
      moved = true
      window.location.replace(DOC_URL)
    }
    // 記録を待つのは最大1.5秒。失敗しても資料は必ず開く
    const timer = setTimeout(go, 1500)
    try {
      fetch(RECORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ref: document.referrer || '' }),
        keepalive: true,
      }).catch(() => {}).finally(go)
    } catch {
      go()
    }
    return () => clearTimeout(timer)
  }, [token])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: color.white, color: color.textMid, fontSize: font.size.sm,
      fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif",
      padding: space[4], textAlign: 'center',
    }}>
      <div>
        <p style={{ margin: `0 0 ${space[3]}px` }}>資料を開いています…</p>
        <a href={DOC_URL} style={{ color: color.navy }}>開かない場合はこちら</a>
      </div>
    </div>
  )
}
