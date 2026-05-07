import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import { dialPhone } from '../../../utils/phone';
import {
  insertClientCallRecord, deleteClientCallRecordByRound,
  promoteLeadCompanyToClient,
} from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50, GOLD } from './utils';

// ステータス定義（CRM新規開拓 専用）
//   既存3画面の「社長接続」ではなく「キーマン接続」、加えて「問い合わせフォーム」を新設
const STATUSES = [
  { id: 'absent',           label: '不通',             shortcut: '1', color: '#6B7280', excluded: false },
  { id: 'keyman_absent',    label: 'キーマン不在',     shortcut: '2', color: '#6B7280', excluded: false },
  { id: 'keyman_connect',   label: 'キーマン接続',     shortcut: '3', color: '#1E40AF', excluded: false },
  { id: 'appointment',      label: 'アポ獲得',         shortcut: '4', color: '#16A34A', excluded: false },
  { id: 'reception_block',  label: '受付ブロック',     shortcut: '5', color: '#DC2626', excluded: false },
  { id: 'reception_recall', label: '受付再コール',     shortcut: '6', color: '#B8860B', excluded: false },
  { id: 'keyman_recall',    label: 'キーマン再コール', shortcut: '7', color: '#B8860B', excluded: false },
  { id: 'rejected',         label: 'お断り',           shortcut: '8', color: '#DC2626', excluded: true  },
  { id: 'inquiry_form',     label: '問い合わせフォーム', shortcut: '9', color: '#7c3aed', excluded: false },
  { id: 'excluded',         label: '除外',             shortcut: '0', color: '#9CA3AF', excluded: true  },
];

const EXCLUDED_IDS = STATUSES.filter(s => s.excluded).map(s => s.id);

function getStatus(id) { return STATUSES.find(s => s.id === id); }

// 取得した clients 行を CRMView (clientData) のフォーマットに変換
function clientsRowToFE(c) {
  return {
    _supaId: c.id,
    no: c.sort_order || 0,
    status: c.status || '面談予定',
    contract: c.contract_status || '未',
    company: c.name || '',
    industry: c.industry || '',
    target: 0,
    rewardType: c.reward_type || '',
    paySite: c.payment_site || '',
    payNote: c.payment_note || '',
    listSrc: c.list_source || '',
    calendar: c.calendar_type || '',
    contact: c.contact_method || '',
    noteFirst: '',
    noteKickoff: '',
    noteRegular: '',
    googleCalendarId: c.google_calendar_id || '',
    clientEmail: c.client_email || '',
    schedulingUrl: c.scheduling_url || '',
    slackWebhookUrl: c.slack_webhook_url || '',
    slackWebhookUrlInternal: c.slack_webhook_url_internal || '',
    chatworkRoomId: c.chatwork_room_id || '',
    statusChangedAt: c.status_changed_at || null,
    nextContactAt: c.next_contact_at || null,
    contactPhone: c.contact_phone || '',
  };
}

export default function CRMLeadCallingScreen({ list, companies, records, currentUser, setClientData, onClose }) {
  const queryClient = useQueryClient();

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [memo, setMemo] = useState('');
  const [showScript, setShowScript] = useState(false);

  // 各企業の records をローカル状態でも保持（即時反映用）
  const [localRecords, setLocalRecords] = useState(records);
  useEffect(() => { setLocalRecords(records); }, [records]);

  // ID -> 各ラウンドのrecord を構築
  const recordsByCompany = useMemo(() => {
    const map = {};
    localRecords.forEach(r => {
      if (!map[r.lead_company_id]) map[r.lead_company_id] = {};
      map[r.lead_company_id][r.round] = r;
    });
    return map;
  }, [localRecords]);

  const getNextRound = (companyId) => {
    const rounds = recordsByCompany[companyId] || {};
    const keys = Object.keys(rounds).map(Number);
    return keys.length === 0 ? 1 : Math.max(...keys) + 1;
  };

  const isExcluded = (companyId) => {
    const rounds = recordsByCompany[companyId] || {};
    return Object.values(rounds).some(r => EXCLUDED_IDS.includes(r.status));
  };

  const getLatestStatus = (companyId) => {
    const rounds = recordsByCompany[companyId] || {};
    const keys = Object.keys(rounds).map(Number);
    if (keys.length === 0) return null;
    const latest = Math.max(...keys);
    return rounds[latest]?.status;
  };

  // 周回数の最大値を全体から取得（テーブル列数）
  const maxRound = useMemo(() => {
    let max = 0;
    Object.values(recordsByCompany).forEach(rounds => {
      Object.keys(rounds).forEach(r => { if (Number(r) > max) max = Number(r); });
    });
    return max;
  }, [recordsByCompany]);

  const displayRounds = Math.max(maxRound, 5);

  const selected = selectedIdx != null ? companies[selectedIdx] : null;
  const editRound = selected ? getNextRound(selected.id) : 1;

  // ステータス記録
  const recordStatus = async (statusId) => {
    if (!selected) return;
    const company = selected;
    const round = getNextRound(company.id);
    const status = getStatus(statusId);
    if (!status) return;

    const { data: rec, error } = await insertClientCallRecord({
      listId: list.id,
      leadCompanyId: company.id,
      round,
      status: statusId,
      memo: memo || null,
      getterName: currentUser || null,
    });
    if (error) {
      alert('記録に失敗しました: ' + (error.message || ''));
      return;
    }
    setLocalRecords(prev => [...prev, rec]);
    setMemo('');

    // 「アポ獲得」 → CRM の clients に新規登録、面談予定タブへ自動遷移
    if (statusId === 'appointment' && !company.promoted_to_client_id) {
      const { data: client, error: e2 } = await promoteLeadCompanyToClient(company);
      if (e2) {
        console.warn('[CRM Lead] promote failed', e2);
      } else if (client) {
        // ローカル状態の company に promoted_to_client_id をセット
        company.promoted_to_client_id = client.id;
        company.promoted_at = new Date().toISOString();
        // 親 clientData にも追加 → CRM「面談予定」タブで即見える
        if (setClientData) {
          setClientData(prev => [clientsRowToFE(client), ...prev]);
        }
        queryClient.invalidateQueries({ queryKey: ['crm-lead-companies', list.id] });
      }
    }

    // 次の架電可能企業に自動移動
    moveToNextCallable();
  };

  const moveToNextCallable = () => {
    if (selectedIdx == null) return;
    for (let j = selectedIdx + 1; j < companies.length; j++) {
      const c = companies[j];
      if (isExcluded(c.id)) continue;
      const latest = getLatestStatus(c.id);
      if (latest === 'reception_recall' || latest === 'keyman_recall') continue;
      setSelectedIdx(j);
      return;
    }
    // 末尾に達したら選択解除しない（その場で停止）
  };

  // 取り消し
  const undoLatestStatus = async (companyId, round) => {
    if (!confirm(`${round}周目の記録を取り消しますか？`)) return;
    await deleteClientCallRecordByRound(companyId, round);
    setLocalRecords(prev => prev.filter(r =>
      !(r.lead_company_id === companyId && r.round === round)
    ));
  };

  // キーボードショートカット
  const stableRef = useRef({});
  stableRef.current = { selected, memo };

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const cur = stableRef.current;
      if (!cur.selected) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (companies.length > 0) setSelectedIdx(0);
        }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => (i > 0 ? i - 1 : i));
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => (i < companies.length - 1 ? i + 1 : i));
        return;
      }
      const sc = STATUSES.find(s => s.shortcut === e.key);
      if (sc) {
        e.preventDefault();
        recordStatus(sc.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [companies, list.id]); // recordStatus などは閉包だが selectedIdx 等は state 経由で参照される

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: GRAY_50, zIndex: 10000, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ヘッダー */}
      <div style={{
        background: NAVY, padding: '8px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{list.name}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
            {list.industry || ''} ・ {companies.length} 件
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowScript(s => !s)}
            disabled={!list.script_body}
            style={{
              padding: '5px 12px', borderRadius: 3,
              border: '1px solid ' + (list.script_body ? '#fff' : 'rgba(255,255,255,0.3)'),
              background: 'transparent', color: list.script_body ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 11, fontWeight: 500, cursor: list.script_body ? 'pointer' : 'not-allowed',
              fontFamily: "'Noto Sans JP'",
            }}
          >{showScript ? 'スクリプトを閉じる' : 'スクリプト'}</button>
          <button
            onClick={onClose}
            style={{
              padding: '5px 12px', borderRadius: 3,
              border: '1px solid #fff', background: 'transparent',
              color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
            }}
          >閉じる</button>
        </div>
      </div>

      {/* スクリプト表示 */}
      {showScript && list.script_body && (
        <div style={{
          background: '#FFFBEB', borderBottom: '1px solid ' + GOLD + '80',
          padding: '12px 24px', maxHeight: 200, overflowY: 'auto',
          fontSize: 12, lineHeight: 1.7, color: C.textDark,
          whiteSpace: 'pre-wrap', flexShrink: 0,
        }}>
          {list.script_body}
        </div>
      )}

      {/* 企業選択時のステータスバー */}
      {selected && (
        <div style={{
          background: '#fff', borderBottom: '1px solid ' + GRAY_200,
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                {selected.company}
                {selected.promoted_to_client_id && (
                  <span style={{ marginLeft: 8, fontSize: 9, color: '#16A34A', border: '1px solid #16A34A', borderRadius: 2, padding: '1px 5px', fontWeight: 700 }}>
                    CRM登録済
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>
                {selected.business || ''} {selected.representative ? '・ ' + selected.representative : ''}
              </div>
            </div>
            {selected.phone && (
              <button
                onClick={() => dialPhone(selected.phone)}
                style={{
                  padding: '6px 14px', borderRadius: 4,
                  border: '1px solid ' + NAVY, background: NAVY + '15',
                  color: NAVY, fontSize: 13, fontWeight: 700,
                  fontFamily: "'JetBrains Mono'", cursor: 'pointer',
                }}
              >{selected.phone}</button>
            )}
            <span style={{ fontSize: 11, color: C.textMid }}>
              次は {editRound} 周目
            </span>
          </div>
          <input
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="メモ（任意）"
            style={{
              width: 280, padding: '6px 10px', borderRadius: 3,
              border: '1px solid ' + GRAY_200, fontSize: 11,
              fontFamily: "'Noto Sans JP'", outline: 'none',
            }}
          />
        </div>
      )}

      {/* メイン: 企業一覧テーブル */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 0' }}>
        <div style={{ background: '#fff', minHeight: '100%' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `40px 1.4fr 1fr 100px ${'40px '.repeat(displayRounds).trim()}`,
            padding: '8px 16px', background: NAVY,
            fontSize: 10, fontWeight: 600, color: '#fff',
            position: 'sticky', top: 0, zIndex: 1,
          }}>
            <span>No</span>
            <span>企業名</span>
            <span>事業内容</span>
            <span>電話番号</span>
            {Array.from({ length: displayRounds }, (_, i) => (
              <span key={i} style={{ textAlign: 'center' }}>{i + 1}</span>
            ))}
          </div>
          {companies.map((c, i) => {
            const isSelected = i === selectedIdx;
            const excluded = isExcluded(c.id);
            const rounds = recordsByCompany[c.id] || {};
            return (
              <div
                key={c.id}
                onClick={() => setSelectedIdx(i)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `40px 1.4fr 1fr 100px ${'40px '.repeat(displayRounds).trim()}`,
                  padding: '6px 16px', fontSize: 10, alignItems: 'center',
                  borderBottom: '1px solid ' + GRAY_200,
                  background: isSelected ? '#EFF6FF' : (excluded ? '#FEE2E230' : (i % 2 === 0 ? '#fff' : GRAY_50)),
                  borderLeft: isSelected ? '3px solid ' + NAVY : '3px solid transparent',
                  opacity: excluded ? 0.5 : 1,
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: C.textLight, fontFamily: "'JetBrains Mono'" }}>{c.no}</span>
                <span style={{ fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.company}
                  {c.promoted_to_client_id && (
                    <span style={{ marginLeft: 4, fontSize: 7, color: '#16A34A', border: '1px solid #16A34A', borderRadius: 2, padding: '0px 3px', fontWeight: 700 }}>CRM</span>
                  )}
                </span>
                <span style={{ color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.business || '-'}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", color: C.textMid }}>{c.phone || '-'}</span>
                {Array.from({ length: displayRounds }, (_, k) => {
                  const r = rounds[k + 1];
                  if (!r) return <span key={k} style={{ textAlign: 'center', color: C.textLight + '60' }}>-</span>;
                  const sd = getStatus(r.status);
                  return (
                    <span
                      key={k}
                      onClick={(e) => { e.stopPropagation(); undoLatestStatus(c.id, k + 1); }}
                      title={`${sd?.label || r.status}（クリックで取消）`}
                      style={{
                        textAlign: 'center', cursor: 'pointer',
                        fontSize: 7, fontWeight: 700, padding: '1px 2px',
                        borderRadius: 2,
                        background: (sd?.color || '#9CA3AF') + '20',
                        color: sd?.color || '#9CA3AF',
                      }}
                    >
                      {sd?.label.slice(0, 4) || r.status}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* フッター: ステータスボタン群 */}
      {selected && (
        <div style={{
          background: '#fff', borderTop: '1px solid ' + GRAY_200,
          padding: '10px 16px',
          display: 'flex', flexWrap: 'wrap', gap: 6,
          justifyContent: 'center', flexShrink: 0,
        }}>
          {STATUSES.map(s => (
            <button
              key={s.id}
              onClick={() => recordStatus(s.id)}
              style={{
                padding: '8px 14px', borderRadius: 4,
                border: '1px solid ' + s.color,
                background: s.color + '12', color: s.color,
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <kbd style={{
                fontSize: 9, fontWeight: 700, padding: '1px 4px',
                border: '1px solid ' + s.color, borderRadius: 2,
                fontFamily: "'JetBrains Mono'",
              }}>{s.shortcut}</kbd>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {!selected && (
        <div style={{
          background: '#fff', borderTop: '1px solid ' + GRAY_200,
          padding: '14px', textAlign: 'center', fontSize: 11, color: C.textLight,
          flexShrink: 0,
        }}>
          企業を選択するとショートカット（1〜0）でステータスを記録できます
        </div>
      )}
    </div>
  );
}
