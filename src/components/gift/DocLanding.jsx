import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { color, space, font } from '../../constants/design'

// フォーム営業で送った資料リンク（/d/:token）の中継ページ。
// 開かれたことを記録して、そのまま資料のPDFへ移る（間にボタンを挟まない）。
// 認証なしの公開ページ。設計: tasks/sekkei_form_eigyo_doc_tracking.md

const RECORD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/doc-view`
// 資料の種類（doc_sends.doc_key）ごとのPDF。doc-view の返事で決まる。分からないときは売り手ソーシング
const DOC_URLS = {
  uri_sourcing: '/docs/spartia-uri-sourcing.pdf',
  ifa_lead: '/docs/spartia-ifa-lead.pdf',
}
const DEFAULT_DOC = DOC_URLS.uri_sourcing

export default function DocLanding() {
  const { token } = useParams()
  const [docUrl, setDocUrl] = useState(null)

  useEffect(() => {
    let moved = false
    const go = (url) => {
      if (moved) return
      moved = true
      setDocUrl(url)
      window.location.replace(url)
    }
    // 記録（と資料の種類の返事）を待つのは最大4秒。失敗しても資料は必ず開く
    const timer = setTimeout(() => go(DEFAULT_DOC), 4000)
    try {
      fetch(RECORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ref: document.referrer || '' }),
        keepalive: true,
      })
        .then(r => r.json())
        .then(d => go(DOC_URLS[d?.doc_key] || DEFAULT_DOC))
        .catch(() => go(DEFAULT_DOC))
    } catch {
      go(DEFAULT_DOC)
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
        {docUrl && <a href={docUrl} style={{ color: color.navy }}>開かない場合はこちら</a>}
      </div>
    </div>
  )
}
