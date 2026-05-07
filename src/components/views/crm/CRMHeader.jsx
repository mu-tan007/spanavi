import { C } from '../../../constants/colors';
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

export default function CRMHeader({ filteredCount, search, setSearch, onAddClient, isEditable }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
      padding: '14px 18px', background: '#fff', borderRadius: 4,
      border: '1px solid ' + GRAY_200,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>顧客管理（CRM）</span>
        <span style={{ fontSize: 11, color: C.textLight }}>{filteredCount}社</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="企業名・業界..."
          style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid ' + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', width: 180 }}
        />
        {isEditable && (
          <button
            onClick={() => onAddClient({ ...ADD_FORM_DEFAULT })}
            style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: NAVY, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' }}
          >
            ＋ 新規顧客追加
          </button>
        )}
      </div>
    </div>
  );
}
