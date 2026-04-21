import { MA_NEWS_INDUSTRIES } from '../../constants/maNewsIndustries'

export default function IndustryTabs({ value, onChange, counts = {} }) {
  const tabs = [{ key: 'all', label: '全業界' }, ...MA_NEWS_INDUSTRIES]

  return (
    <div style={{
      display: 'flex', gap: 6, overflowX: 'auto',
      padding: '4px 0', marginBottom: 16,
      scrollbarWidth: 'thin',
    }}>
      {tabs.map(tab => {
        const isActive = value === tab.key
        const count = counts[tab.key]
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              flexShrink: 0,
              height: 32,
              padding: '0 14px',
              border: isActive ? 'none' : '0.5px solid #E5E5E5',
              background: isActive ? '#032D60' : '#ffffff',
              color: isActive ? '#ffffff' : '#706E6B',
              fontSize: 12,
              fontWeight: isActive ? 500 : 400,
              borderRadius: 16,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            {count > 0 && (
              <span style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 10,
                background: isActive ? 'rgba(255,255,255,0.2)' : '#F8F8F8',
                color: isActive ? '#ffffff' : '#032D60',
                fontWeight: 500,
              }}>{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
