import { useState } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { insertContactMemoEvent } from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

// 商談実施後の結果記録モーダル
//   面談予定タブのクライアント詳細から「商談結果記録」で起動
//   受注 / 保留 / ブレイク のいずれかを選び、議事録を残す
const RESULT_OPTIONS = [
  { id: 'won',     label: '受注',     statusTo: '準備中',     contractTo: '済', color: '#16A34A' },
  { id: 'on_hold', label: '保留',     statusTo: '中期フォロー', contractTo: '未', color: '#B8860B' },
  { id: 'lost',    label: 'ブレイク', statusTo: '中期フォロー', contractTo: '未', color: '#DC2626' },
];

export default function CRMMeetingReportModal({
  client, primaryContact, currentUser,
  onClose, onSaved, setClientData,
}) {
  const initialMeetingDate = (() => {
    if (client?.nextContactAt) return String(client.nextContactAt).slice(0, 16);
    const d = new Date();
    return d.toISOString().slice(0, 16);
  })();

  const [meetingAt, setMeetingAt] = useState(initialMeetingDate);
  const [result, setResult] = useState(null);
  const [salesAmount, setSalesAmount] = useState('');
  const [agenda, setAgenda] = useState('');
  const [outcome, setOutcome] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [internalMemo, setInternalMemo] = useState('');
  const [saving, setSaving] = useState(false);

  if (!client) return null;

  const handleSave = async () => {
    if (!result) { alert('商談結果（受注/保留/ブレイク）を選択してください'); return; }
    if (!agenda.trim() && !outcome.trim()) {
      alert('議題か先方の判断のいずれかは入力してください');
      return;
    }
    setSaving(true);

    const opt = RESULT_OPTIONS.find(o => o.id === result);
    const isWon = result === 'won';

    // 1) 議事録テキストを組み立て
    const reportLines = [
      `[商談実施] ${new Date(meetingAt).toLocaleString('ja-JP')}`,
      `[結果] ${opt.label}${isWon && salesAmount ? ' / 受注額 ¥' + Number(salesAmount).toLocaleString() : ''}`,
      agenda ? `[議題]\n${agenda}` : '',
      outcome ? `[先方の最終判断]\n${outcome}` : '',
      nextAction ? `[次のアクション]\n${nextAction}` : '',
      internalMemo ? `[内部メモ]\n${internalMemo}` : '',
    ].filter(Boolean).join('\n\n');

    // 2) clients テーブル更新
    const updatePayload = {
      status: opt.statusTo,
      contract_status: opt.contractTo,
      status_changed_at: new Date().toISOString(),
      next_contact_at: null,  // 面談が終わったので予定をクリア
    };
    // 既存 notes に追記
    const existingNotes = client.noteFirst || '';
    const newNotes = existingNotes
      ? `${existingNotes}\n\n----- ${new Date().toLocaleDateString('ja-JP')} 商談記録 -----\n${reportLines}`
      : reportLines;
    updatePayload.notes = newNotes;

    const { error } = await supabase
      .from('clients')
      .update(updatePayload)
      .eq('id', client._supaId);

    if (error) {
      setSaving(false);
      alert('保存に失敗しました: ' + (error.message || ''));
      return;
    }

    // 3) Activity Timeline へメモ記録（主担当があれば）
    if (primaryContact?.id) {
      try {
        await insertContactMemoEvent({
          contactId: primaryContact.id,
          bodyMd: reportLines,
          source: 'manual',
          authorName: currentUser || '',
        });
      } catch (e) {
        console.warn('[Meeting Report] memo event save failed', e);
      }
    }

    // 4) 親 clientData state を更新
    if (setClientData) {
      setClientData(prev => prev.map(c =>
        c._supaId === client._supaId
          ? {
              ...c,
              status: opt.statusTo,
              contract: opt.contractTo,
              statusChangedAt: updatePayload.status_changed_at,
              nextContactAt: null,
              noteFirst: newNotes,
            }
          : c
      ));
    }

    setSaving(false);
    if (onSaved) onSaved({ result, statusTo: opt.statusTo });
    onClose();
  };

  const textareaStyle = {
    width: '100%', padding: '7px 10px', borderRadius: radius.md,
    border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: font.family.sans,
    outline: 'none', background: color.gray50, color: color.textDark,
    boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: font.size.xs, fontWeight: font.weight.semibold,
    color: color.textMid, marginBottom: 3, display: 'block',
    letterSpacing: font.letterSpacing.wide,
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.55)', zIndex: 20003,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
        width: 580, maxHeight: '92vh', overflow: 'auto',
        boxShadow: shadow.xl,
      }}>
        <div style={{
          padding: '12px 20px', background: color.navy, color: color.white,
          fontWeight: font.weight.bold, fontSize: font.size.md,
        }}>
          商談結果を記録
          <div style={{
            fontSize: font.size.xs, color: alpha(color.white, 0.85),
            fontWeight: font.weight.normal, marginTop: 2,
          }}>
            {client.company}
          </div>
        </div>

        <div style={{ padding: '14px 20px' }}>
          {/* 商談実施日時 */}
          <div style={{ marginBottom: space[3] }}>
            <label style={labelStyle}>商談実施日時 <span style={{ color: color.danger }}>*</span></label>
            <Input
              size="sm"
              type="datetime-local"
              value={meetingAt}
              onChange={e => setMeetingAt(e.target.value)}
            />
          </div>

          {/* 結果（3択） */}
          <div style={{ marginBottom: space[3] }}>
            <label style={labelStyle}>商談結果 <span style={{ color: color.danger }}>*</span></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space[2] }}>
              {RESULT_OPTIONS.map(opt => {
                const active = result === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setResult(opt.id)}
                    style={{
                      padding: '12px', borderRadius: radius.md,
                      border: `2px solid ${active ? opt.color : color.border}`,
                      background: active ? opt.color + '18' : color.white,
                      color: active ? opt.color : color.textMid,
                      fontSize: font.size.md, fontWeight: font.weight.bold,
                      cursor: 'pointer', fontFamily: font.family.sans,
                    }}
                  >{opt.label}</button>
                );
              })}
            </div>
            {result && (
              <div style={{ marginTop: 6, fontSize: font.size.xs, color: color.textLight }}>
                → ステータスは「{RESULT_OPTIONS.find(o => o.id === result).statusTo}」に変わります
              </div>
            )}
          </div>

          {/* 受注額（受注時のみ） */}
          {result === 'won' && (
            <div style={{ marginBottom: space[3] }}>
              <label style={labelStyle}>受注額（円・任意）</label>
              <Input
                size="sm"
                type="number"
                value={salesAmount}
                onChange={e => setSalesAmount(e.target.value)}
                placeholder="例: 500000"
                min={0}
              />
            </div>
          )}

          {/* 議題 */}
          <div style={{ marginBottom: space[3] }}>
            <label style={labelStyle}>商談で扱った議題</label>
            <textarea
              value={agenda}
              onChange={e => setAgenda(e.target.value)}
              rows={3}
              placeholder="例：サービス概要のご説明、料金体系、開始時期"
              style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* 先方の最終判断 */}
          <div style={{ marginBottom: space[3] }}>
            <label style={labelStyle}>先方の最終判断・所感</label>
            <textarea
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              rows={3}
              placeholder="先方の温度感、決裁ライン、検討理由など"
              style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* 次のアクション */}
          <div style={{ marginBottom: space[3] }}>
            <label style={labelStyle}>次のアクション（任意）</label>
            <textarea
              value={nextAction}
              onChange={e => setNextAction(e.target.value)}
              rows={2}
              placeholder="例：契約書送付、再提案、3ヶ月後再アプローチ"
              style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* 内部メモ */}
          <div>
            <label style={labelStyle}>内部メモ（任意）</label>
            <textarea
              value={internalMemo}
              onChange={e => setInternalMemo(e.target.value)}
              rows={2}
              placeholder="社内引き継ぎ用のメモ"
              style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{
            marginTop: 14, padding: '8px 10px',
            background: '#FFFBEB', border: `1px solid ${alpha(color.gold, 0.4)}`, borderRadius: radius.sm,
            fontSize: font.size.xs, color: color.navy, lineHeight: 1.5,
          }}>
            保存すると以下が同時に実行されます:<br />
            ・ クライアントのステータスを自動遷移（受注→準備中 / 保留・ブレイク→中期フォロー）<br />
            ・ 議事録をクライアントの備考に追記<br />
            ・ Activity Timeline にメモ記録（主担当登録時）<br />
            ・ 「次回接点予定日」をクリア
          </div>
        </div>

        <div style={{
          padding: '10px 20px', borderTop: `1px solid ${color.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: space[2],
        }}>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={saving || !result}
          >
            {saving ? '保存中...' : '商談結果を保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
