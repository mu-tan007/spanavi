import { useState } from 'react';

const NAVY = '#0D2247';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PREFS = ['オンライン','北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

const TIME_OPTIONS = [];
for (let h = 9; h < 20; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

/**
 * カレンダー空き枠クリック時の軽量アポ登録モーダル
 *
 * Props:
 *   date        - YYYY-MM-DD
 *   time        - HH:MM
 *   row         - 架電リストの企業行（company, phone等）
 *   list        - 架電リスト（company = クライアント名）
 *   clientInfo  - { _supaId, slackWebhookUrl, googleCalendarId }
 *   contacts    - クライアントの担当者配列 [{ email }]
 *   currentUser - ログインユーザー名
 *   onSave      - (appoData) => void
 *   onClose     - () => void
 */
export default function QuickAppoModal({ date, time, row, list, clientInfo, contacts, currentUser, onSave, onClose }) {
  const [meetTime, setMeetTime] = useState(time);
  const [location, setLocation] = useState('東京都');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isOnline = location === 'オンライン';
  const dateLabel = (() => {
    const d = new Date(date + 'T00:00:00');
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  })();

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // DB保存
      const appoData = {
        company: row?.company || '',
        client: list?.company || '',
        status: 'アポ取得',
        getter: currentUser,
        getDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }),
        meetDate: date,
        meetTime,
        meetLocation: location,
        isOnline,
        sales: 0,
        reward: 0,
        note: '',
        appoReport: `【アポ登録】\n企業名：${row?.company || ''}\n面談日：${dateLabel} ${meetTime}\n場所：${location}\nアポ取得者：${currentUser}`,
        list_id: list?._supaId || null,
        item_id: row?._supaId || null,
        phone: row?.phone || '',
        gcalEventId: null,
      };

      // 3. Slack通知（クライアントチャンネル）
      if (clientInfo?.slackWebhookUrl) {
        const slackText = `${dateLabel} ${meetTime}から、${location}で${row?.company || ''}のアポイントを獲得しました（取得者：${currentUser}）`;
        try {
          const { invokeSendAppoReport } = await import('../../lib/supabaseWrite');
          await invokeSendAppoReport({ channel: 'slack', text: slackText, webhook_url: clientInfo.slackWebhookUrl });
        } catch (e) {
          console.warn('[QuickAppo] Slack notification failed:', e);
        }
      }

      onSave(appoData);
    } catch (e) {
      console.error('[QuickAppo] save error:', e);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10010, fontFamily: "'Noto Sans JP'" }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 400, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: NAVY }}>アポイント登録</h3>

        {/* 企業名 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>架電先企業</label>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{row?.company || '-'}</div>
        </div>

        {/* 面談日 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>面談日</label>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{dateLabel}</div>
        </div>

        {/* 面談時間 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>面談時間</label>
          <select value={meetTime} onChange={e => setMeetTime(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 4 }}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* 場所 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>場所</label>
          <select value={location} onChange={e => setLocation(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 4 }}>
            {PREFS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* 取得者 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 2 }}>アポ取得者</label>
          <div style={{ fontSize: 13, color: NAVY }}>{currentUser}</div>
        </div>

        {error && <div style={{ color: '#DC2626', fontSize: 11, marginBottom: 8 }}>{error}</div>}

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 20px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 4, background: NAVY, color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '保存中...' : '登録'}
          </button>
        </div>
      </div>
    </div>
  );
}
