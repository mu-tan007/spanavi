import { C } from '../../../constants/colors';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Input } from '../../ui';
import { NAVY, GRAY_200 } from './utils';

const ADD_FORM_DEFAULT = {
  status: '準備中',
  contract: '未',
  company: '',
  industry: '',
  target: 0,
  rewardType: '',
  paySite: '',
  payNote: '',
  listSrc: '',
  calendar: '',
  contact: '',
  noteFirst: '',
  googleCalendarId: '',
  clientEmail: '',
  schedulingUrl: '',
  slackWebhookUrl: '',
  slackWebhookUrlInternal: '',
  chatworkRoomId: '',
};

function AlertBadge({ count, label, color: btnColor, active, onClick }) {
  if (!count) return null;
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px', borderRadius: radius.md,
        border: `1px solid ${btnColor}`,
        background: active ? btnColor : alpha(btnColor, 0.08),
        color: active ? color.white : btnColor,
        fontSize: 10, fontWeight: font.weight.bold,
        cursor: 'pointer',
        fontFamily: font.family.sans,
        whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      {label} {count}
    </button>
  );
}

export default function CRMHeader({
  filteredCount,
  search, setSearch,
  onAddClient,
  isEditable,
  overdueCount = 0,
  expiredCount = 0,
  alertFilter = null,
  setAlertFilter,
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
      padding: '14px 18px', background: color.white, borderRadius: radius.md,
      border: `1px solid ${color.border}`,
      gap: space[2], flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>顧客管理（CRM）</span>
        <span style={{ fontSize: font.size.xs, color: color.textLight }}>{filteredCount}社</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <AlertBadge
          count={overdueCount}
          label="フォロー漏れ"
          color={color.danger}
          active={alertFilter === 'overdue'}
          onClick={() => setAlertFilter(alertFilter === 'overdue' ? null : 'overdue')}
        />
        <AlertBadge
          count={expiredCount}
          label="予定日超過"
          color="#B8860B"
          active={alertFilter === 'expired'}
          onClick={() => setAlertFilter(alertFilter === 'expired' ? null : 'expired')}
        />
        <Input
          size="sm"
          fullWidth={false}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="企業名・業界..."
          containerStyle={{ width: 180 }}
        />
        {isEditable && (
          <Button
            variant="primary"
            size="md"
            onClick={() => onAddClient({ ...ADD_FORM_DEFAULT })}
          >
            ＋ 新規顧客追加
          </Button>
        )}
      </div>
    </div>
  );
}
