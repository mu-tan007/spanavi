import { useState } from 'react';
import { color, space, radius, font, shadow } from '../../constants/design';
import { Button, Input, Select } from '../ui';

const PREFS = ['オンライン','北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

const TIME_OPTIONS = [];
for (let h = 9; h < 20; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

/**
 * カレンダー空き枠クリック時のアポ登録モーダル
 *
 * Props:
 *   date        - YYYY-MM-DD
 *   time        - HH:MM
 *   row         - 架電リストの企業行（company, phone等）
 *   list        - 架電リスト（company = クライアント名, is_prospecting等）
 *   clientInfo  - { _supaId, slackWebhookUrl, googleCalendarId }
 *   contacts    - クライアントの担当者配列 [{ email }]
 *   currentUser - ログインユーザー名
 *   onSave      - (appoData) => void  登録完了時に呼ばれる（親で local appoData に追加してUI即時反映）
 *   onClose     - () => void
 */
export default function QuickAppoModal({ date, time, row, list, clientInfo, contacts, currentUser, onSave, onClose }) {
  const [meetTime, setMeetTime] = useState(time);
  const [location, setLocation] = useState('東京都');
  const [contactPersonName, setContactPersonName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isProspecting = !!list?.is_prospecting;
  const isOnline = location === 'オンライン';
  const dateLabel = (() => {
    const d = new Date(date + 'T00:00:00');
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  })();

  const handleSave = async () => {
    if (isProspecting && !contactPersonName.trim()) {
      setError('クライアント開拓では担当者名が必須です');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const { insertAppointment, invokeSendAppoReport, ensureProspectingClient, createGcalEvent, updateAppointmentMeta } = await import('../../lib/supabaseWrite');

      const startISO = `${date}T${meetTime}:00+09:00`;
      const endDate = new Date(new Date(startISO).getTime() + 60 * 60 * 1000);
      const endISO = endDate.toISOString();

      // Step 1: クライアント開拓の場合、CRM clientsテーブルへ upsert（面談予定）
      if (isProspecting) {
        await ensureProspectingClient({
          name: row?.company || '',
          industry: list?.type || list?.list_type || '',
          contactPerson: contactPersonName.trim(),
          nextContactAt: startISO,
        });
      }

      // Step 2: Google Calendar イベント作成（クライアント開拓のみ）
      let gcalEventId = null;
      if (isProspecting) {
        const summary = `${contactPersonName.trim()}様 ${row?.company || ''}`;
        const description = [
          `面談場所: ${location}`,
          `アポ取得者: ${currentUser}`,
          row?.phone ? `電話: ${row.phone}` : null,
        ].filter(Boolean).join('\n');
        const { eventId, error: gcalErr } = await createGcalEvent({
          summary,
          description,
          startISO,
          endISO,
          location,
        });
        if (gcalErr) console.warn('[QuickAppo] gcal event creation failed:', gcalErr);
        gcalEventId = eventId;
      }

      // Step 3: appointments テーブルへ INSERT
      const appoData = {
        company: row?.company || '',
        client: list?.company || '',
        // クライアント開拓は事前確認を行わないため、デフォルトで事前確認済に
        status: isProspecting ? '事前確認済' : 'アポ取得',
        getter: currentUser,
        getDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }),
        meetDate: date,
        meetTime,
        meetLocation: location,
        isOnline,
        sales: 0,
        reward: 0,
        note: contactPersonName.trim() ? `担当者: ${contactPersonName.trim()}` : '',
        appoReport: `【アポ登録】\n企業名：${row?.company || ''}\n面談日：${dateLabel} ${meetTime}\n場所：${location}\nアポ取得者：${currentUser}${contactPersonName.trim() ? `\n担当者：${contactPersonName.trim()}様` : ''}`,
        list_id: list?._supaId || null,
        item_id: row?._supaId || null,
        phone: row?.phone || '',
        gcalEventId,
      };
      const { result: insResult, error: insError } = await insertAppointment(appoData);
      if (insError) throw insError;

      // Step 4: Slack通知（クライアントチャンネル）
      if (clientInfo?.slackWebhookUrl) {
        const slackText = `${dateLabel} ${meetTime}から、${location}で${row?.company || ''}のアポイントを獲得しました（取得者：${currentUser}${contactPersonName.trim() ? `、担当：${contactPersonName.trim()}様` : ''}）`;
        try {
          await invokeSendAppoReport({ channel: 'slack', text: slackText, webhook_url: clientInfo.slackWebhookUrl });
        } catch (e) {
          console.warn('[QuickAppo] Slack notification failed:', e);
        }
      }

      // 親へ通知（local state に追加してUI即時反映）
      const savedAppoData = { ...appoData, _supaId: insResult?.id || null };
      onSave?.(savedAppoData);
    } catch (e) {
      console.error('[QuickAppo] save error:', e);
      setError('保存に失敗しました: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10010, fontFamily: font.family.sans }}
      onClick={onClose}>
      <div style={{ background: color.white, borderRadius: radius.xl, padding: space[6], width: 420, maxWidth: '90vw', boxShadow: shadow.xl, maxHeight: '90vh', overflowY: 'auto' }}
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

        {/* 担当者名 */}
        <div style={{ marginBottom: space[3] }}>
          <label style={{ fontSize: font.size.xs, color: color.gray500, display: 'block', marginBottom: 2 }}>
            担当者名{isProspecting && <span style={{ color: color.danger }}> *</span>}
          </label>
          <Input
            size="sm"
            value={contactPersonName}
            onChange={e => setContactPersonName(e.target.value)}
            placeholder="例: 原田"
          />
          {isProspecting && (
            <div style={{ fontSize: 10, color: color.textLight, marginTop: 4 }}>
              クライアント開拓では、入力した担当者名でGoogleカレンダーに「{contactPersonName.trim() || '担当者名'}様 {row?.company || '企業名'}」として登録されます。
            </div>
          )}
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
