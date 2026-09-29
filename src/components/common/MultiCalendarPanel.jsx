import { useState } from 'react';
import ClientCalendarPanel from './ClientCalendarPanel';
import AppointmentCalendarPanel from './AppointmentCalendarPanel';
import { color, space, radius, font, alpha } from '../../constants/design';

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
  showRegisteredAppointments = false,
}) {
  const [activeTab, setActiveTab] = useState(0);
  // 「架電画面のカレンダータブに表示」を外した担当者はタブを出さない
  contacts = (contacts || []).filter(ct => ct.showInCallCalendar !== false);

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
        appointmentCalendar={showRegisteredAppointments && fallbackClient?._supaId && (
          <AppointmentCalendarPanel key={ct.id} clientId={fallbackClient._supaId} contact={ct} />
        )}
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

      {/* 本人のカレンダーが未登録の担当者に、会社単位のカレンダー（＝別の担当者のもの）を
          代わりに出すと、その人の空きだと誤解してアポを入れてしまう（ユニヴィス林様のタブに
          舟山様の予定が出ていた）。複数担当者の会社では代わりに出さず、未登録と明示する。 */}
      {!activeCt.googleCalendarId && (
        <div style={{ margin: `0 0 ${space[1.5]}px`, padding: `${space[1.5]}px ${space[2.5]}px`, background: alpha(color.warn, 0.12), border: `1px solid ${alpha(color.warn, 0.5)}`, borderRadius: radius.md, fontSize: font.size.xs, color: color.textMid }}>
          {`${surname(activeCt.name)}様のカレンダー未登録（空き時間の表示なし）`}
        </div>
      )}

      {/* アクティブタブのカレンダー */}
      <ClientCalendarPanel
        clientCalendarId={activeCt.googleCalendarId || ''}
        schedulingUrl={activeCt.schedulingUrl || fallbackClient?.schedulingUrl || ''}
        schedulingUrl2={activeCt.schedulingUrl2 || ''}
        schedulingLabel={activeCt.schedulingLabel || ''}
        schedulingLabel2={activeCt.schedulingLabel2 || ''}
        compact={compact}
        onSelectSlot={onSelectSlot}
        existingAppointments={existingAppointments}
        staticNoteLines={staticNoteLines}
        onUpdateCalendarLines={onUpdateCalendarLines}
        appointmentCalendar={showRegisteredAppointments && fallbackClient?._supaId && (
          <AppointmentCalendarPanel key={activeCt.id} clientId={fallbackClient._supaId} contact={activeCt} />
        )}
      />
    </div>
  );
}
