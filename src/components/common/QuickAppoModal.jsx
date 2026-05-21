import { useState } from 'react';
import { color, space, radius, font, shadow } from '../../constants/design';
import { Button, Select } from '../ui';

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
        // クライアント開拓は事前確認を行わないため、デフォルトで事前確認済に
        status: list?.is_prospecting ? '事前確認済' : 'アポ取得',
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10010, fontFamily: font.family.sans }}
      onClick={onClose}>
      <div style={{ background: color.white, borderRadius: radius.xl, padding: space[6], width: 400, maxWidth: '90vw', boxShadow: shadow.xl }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: `0 0 ${space[4]}px`, fontSize: font.size.md + 1, fontWeight: font.weight.bold, color: color.navy }}>アポイント登録</h3>

        {/* 企業名 */}
        <div style={{ marginBottom: space[3] }}>
          <label style={{ fontSize: font.size.xs, color: color.gray500, display: 'block', marginBottom: 2 }}>架電先企業</label>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, color: color.navy }}>{row?.company || '-'}</div>
        </div>

        {/* 面談日 */}
        <div style={{ marginBottom: space[3] }}>
          <label style={{ fontSize: font.size.xs, color: color.gray500, display: 'block', marginBottom: 2 }}>面談日</label>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, color: color.navy }}>{dateLabel}</div>
        </div>

        {/* 面談時間 */}
        <div style={{ marginBottom: space[3] }}>
          <label style={{ fontSize: font.size.xs, color: color.gray500, display: 'block', marginBottom: 2 }}>面談時間</label>
          <Select
            size="sm"
            value={meetTime}
            onChange={e => setMeetTime(e.target.value)}
            options={TIME_OPTIONS.map(t => ({ value: t, label: t }))}
          />
        </div>

        {/* 場所 */}
        <div style={{ marginBottom: space[3] }}>
          <label style={{ fontSize: font.size.xs, color: color.gray500, display: 'block', marginBottom: 2 }}>場所</label>
          <Select
            size="sm"
            value={location}
            onChange={e => setLocation(e.target.value)}
            options={PREFS.map(p => ({ value: p, label: p }))}
          />
        </div>

        {/* 取得者 */}
        <div style={{ marginBottom: space[4] }}>
          <label style={{ fontSize: font.size.xs, color: color.gray500, display: 'block', marginBottom: 2 }}>アポ取得者</label>
          <div style={{ fontSize: font.size.base, color: color.navy }}>{currentUser}</div>
        </div>

        {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginBottom: space[2] }}>{error}</div>}

        {/* ボタン */}
        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving} disabled={saving}>
            {saving ? '保存中...' : '登録'}
          </Button>
        </div>
      </div>
    </div>
  );
}
