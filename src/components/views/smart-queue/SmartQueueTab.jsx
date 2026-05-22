import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { color, space, font } from '../../../constants/design';
import IndustryDataPanel from './IndustryDataPanel';
import DetailedQueryPanel from './DetailedQueryPanel';
import SpecialQueryPanel from './SpecialQueryPanel';
import { useUrlState } from '../../../hooks/useUrlState';

// 各 Panel の fetch を共有キャッシュに乗せる。タブ切替で再マウントしても
// staleTime 内は即時に前回データから描画 → 「読み込み中…」が見えなくなる。
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:           60_000,   // 1分は cache を fresh 扱い
      gcTime:              5 * 60_000, // 5分間 cache 保持
      refetchOnWindowFocus: false,
      refetchOnMount:       false,   // 既に cache があれば再 fetch しない
      placeholderData:     (prev) => prev, // 再 fetch 中も前回データを描画継続
      retry: 1,
    },
  },
});

// スマートキュー: 2階層タブ構造
//   上段: 業種別キーマン接続率データ（おすすめ業種シグナル）
//   下段: タブ
//     ▌詳細条件抽出  - ステータス/都道府県/業種/売上/経過日数 で自由抽出
//     ▌特殊条件抽出  - ①キーマン断り ②業種×ステータス ③受付再コール超過
//                       ④キーマン再コール超過 ⑤再アプローチ候補

const MAIN_TABS = [
  { value: 'detailed', label: '詳細条件抽出' },
  { value: 'special',  label: '特殊条件抽出' },
];

export default function SmartQueueTab({ setCallFlowScreen, callListData }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SmartQueueInner setCallFlowScreen={setCallFlowScreen} callListData={callListData} />
    </QueryClientProvider>
  );
}

function SmartQueueInner({ setCallFlowScreen, callListData }) {
  const [mainTab, setMainTab] = useUrlState('sq_main', 'detailed', { allowed: ['detailed', 'special'] });

  return (
    <div>
      <IndustryDataPanel />

      <div style={{
        display: 'flex', gap: space[1], marginBottom: space[3],
        borderBottom: `1px solid ${color.border}`,
      }}>
        {MAIN_TABS.map(t => {
          const active = mainTab === t.value;
          return (
            <button key={t.value} onClick={() => setMainTab(t.value)} style={{
              padding: '10px 22px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${active ? color.navy : 'transparent'}`,
              fontSize: font.size.sm,
              fontWeight: active ? font.weight.bold : font.weight.semibold,
              color: active ? color.navy : color.textMid, cursor: 'pointer',
              fontFamily: font.family.sans, transition: 'all 0.12s', marginBottom: -1,
            }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = color.navy; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = color.textMid; }}
            >{t.label}</button>
          );
        })}
      </div>

      {mainTab === 'detailed' && <DetailedQueryPanel setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
      {mainTab === 'special'  && <SpecialQueryPanel  setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
    </div>
  );
}
