import { C } from '../../constants/colors';

const NAV_ITEMS = [
  { id: 'live', label: 'Live', icon: '📡' },
  { id: 'lists', label: 'リスト', icon: '📋' },
  { id: 'appo', label: 'アポ', icon: '📅' },
  { id: '_more', label: 'その他', icon: '≡' },
];

export default function MobileBottomNav({ currentTab, setCurrentTab, onMorePress }) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
      background: '#fff', borderTop: '1px solid #E5E7EB',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      zIndex: 200, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {NAV_ITEMS.map(item => {
        const isActive = item.id === '_more' ? false : currentTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => item.id === '_more' ? onMorePress?.() : setCurrentTab(item.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, border: 'none', background: 'none', cursor: 'pointer',
              padding: '6px 0',
              color: isActive ? C.navyLight || '#0176D3' : '#9CA3AF',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, fontFamily: "'Noto Sans JP'" }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
