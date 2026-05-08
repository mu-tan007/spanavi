import { useState } from 'react';
import ClientCalendarPanel from './ClientCalendarPanel';
import { color, radius, font, alpha } from '../../constants/design';

/**
 * 複数担当者のカレンダーをタブ切替で表示するラッパー
 * 1人の場合は直接 ClientCalendarPanel を表示
 */
export default function MultiCalendarPanel({
  contacts,
  fallbackClient,
  updateContactFn,
  onSelectSlot,
  existingAppointments = [],
  compact = false,
  staticNoteLines = [],
  onUpdateCalendarLines = null,
}) {
  const [activeTab, setActiveTab] = useState(0);

  // 担当者が0人: クライアントレベルのカレンダーにフォールバック
  if (!contacts || contacts.length === 0) {
    return (
      <ClientCalendarPanel
        clientCalendarId={fallbackClient?.googleCalendarId || ''}
        schedulingUrl={fallbackClient?.schedulingUrl || ''}
        schedulingUrl2=""
        schedulingLabel=""
        schedulingLabel2=""
        compact={compact}
        onSelectSlot={onSelectSlot}
        existingAppointments={existingAppointments}
        staticNoteLines={staticNoteLines}
        onUpdateCalendarLines={onUpdateCalendarLines}
      />
    );
  }

  // 担当者が1人: 直接表示（従来と同じ）
  if (contacts.length === 1) {
    const ct = contacts[0];
    return (
      <ClientCalendarPanel
        clientCalendarId={ct.googleCalendarId || fallbackClient?.googleCalendarId || ''}
        schedulingUrl={ct.schedulingUrl || fallbackClient?.schedulingUrl || ''}
        schedulingUrl2={ct.schedulingUrl2 || ''}
        schedulingLabel={ct.schedulingLabel || ''}
        schedulingLabel2={ct.schedulingLabel2 || ''}
        compact={compact}
        onSelectSlot={onSelectSlot}
        existingAppointments={existingAppointments}
        staticNoteLines={staticNoteLines}
        onUpdateCalendarLines={onUpdateCalendarLines}
      />
    );
  }

  // 複数担当者: タブ切替
  const activeCt = contacts[activeTab] || contacts[0];
  const surname = (name) => (name || '').split(/\s+/)[0] || name;

  return (
    <div style={{ fontFamily: font.family.sans }}>
      {/* タブ */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${color.border}`, marginBottom: 6 }}>
        {contacts.map((ct, i) => (
          <button
            key={ct.id}
            onClick={() => setActiveTab(i)}
            style={{
              padding: '6px 16px',
              fontSize: font.size.xs,
              fontWeight: activeTab === i ? font.weight.bold : font.weight.normal,
              color: activeTab === i ? color.navy : color.gray500,
              background: activeTab === i ? alpha(color.navyLight, 0.08) : 'transparent',
              border: 'none',
              borderBottom: activeTab === i ? `2px solid ${color.navy}` : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontFamily: font.family.sans,
              transition: 'all 0.15s',
              borderRadius: `${radius.sm}px ${radius.sm}px 0 0`,
            }}
          >
            {surname(ct.name)}
          </button>
        ))}
      </div>

      {/* アクティブタブのカレンダー */}
      <ClientCalendarPanel
        clientCalendarId={activeCt.googleCalendarId || fallbackClient?.googleCalendarId || ''}
        schedulingUrl={activeCt.schedulingUrl || fallbackClient?.schedulingUrl || ''}
        schedulingUrl2={activeCt.schedulingUrl2 || ''}
        schedulingLabel={activeCt.schedulingLabel || ''}
        schedulingLabel2={activeCt.schedulingLabel2 || ''}
        compact={compact}
        onSelectSlot={onSelectSlot}
        existingAppointments={existingAppointments}
        staticNoteLines={staticNoteLines}
        onUpdateCalendarLines={onUpdateCalendarLines}
      />
    </div>
  );
}
