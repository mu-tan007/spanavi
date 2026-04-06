import { useState } from 'react';
import ClientCalendarPanel from './ClientCalendarPanel';

const NAVY = '#0D2247';

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
        schedulingNotes=""
        onUpdateNotes={null}
        compact={compact}
        onSelectSlot={onSelectSlot}
        existingAppointments={existingAppointments}
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
        schedulingNotes={ct.schedulingNotes || ''}
        onUpdateNotes={updateContactFn ? async (notes) => {
          await updateContactFn(ct.id, { ...ct, schedulingNotes: notes });
        } : null}
        compact={compact}
        onSelectSlot={onSelectSlot}
        existingAppointments={existingAppointments}
      />
    );
  }

  // 複数担当者: タブ切替
  const activeCt = contacts[activeTab] || contacts[0];
  const surname = (name) => (name || '').split(/\s+/)[0] || name;

  return (
    <div style={{ fontFamily: "'Noto Sans JP'" }}>
      {/* タブ */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #E5E7EB', marginBottom: 6 }}>
        {contacts.map((ct, i) => (
          <button
            key={ct.id}
            onClick={() => setActiveTab(i)}
            style={{
              padding: '6px 16px',
              fontSize: 11,
              fontWeight: activeTab === i ? 700 : 400,
              color: activeTab === i ? NAVY : '#6B7280',
              background: activeTab === i ? '#EFF6FF' : 'transparent',
              border: 'none',
              borderBottom: activeTab === i ? `2px solid ${NAVY}` : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontFamily: "'Noto Sans JP'",
              transition: 'all 0.15s',
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
        schedulingNotes={activeCt.schedulingNotes || ''}
        onUpdateNotes={updateContactFn ? async (notes) => {
          await updateContactFn(activeCt.id, { ...activeCt, schedulingNotes: notes });
        } : null}
        compact={compact}
        onSelectSlot={onSelectSlot}
        existingAppointments={existingAppointments}
      />
    </div>
  );
}
