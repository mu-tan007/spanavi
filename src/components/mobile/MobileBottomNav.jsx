import { C } from '../../constants/colors';
import { capitalNavigate, useCapitalPathname } from '../views/capital/lib/capitalNav';

// 事業別の下部タブ構成（最大3項目 + その他）
//   id 末尾が `_more` のものは「その他」モーダルを開く動作
//   Capital は内部ルーター用に { capitalPath } で対応
const NAV_BY_ENGAGEMENT = {
  seller_sourcing: [
    { id: 'live',  label: 'Live' },
    { id: 'lists', label: 'リスト' },
    { id: 'appo',  label: 'アポ' },
    { id: '_more', label: 'その他' },
  ],
  masp: [
    { id: 'database',       label: '企業DB' },
    { id: 'all_members',    label: 'メンバー' },
    { id: 'mypage',         label: 'マイページ' },
    { id: '_more',          label: 'その他' },
  ],
  spartia_career: [
    { id: 'applications',   label: '応募' },
    { id: 'deals_career',   label: '案件' },
    { id: 'mypage',         label: 'マイページ' },
    { id: '_more',          label: 'その他' },
  ],
  spartia_capital: [
    { capitalPath: '/dashboard', label: 'ダッシュ' },
    { capitalPath: '/deals',     label: 'ディール' },
    { capitalPath: '/firms',     label: '仲介' },
    { id: '_more',               label: 'その他' },
  ],
  spartia_recruitment: [
    { id: 'mypage', label: 'マイページ' },
    { id: '_more',  label: 'その他' },
  ],
  matching: [
    { id: 'mypage', label: 'マイページ' },
    { id: '_more',  label: 'その他' },
  ],
};

const DEFAULT_NAV = NAV_BY_ENGAGEMENT.seller_sourcing;

export default function MobileBottomNav({ currentTab, setCurrentTab, onMorePress, engSlug }) {
  const items = NAV_BY_ENGAGEMENT[engSlug] || DEFAULT_NAV;
  const isCapital = engSlug === 'spartia_capital';
  const capitalPath = useCapitalPathname();

  const isActive = (item) => {
    if (item.id === '_more') return false;
    if (isCapital && item.capitalPath) {
      return capitalPath === item.capitalPath
        || (item.capitalPath !== '/dashboard' && capitalPath.startsWith(item.capitalPath + '/'));
    }
    return currentTab === item.id;
  };

  const handleClick = (item) => {
    if (item.id === '_more') {
      onMorePress?.();
      return;
    }
    if (isCapital && item.capitalPath) {
      capitalNavigate(item.capitalPath);
      return;
    }
    setCurrentTab?.(item.id);
  };

  return (
    <nav
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
        background: '#fff', borderTop: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
        zIndex: 200, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {items.map((item, i) => {
        const active = isActive(item);
        return (
          <button
            key={item.id || item.capitalPath || i}
            onClick={() => handleClick(item)}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 4,
              border: 'none', background: 'none', cursor: 'pointer',
              padding: '8px 4px',
              color: active ? (C.navy || '#0D2247') : '#6B7280',
              borderTop: active ? '2px solid ' + (C.navy || '#0D2247') : '2px solid transparent',
              fontFamily: "'Noto Sans JP'",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
