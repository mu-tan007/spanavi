import React from 'react';

// React Error Boundary
// 子ツリーで unhandled error が出ても画面が真っ青 (body の navy 背景だけ) に
// ならないよう、捕捉してエラー画面を表示する。
// 「しばらく経つと自動的に navy 一色になる」事故の防御策 (2026-06-04)。
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] caught:', error);
    console.error('[ErrorBoundary] component stack:', info?.componentStack);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  };

  // 「特定タブでクラッシュ → リロードしても保存タブが復元されて同じ画面に戻る」
  // という無限ループから脱出するためのリセット。保存中のタブ / 架電フロー状態を消し、
  // CRM 詳細への遷移用 URL パラメータも除去してから既定タブ (架電リスト) で起動し直す。
  handleReset = () => {
    try {
      localStorage.removeItem('masp_v2_currentTab');
      localStorage.removeItem('masp_v2_callFlowScreen');
      localStorage.removeItem('masp_v2_callQueue');
    } catch (e) { /* noop */ }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('clientId');
      url.searchParams.delete('crm_section');
      window.location.replace(url.pathname + (url.search || '') + url.hash);
    } catch (e) {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || String(this.state.error || '不明なエラー');
    const stack = (this.state.info?.componentStack || '').split('\n').slice(0, 8).join('\n');

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#1456C7 0%,#1E3A8A 30%,#0D2247 60%,#081636 100%)',
        fontFamily: "'Noto Sans JP', sans-serif",
        padding: 24,
      }}>
        <div style={{
          maxWidth: 560, width: '100%',
          background: 'rgba(255,255,255,0.96)', borderRadius: 8,
          padding: '28px 32px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <h2 style={{ margin: '0 0 12px', color: '#0D2247', fontSize: 18, fontWeight: 600 }}>
            画面の表示中にエラーが発生しました
          </h2>
          <p style={{ margin: '0 0 16px', color: '#374151', fontSize: 13, lineHeight: 1.6 }}>
            まず「ホーム画面に戻す」を押してください。リロードで直らない場合はこちらで復帰できます。
            それでも繰り返す場合は、下記のエラー内容を篠宮までお知らせください。
          </p>
          {/* エラーメッセージ本文は必ず見えるよう、スクロール枠の外に固定表示する */}
          <div style={{
            background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4,
            padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            color: '#7F1D1D', marginBottom: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {msg}
          </div>
          <div style={{
            background: '#F3F4F6', borderRadius: 4, padding: '10px 12px',
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6B7280',
            marginBottom: 16, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {stack || '(コンポーネント情報なし)'}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 20px', borderRadius: 4,
                background: '#0176D3', color: '#fff', border: 'none',
                cursor: 'pointer', fontSize: 13,
                fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 600,
              }}
            >
              ホーム画面に戻す
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 20px', borderRadius: 4,
                background: '#fff', color: '#0176D3', border: '1px solid #0176D3',
                cursor: 'pointer', fontSize: 13,
                fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 500,
              }}
            >
              リロード
            </button>
          </div>
        </div>
      </div>
    );
  }
}
