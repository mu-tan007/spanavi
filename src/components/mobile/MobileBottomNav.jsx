import { Search, Database, CalendarCheck2, BarChart3, Users, Briefcase, Menu } from 'lucide-react';
import { color, space, radius, font, alpha } from '../../constants/design';

// 事業別の下部タブ構成。
//   id 末尾が `_more` のものは「その他」モーダルを開く動作
// 営業代行は 2026-08-15 にむー様指示で「企業検索 / 企業DB / アポ一覧 / アナリティクス」へ変更。
// （左上のハンバーガーから全メニューに行けるため「その他」は置かない）
const NAV_BY_ENGAGEMENT = {
  seller_sourcing: [
    { id: 'search',   label: '企業検索',      Icon: Search },
    { id: 'database', label: '企業DB',        Icon: Database },
    { id: 'appo',     label: 'アポ一覧',      Icon: CalendarCheck2 },
    { id: 'stats',    label: 'アナリティクス', Icon: BarChart3 },
  ],
  spartia_career: [
    { id: 'customers',  label: '顧客',       Icon: Users },
    { id: 'sessions',   label: 'セッション', Icon: CalendarCheck2 },
    { id: 'recruiting', label: '採用',       Icon: Briefcase },
    { id: '_more',      label: 'その他',     Icon: Menu },
  ],
  spartia_recruitment: [
    { id: 'mypage', label: 'マイページ', Icon: Users },
    { id: '_more',  label: 'その他',     Icon: Menu },
  ],
  matching: [
    { id: 'mypage', label: 'マイページ', Icon: Users },
    { id: '_more',  label: 'その他',     Icon: Menu },
  ],
};

const DEFAULT_NAV = NAV_BY_ENGAGEMENT.seller_sourcing;

/**
 * @prop canView (tabId) => boolean  権限の無いタブを落とすための判定（省略時は全て表示）
 */
export default function MobileBottomNav({ currentTab, setCurrentTab, onMorePress, engSlug, canView }) {
  const all = NAV_BY_ENGAGEMENT[engSlug] || DEFAULT_NAV;
  // 権限の無いタブ（例: 企業DB は管理者のみ）は出さない。押しても弾かれるだけなので。
  const items = typeof canView === 'function'
    ? all.filter(it => it.id === '_more' || canView(it.id))
    : all;

  const isActive = (item) => {
    if (item.id === '_more') return false;
    return currentTab === item.id;
  };

  const handleClick = (item) => {
    if (item.id === '_more') {
      onMorePress?.();
      return;
    }
    setCurrentTab?.(item.id);
  };

  if (items.length === 0) return null;
  const activeColor = color.navy || '#0D2247';

  return (
    <nav
      className="safe-area-bottom"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: color.white,
        borderTop: `1px solid ${color.gray200}`,
        display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
        zIndex: 200,
        // iOS のホームバー分を足す。バーの実体の高さは 56px を保つ。
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {items.map((item, i) => {
        const active = isActive(item);
        const Icon = item.Icon;
        return (
          <button
            key={item.id || i}
            type="button"
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            onClick={() => handleClick(item)}
            className="no-min-height"
            style={{
              flex: 1, height: 56,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 3,
              border: 'none', background: 'none', cursor: 'pointer',
              padding: `0 ${space[1]}px`,
              color: active ? activeColor : color.gray500,
              fontFamily: font.family.sans,
              minWidth: 0,
              position: 'relative',
            }}
          >
            {/* アクティブ表示は上辺の線ではなくアイコンの背後の丸みで示す。
                下部タブの上辺に線を引くと、バー自体の枠線と重なって滲む。 */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 22, borderRadius: radius.pill,
              background: active ? alpha(activeColor, 0.1) : 'transparent',
              transition: 'background 0.15s ease',
            }}>
              {Icon && <Icon size={17} strokeWidth={active ? 2.4 : 1.9} />}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? font.weight.bold : font.weight.medium,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
                letterSpacing: -0.2,
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
