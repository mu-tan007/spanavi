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
            一度リロードしてみてください。それでも繰り返す場合は、下記のエラー内容を篠宮までお知らせください。
          </p>
          <div style={{
            background: '#F3F4F6', borderRadius: 4, padding: '10px 12px',
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#7F1D1D',
            marginBottom: 16, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {msg}
            {stack ? '\n\n' + stack : ''}
          </div>
          <button
            onClick={this.handleReload}
            style={{
              padding: '8px 20px', borderRadius: 4,
              background: '#0176D3', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 13,
              fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 500,
            }}
          >
            リロード
          </button>
        </div>
      </div>
    );
  }
}
