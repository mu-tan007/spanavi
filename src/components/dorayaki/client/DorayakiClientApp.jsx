import React, { useState } from 'react';
import { dora } from './theme';
import DorayakiClientSidebar from './DorayakiClientSidebar';
import PlaceholderView from './views/PlaceholderView';
import AnalyticsView from './views/AnalyticsView';
import { IconBell } from './icons';

// dorayaki.AI クライアントポータル(叩き)
// -----------------------------------------------------------------------------
// レイアウトの骨格 + 全メニューの枠。データは完全モック。
// 独立ルート /dorayaki に閉じており、営業代行(/client)・スパキャリ(/spacareer)や
// 社内アプリ(/*)には一切影響しない。認証ゲートは叩き段階では設けず、
// /design-preview と同様にそのままプレビューできる。
//
// TODO(次段階): Analytics 等の中身を individual view に差し替え / クライアント
// ログイン(/dorayaki/login)接続 / engagement・権限・実データ接続。

const MOCK_CLIENT = { name: 'M&Aソーシングパートナーズ株式会社' };
const MOCK_USER = { name: '篠宮 拓武' };

export default function DorayakiClientApp() {
  const [tab, setTab] = useState('analytics');

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', background: dora.color.canvas,
      fontFamily: dora.font.body, color: dora.color.ink,
    }}>
      <DorayakiClientSidebar current={tab} onSelect={setTab} user={MOCK_USER} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* トップバー: 参考画面のロイヤルブルー帯。会社名+通知を白で右寄せ */}
        <header style={{
          height: 44, flexShrink: 0, background: dora.gradient.header,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: dora.space.lg, padding: `0 ${dora.space.xl}px`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: dora.space.sm }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', opacity: 0.9 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: dora.font.display, letterSpacing: 0.2 }}>
              {MOCK_CLIENT.name}
            </span>
          </div>
          <button aria-label="通知" style={{
            width: 30, height: 30, borderRadius: dora.radius.md, border: 'none',
            background: 'transparent', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconBell size={18} />
          </button>
        </header>

        {/* コンテンツ */}
        <main style={{ flex: 1, padding: `${dora.space.lg}px ${dora.space.xl}px ${dora.space.xxl}px` }}>
          {tab === 'analytics' ? <AnalyticsView /> : <PlaceholderView section={tab} />}
        </main>
      </div>
    </div>
  );
}
