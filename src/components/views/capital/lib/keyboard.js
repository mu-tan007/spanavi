// 全テキストエリア共通のキーボードショートカット
// - Enter: 送信/保存 (submitFn を呼ぶ)
// - Shift+Enter: 改行 (デフォルト動作)
// - 日本語 IME 変換中 (isComposing) は送信しない
export function onEnterSubmit(submitFn) {
  return function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !e.nativeEvent?.isComposing) {
      e.preventDefault()
      submitFn()
    }
  }
}
