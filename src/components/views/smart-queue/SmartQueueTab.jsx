import { color, space, font } from '../../../constants/design';
import IndustryDataPanel from './IndustryDataPanel';
import DetailedQueryPanel from './DetailedQueryPanel';
import SpecialQueryPanel from './SpecialQueryPanel';
import { useUrlState } from '../../../hooks/useUrlState';

// スマートキュー: 2階層タブ構造
//   上段: 業種別キーマン接続率データ（おすすめ業種シグナル）
//   下段: タブ
//     ▌詳細条件抽出  - ステータス/都道府県/業種/売上/経過日数 で自由抽出
//     ▌特殊条件抽出  - ①キーマン断り ②業種×ステータス ③受付再コール超過
//                       ④キーマン再コール超過 ⑤再アプローチ候補

const MAIN_TABS = [
  { value: 'detailed', label: '詳細条件抽出', hint: 'ステータス/地域/業種/売上で自由抽出' },
  { value: 'special',  label: '特殊条件抽出', hint: 'キーマン断り / 業種×状況 / ダッシュボード移管' },
];

export default function SmartQueueTab({ setCallFlowScreen, callListData }) {
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
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
            }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = color.navy; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = color.textMid; }}
            >
              <span>{t.label}</span>
              <span style={{ fontSize: 9.5, color: color.textLight, fontWeight: font.weight.medium }}>
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      {mainTab === 'detailed' && <DetailedQueryPanel setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
      {mainTab === 'special'  && <SpecialQueryPanel  setCallFlowScreen={setCallFlowScreen} callListData={callListData} />}
    </div>
  );
}
