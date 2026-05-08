import { C } from '../../constants/colors';
import { color, space, font } from '../../constants/design';
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
    { capitalPath: '/partners',  label: '提携' },
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

  const activeColor = color.navy || C.navy || '#0D2247';

  return (
    <nav
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
        background: color.white, borderTop: `1px solid ${color.gray200 || color.border}`,
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
              gap: space[1],
              border: 'none', background: 'none', cursor: 'pointer',
              padding: `${space[2]}px ${space[1]}px`,
              color: active ? activeColor : (color.gray500 || color.textMid),
              borderTop: active ? `2px solid ${activeColor}` : '2px solid transparent',
              fontFamily: font.family.sans,
              minWidth: 0,
              minHeight: 44,
            }}
          >
            <span
              style={{
                fontSize: font.size.sm,
                fontWeight: active ? font.weight.bold : font.weight.medium,
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
