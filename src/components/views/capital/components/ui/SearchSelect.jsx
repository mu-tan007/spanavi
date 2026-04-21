import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * インクリメンタルサーチ付きセレクト（複数選択対応）
 * items: string[] - 候補リスト
 * value: string[] - 選択中の値
 * onChange: (val: string[]) => void
 * placeholder: string
 * multi: boolean - 複数選択（default true）
 */
export default function SearchSelect({ items, value = [], onChange, placeholder = '入力して候補を表示...', multi = true }) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const selected = new Set(value)
    const available = items.filter(item => !selected.has(item))
    if (!input) return available.slice(0, 30)
    const q = input.toLowerCase()
    return available.filter(item => item.toLowerCase().includes(q)).slice(0, 50)
  }, [items, input, value])

  function handleSelect(item) {
    if (multi) {
      onChange([...value, item])
    } else {
      onChange([item])
      setOpen(false)
    }
    setInput('')
  }

  function handleInputChange(e) {
    const raw = e.target.value
    if (raw.includes(',') || raw.includes('，') || raw.includes('、')) {
      const parts = raw.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
      if (parts.length > 1) {
        const itemSet = new Set(items)
        const selected = new Set(value)
        const matched = parts.filter(p => itemSet.has(p) && !selected.has(p))
        const unmatched = parts.filter(p => !itemSet.has(p))
        if (matched.length > 0) onChange([...value, ...matched])
        setInput(unmatched.join(', '))
        setOpen(unmatched.length > 0)
        return
      }
    }
    setInput(raw)
    setOpen(true)
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text')
    if (pasted.includes(',') || pasted.includes('，') || pasted.includes('、')) {
      e.preventDefault()
      const parts = pasted.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
      const itemSet = new Set(items)
      const selected = new Set(value)
      const matched = parts.filter(p => itemSet.has(p) && !selected.has(p))
      const unmatched = parts.filter(p => !itemSet.has(p))
      if (matched.length > 0) onChange([...value, ...matched])
      setInput(unmatched.join(', '))
    }
  }

  function handleRemove(item) { onChange(value.filter(v => v !== item)) }
  function handleClearAll() { onChange([]); setInput(''); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* 選択済みタグ */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
          {value.map((v, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', fontSize: 11, borderRadius: 4,
              background: '#032D60', color: '#181818', whiteSpace: 'nowrap',
            }}>
              {v}
              <span onClick={() => handleRemove(v)} style={{ cursor: 'pointer', opacity: 0.7, fontSize: 13, lineHeight: 1 }}>×</span>
            </span>
          ))}
          <button onClick={handleClearAll} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#706E6B', fontSize: 10, padding: '2px 4px',
          }}>全解除</button>
        </div>
      )}

      {/* 入力欄 */}
      <input
        type="text"
        value={input}
        onChange={handleInputChange}
        onPaste={handlePaste}
        onFocus={() => setOpen(true)}
        placeholder={value.length > 0 ? '追加...' : placeholder}
        style={{
          width: '100%', padding: '6px 10px',
          border: '0.5px solid #E5E5E5', borderRadius: 5,
          fontSize: 12, outline: 'none', color: '#FFFFFF',
          background: '#fff',
        }}
      />

      {/* ドロップダウン候補 */}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 6,
          maxHeight: 240, overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(10,30,60,0.12)', marginTop: 2,
        }}>
          {filtered.map((item, i) => (
            <div key={i} onClick={() => handleSelect(item)}
              style={{
                padding: '7px 10px', cursor: 'pointer', fontSize: 12, color: '#FFFFFF',
                borderBottom: i < filtered.length - 1 ? '0.5px solid #F8F8F8' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{item}</div>
          ))}
        </div>
      )}
    </div>
  )
}
