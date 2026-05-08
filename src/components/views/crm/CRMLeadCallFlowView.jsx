import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import { dialPhone } from '../../../utils/phone';
import {
  insertClientCallRecord, deleteClientCallRecordByRound,
  promoteLeadCompanyToClient, updateClient, updateClientNextContactAt,
  invokeGetZoomRecording, updateClientCallRecordRecordingUrl,
} from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50, GOLD } from './utils';
import CRMLeadAppoModal from './CRMLeadAppoModal';
import CRMLeadRecallModal from './CRMLeadRecallModal';

// ステータス定義（CRM新規開拓 専用）
//   既存3画面の「社長接続」ではなく「キーマン接続」、加えて「問い合わせフォーム」を新設
//   ショートカットは既存ソーシング側と同じく Mac=数字キー / Win=Fキー（order 1〜10）
const STATUSES = [
  { id: 'absent',           label: '不通',             order: 1,  color: '#6B7280', excluded: false, recall: false, isAppo: false },
  { id: 'keyman_absent',    label: 'キーマン不在',     order: 2,  color: '#6B7280', excluded: false, recall: false, isAppo: false },
  { id: 'keyman_connect',   label: 'キーマン接続',     order: 3,  color: '#1E40AF', excluded: false, recall: false, isAppo: false },
  { id: 'appointment',      label: 'アポ獲得',         order: 4,  color: '#16A34A', excluded: false, recall: false, isAppo: true  },
  { id: 'reception_block',  label: '受付ブロック',     order: 5,  color: '#DC2626', excluded: false, recall: false, isAppo: false },
  { id: 'reception_recall', label: '受付再コール',     order: 6,  color: '#B8860B', excluded: false, recall: true,  isAppo: false },
  { id: 'keyman_recall',    label: 'キーマン再コール', order: 7,  color: '#B8860B', excluded: false, recall: true,  isAppo: false },
  { id: 'rejected',         label: 'お断り',           order: 8,  color: '#DC2626', excluded: true,  recall: false, isAppo: false },
  { id: 'inquiry_form',     label: '問い合わせフォーム', order: 9,  color: '#7c3aed', excluded: false, recall: false, isAppo: false },
  { id: 'excluded',         label: '除外',             order: 10, color: '#9CA3AF', excluded: true,  recall: false, isAppo: false },
];

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
function shortcutLabel(order) {
  // 10番目は Mac で '0', Win で 'F10'
  if (IS_MAC) return order === 10 ? '0' : String(order);
  return `F${order}`;
}
function matchShortcut(eventKey, order) {
  if (IS_MAC) return eventKey === (order === 10 ? '0' : String(order));
  return eventKey === `F${order}`;
}

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

export default function CRMLeadCallFlowView({ list, companies, records, currentUser, members = [], setClientData, onClose }) {
  const queryClient = useQueryClient();

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [memo, setMemo] = useState('');
  const [showScript, setShowScript] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState(null);  // 'no' | 'lastCall' | 'status' | null
  const [sortDir, setSortDir] = useState('asc');
  const [appoModalCompany, setAppoModalCompany] = useState(null);
  const [pendingAppoMemo, setPendingAppoMemo] = useState('');
  const [recallModal, setRecallModal] = useState(null);  // { company, statusId, statusLabel } or null
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeApplied, setRangeApplied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [autoDial, setAutoDial] = useState(false);
  const [rightTab, setRightTab] = useState('script'); // 'script' | 'qa' | 'history'

  // 録音URLをZoom APIから取得
  const fetchRecordingUrl = async (phone, calledAt, prevCalledAt = null) => {
    try {
      const member = members.find(m => (typeof m === 'string' ? m : m.name) === currentUser);
      const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
      if (!zoomUserId || !phone) return null;
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      const { data } = await invokeGetZoomRecording({
        zoom_user_id: zoomUserId,
        callee_phone: normalizedPhone,
        called_at: calledAt,
        prev_called_at: prevCalledAt,
      });
      return data?.recording_url || null;
    } catch (e) {
      console.error('[CRM Lead Flow fetchRecordingUrl] error:', e);
      return null;
    }
  };

  const attachRecordingInBackground = (recId, phone, calledAt, prevCalledAt) => {
    if (!recId || !phone) return;
    setTimeout(async () => {
      let url = await fetchRecordingUrl(phone, calledAt, prevCalledAt);
      if (!url) {
        setTimeout(async () => {
          const url2 = await fetchRecordingUrl(phone, calledAt, prevCalledAt);
          if (url2) {
            await updateClientCallRecordRecordingUrl(recId, url2);
            setLocalRecords(prev => prev.map(r => r.id === recId ? { ...r, recording_url: url2 } : r));
          }
        }, 60_000);
        return;
      }
      await updateClientCallRecordRecordingUrl(recId, url);
      setLocalRecords(prev => prev.map(r => r.id === recId ? { ...r, recording_url: url } : r));
    }, 30_000);
  };

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

  // 統計（ヘッダー表示用）
  const stats = useMemo(() => {
    const total = companies.length;
    let callable = 0, called = 0, appo = 0;
    companies.forEach(c => {
      if (!isExcluded(c.id)) callable += 1;
      const rounds = recordsByCompany[c.id] || {};
      const ks = Object.keys(rounds);
      if (ks.length > 0) called += 1;
      const hasAppo = Object.values(rounds).some(r => r.status === 'appointment');
      if (hasAppo) appo += 1;
    });
    return { total, callable, called, appo };
  }, [companies, recordsByCompany]);

  // 検索＋範囲＋ソート適用後の表示用 companies
  const visibleCompanies = useMemo(() => {
    let arr = companies;
    if (rangeApplied) {
      const s = parseInt(rangeStart) || 1;
      const e = parseInt(rangeEnd) || companies.length;
      arr = arr.filter(c => (c.no || 0) >= s && (c.no || 0) <= e);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      arr = arr.filter(c =>
        (c.company || '').toLowerCase().includes(q) ||
        (c.business || '').toLowerCase().includes(q) ||
        (c.representative || '').toLowerCase().includes(q)
      );
    }
    if (sortBy) {
      const sign = sortDir === 'asc' ? 1 : -1;
      arr = [...arr].sort((a, b) => {
        if (sortBy === 'no') return sign * ((a.no || 0) - (b.no || 0));
        if (sortBy === 'company') return sign * (a.company || '').localeCompare(b.company || '', 'ja');
        if (sortBy === 'lastCall') {
          const ar = recordsByCompany[a.id] || {};
          const br = recordsByCompany[b.id] || {};
          const aLast = Object.values(ar).map(x => x.called_at).sort().pop() || '';
          const bLast = Object.values(br).map(x => x.called_at).sort().pop() || '';
          return sign * (aLast > bLast ? 1 : aLast < bLast ? -1 : 0);
        }
        if (sortBy === 'status') {
          const aSt = getLatestStatus(a.id) || '~';
          const bSt = getLatestStatus(b.id) || '~';
          return sign * (aSt > bSt ? 1 : aSt < bSt ? -1 : 0);
        }
        return 0;
      });
    }
    return arr;
  }, [companies, searchTerm, sortBy, sortDir, recordsByCompany, rangeApplied, rangeStart, rangeEnd]);

  // selectedIdx は visibleCompanies 上の index（フィルタや並び替えに追随）
  const selected = selectedIdx != null ? visibleCompanies[selectedIdx] : null;
  const editRound = selected ? getNextRound(selected.id) : 1;

  // ステータス記録（アポ獲得は詳細モーダル経由、それ以外は即時記録）
  const recordStatus = async (statusId) => {
    if (!selected) return;
    const company = selected;
    const status = getStatus(statusId);
    if (!status) return;

    // アポ獲得は詳細モーダル経由で別ハンドラへ
    if (statusId === 'appointment') {
      setPendingAppoMemo(memo);
      setAppoModalCompany(company);
      return;
    }

    // 受付再コール / キーマン再コール は再コールモーダル経由
    if (status.recall) {
      setRecallModal({ company, statusId, statusLabel: status.label });
      return;
    }

    const round = getNextRound(company.id);
    const calledAt = new Date().toISOString();
    const prevRounds = recordsByCompany[company.id] || {};
    const prevRoundKeys = Object.keys(prevRounds).map(Number);
    const prevRec = prevRoundKeys.length > 0 ? prevRounds[Math.max(...prevRoundKeys)] : null;
    const prevCalledAt = prevRec?.called_at || null;

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
    attachRecordingInBackground(rec.id, company.phone, calledAt, prevCalledAt);
    setMemo('');
    moveToNextCallable();
  };

  // アポ獲得モーダルからの詳細保存
  const handleAppoSubmit = async (details) => {
    const company = appoModalCompany;
    if (!company) return;
    const round = getNextRound(company.id);

    // 1) call_record にメモ＋詳細を JSON で保存
    const recordMemo = [
      pendingAppoMemo,
      details.internalMemo,
      details.impression ? `[先方所感] ${details.impression}` : '',
      `[面談予定] ${new Date(details.meetingAt).toLocaleString('ja-JP')} / ${({
        online: 'オンライン',
        in_person: '対面（先方訪問）',
        our_office: '対面（弊社来訪）',
        phone: '電話',
      }[details.meetingMode] || details.meetingMode)}`,
      details.contactName ? `[キーマン] ${details.contactName}${details.contactRole ? '（' + details.contactRole + '）' : ''}` : '',
    ].filter(Boolean).join('\n');

    const calledAt = new Date().toISOString();
    const prevRoundsAppo = recordsByCompany[company.id] || {};
    const prevRoundKeysAppo = Object.keys(prevRoundsAppo).map(Number);
    const prevRecAppo = prevRoundKeysAppo.length > 0 ? prevRoundsAppo[Math.max(...prevRoundKeysAppo)] : null;
    const prevCalledAtAppo = prevRecAppo?.called_at || null;

    const { data: rec, error } = await insertClientCallRecord({
      listId: list.id,
      leadCompanyId: company.id,
      round,
      status: 'appointment',
      memo: recordMemo,
      getterName: currentUser || null,
    });
    if (error) {
      alert('アポ獲得の保存に失敗しました: ' + (error.message || ''));
      return;
    }
    setLocalRecords(prev => [...prev, rec]);
    attachRecordingInBackground(rec.id, company.phone, calledAt, prevCalledAtAppo);

    // 2) clients への新規登録 or 既存の更新
    if (!company.promoted_to_client_id) {
      const { data: client, error: e2 } = await promoteLeadCompanyToClient(company, {
        contactPerson: details.contactName || null,
      });
      if (e2) {
        console.warn('[CRM Lead] promote failed', e2);
      } else if (client) {
        company.promoted_to_client_id = client.id;
        company.promoted_at = new Date().toISOString();

        // 詳細を反映: 面談予定日時と先方所感をクライアントに保存
        await updateClient(client.id, {
          company: client.name,
          status: '面談予定',
          contract: '未',
          industry: client.industry || '',
          rewardType: '', paySite: '', payNote: '',
          listSrc: '', calendar: '', contact: '',
          noteFirst: details.impression || '',
          clientEmail: details.contactEmail || null,
          slackWebhookUrl: null, slackWebhookUrlInternal: null,
          chatworkRoomId: null, googleCalendarId: null, schedulingUrl: null,
          nextContactAt: details.meetingAt,
          statusChangedAt: new Date().toISOString(),
        });

        if (setClientData) {
          const fe = clientsRowToFE(client);
          fe.noteFirst = details.impression || '';
          fe.nextContactAt = details.meetingAt;
          fe.contactPhone = details.contactPhone || '';
          fe.clientEmail = details.contactEmail || '';
          setClientData(prev => [fe, ...prev]);
        }
        queryClient.invalidateQueries({ queryKey: ['crm-lead-companies', list.id] });
      }
    } else {
      // 既に転記済みの場合は next_contact_at を更新
      await updateClientNextContactAt(company.promoted_to_client_id, details.meetingAt);
    }

    setMemo('');
    setPendingAppoMemo('');
    setAppoModalCompany(null);
    moveToNextCallable();
  };

  // 再コールモーダルからの保存
  const handleRecallSubmit = async ({ recallAt, memo: recallMemo }) => {
    if (!recallModal) return;
    const { company, statusId } = recallModal;
    const round = getNextRound(company.id);
    const calledAt = new Date().toISOString();
    const prevRoundsRecall = recordsByCompany[company.id] || {};
    const prevRoundKeysRecall = Object.keys(prevRoundsRecall).map(Number);
    const prevRecRecall = prevRoundKeysRecall.length > 0 ? prevRoundsRecall[Math.max(...prevRoundKeysRecall)] : null;
    const prevCalledAtRecall = prevRecRecall?.called_at || null;

    const fullMemo = [
      memo,
      recallMemo,
      `[再コール予定: ${new Date(recallAt).toLocaleString('ja-JP')}]`,
    ].filter(Boolean).join('\n');

    const { data: rec, error } = await insertClientCallRecord({
      listId: list.id,
      leadCompanyId: company.id,
      round,
      status: statusId,
      memo: fullMemo,
      getterName: currentUser || null,
    });
    if (error) {
      alert('再コール記録に失敗しました: ' + (error.message || ''));
      return;
    }
    setLocalRecords(prev => [...prev, rec]);
    attachRecordingInBackground(rec.id, company.phone, calledAt, prevCalledAtRecall);
    setMemo('');
    setRecallModal(null);
    moveToNextCallable();
  };

  const moveToNextCallable = () => {
    if (selectedIdx == null) return;
    for (let j = selectedIdx + 1; j < visibleCompanies.length; j++) {
      const c = visibleCompanies[j];
      if (isExcluded(c.id)) continue;
      const latest = getLatestStatus(c.id);
      if (latest === 'reception_recall' || latest === 'keyman_recall') continue;
      setSelectedIdx(j);
      // オートコール時: 自動で電話発信
      if (autoDial && c.phone) {
        setTimeout(() => dialPhone(c.phone), 600);
      }
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
  stableRef.current = { selected, memo, showHelp, appoModalOpen: !!appoModalCompany, recallModalOpen: !!recallModal };

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const cur = stableRef.current;
      if (!cur.selected) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (visibleCompanies.length > 0) setSelectedIdx(0);
        }
        return;
      }
      // モーダル系が開いていればショートカットは無効
      if (cur.appoModalOpen || cur.recallModalOpen) return;
      if (e.key === '?') { e.preventDefault(); setShowHelp(h => !h); return; }
      if (e.key === 'Escape') {
        if (cur.showHelp) { e.preventDefault(); setShowHelp(false); return; }
        e.preventDefault(); onClose(); return;
      }
      if (cur.showHelp) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => (i > 0 ? i - 1 : i));
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => (i < visibleCompanies.length - 1 ? i + 1 : i));
        return;
      }
      const sc = STATUSES.find(s => matchShortcut(e.key, s.order));
      if (sc) {
        e.preventDefault();
        recordStatus(sc.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visibleCompanies, list.id]);

  // 最小化中の小型UI
  if (isMinimized) {
    const calledCount = Object.keys(recordsByCompany).length;
    const apptCount = Object.values(recordsByCompany).filter(rounds => {
      const ks = Object.keys(rounds).map(Number);
      const latest = ks.length > 0 ? rounds[Math.max(...ks)] : null;
      return latest?.status === 'appointment';
    }).length;
    return (
      <div style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 10000,
        width: 300, background: '#fff',
        border: '1px solid ' + GRAY_200, borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}>
        <div style={{
          background: NAVY, color: '#fff',
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8,
        }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{list.name}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)' }}>
              架電中（CRM新規開拓）
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setIsMinimized(false)}
              title="最大化"
              style={{
                width: 24, height: 22, borderRadius: 2,
                border: '1px solid #fff', background: 'transparent',
                color: '#fff', fontSize: 12, cursor: 'pointer', padding: 0,
              }}
            >□</button>
            <button
              onClick={onClose}
              title="閉じる"
              style={{
                width: 24, height: 22, borderRadius: 2,
                border: '1px solid #fff', background: 'transparent',
                color: '#fff', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1,
              }}
            >×</button>
          </div>
        </div>
        <div style={{ padding: '10px 12px', fontSize: 11 }}>
          <div style={{ color: C.textMid, marginBottom: 4 }}>
            選択中: <strong style={{ color: NAVY }}>{selected?.company || '—'}</strong>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 6,
            fontSize: 10, color: C.textLight,
          }}>
            <span>件数 {companies.length}</span>
            <span>架電済 {calledCount}</span>
            <span style={{ color: '#16A34A', fontWeight: 600 }}>アポ {apptCount}</span>
          </div>
        </div>
      </div>
    );
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{list.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
              {list.industry || '業界未設定'}
              {searchTerm && (
                <span> ・ 表示 {visibleCompanies.length} 件</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {[
              { label: '件数', val: stats.total, color: '#fff' },
              { label: '架電可能', val: stats.callable, color: 'rgba(255,255,255,0.85)' },
              { label: '架電済', val: stats.called, color: '#90EE90' },
              { label: 'アポ', val: stats.appo, color: '#FFD66B' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', minWidth: 36 }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>{s.label}</div>
                <div style={{
                  fontSize: 16, fontWeight: 700, color: s.color,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
                }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="企業名・事業内容..."
            style={{
              padding: '5px 10px', borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.1)', color: '#fff',
              fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none',
              width: 180,
            }}
          />
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 3,
            border: '1px solid ' + (autoDial ? '#FFD66B' : 'rgba(255,255,255,0.4)'),
            background: autoDial ? 'rgba(255,214,107,0.18)' : 'transparent',
            color: autoDial ? '#FFD66B' : '#fff',
            fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
          }}>
            <input
              type="checkbox"
              checked={autoDial}
              onChange={e => setAutoDial(e.target.checked)}
              style={{ margin: 0 }}
            />
            オートコール
          </label>
          <button
            onClick={() => setShowHelp(h => !h)}
            title="ショートカット一覧"
            style={{
              padding: '5px 10px', borderRadius: 3,
              border: '1px solid #fff', background: 'transparent',
              color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
              minWidth: 28,
            }}
          >?</button>
          <button
            onClick={() => setIsMinimized(true)}
            title="最小化（他画面を操作できる小ウィンドウへ）"
            style={{
              padding: '5px 10px', borderRadius: 3,
              border: '1px solid #fff', background: 'transparent',
              color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
              minWidth: 28,
            }}
          >−</button>
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

      {/* 範囲指定バー */}
      <div style={{
        background: '#fff', borderBottom: '1px solid ' + GRAY_200,
        padding: '6px 24px',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: C.textMid, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600 }}>範囲指定</span>
        <span>No.</span>
        <input
          type="number"
          value={rangeStart}
          onChange={e => setRangeStart(e.target.value)}
          placeholder="1"
          min={1}
          style={{
            width: 70, padding: '4px 8px', borderRadius: 3,
            border: '1px solid ' + GRAY_200, fontSize: 11,
            fontFamily: "'JetBrains Mono'", textAlign: 'center', outline: 'none',
          }}
        />
        <span>〜</span>
        <input
          type="number"
          value={rangeEnd}
          onChange={e => setRangeEnd(e.target.value)}
          placeholder={String(companies.length)}
          min={1}
          style={{
            width: 70, padding: '4px 8px', borderRadius: 3,
            border: '1px solid ' + GRAY_200, fontSize: 11,
            fontFamily: "'JetBrains Mono'", textAlign: 'center', outline: 'none',
          }}
        />
        <button
          onClick={() => {
            if (!rangeStart && !rangeEnd) { alert('範囲を入力してください'); return; }
            setRangeApplied(true);
            setSelectedIdx(null);
          }}
          style={{
            padding: '4px 12px', borderRadius: 3, border: 'none',
            background: NAVY, color: '#fff', fontSize: 11, fontWeight: 500,
            cursor: 'pointer', fontFamily: "'Noto Sans JP'",
          }}
        >適用</button>
        {rangeApplied && (
          <button
            onClick={() => {
              setRangeApplied(false);
              setRangeStart(''); setRangeEnd('');
              setSelectedIdx(null);
            }}
            style={{
              padding: '4px 12px', borderRadius: 3,
              border: '1px solid ' + GRAY_200, background: '#fff',
              color: C.textMid, fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
            }}
          >解除</button>
        )}
        {rangeApplied && (
          <span style={{ fontSize: 10, color: C.textLight }}>
            （範囲適用中: {visibleCompanies.length} 件）
          </span>
        )}
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

      {/* メイン: 3ペイン（左=企業リスト / 中央=大型UI / 右=スクリプト・履歴） */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '240px 1fr 320px',
        overflow: 'hidden', minHeight: 0,
      }}>
        {/* 左ペイン: 企業リスト（コンパクト） */}
        <div style={{
          background: GRAY_50, borderRight: '1px solid ' + GRAY_200,
          overflowY: 'auto',
        }}>
          {visibleCompanies.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', fontSize: 11, color: C.textLight }}>
              該当企業なし
            </div>
          ) : (
            visibleCompanies.map((c, i) => {
              const isSelected = i === selectedIdx;
              const excluded = isExcluded(c.id);
              const latest = getLatestStatus(c.id);
              const latestStatus = latest ? getStatus(latest) : null;
              const rounds = recordsByCompany[c.id] || {};
              const roundCount = Object.keys(rounds).length;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedIdx(i)}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid ' + GRAY_200,
                    background: isSelected ? '#EFF6FF' : 'transparent',
                    borderLeft: isSelected ? '3px solid ' + NAVY : '3px solid transparent',
                    cursor: 'pointer',
                    opacity: excluded ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>
                      No.{c.no}
                    </span>
                    {roundCount > 0 && (
                      <span style={{ fontSize: 8, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>
                        {roundCount}周
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: NAVY,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.company}
                    {c.promoted_to_client_id && (
                      <span style={{
                        marginLeft: 4, fontSize: 7, color: '#16A34A',
                        border: '1px solid #16A34A', borderRadius: 2, padding: '0px 3px', fontWeight: 700,
                      }}>CRM</span>
                    )}
                  </div>
                  {latestStatus && (
                    <div style={{
                      marginTop: 3, fontSize: 8, fontWeight: 700, color: latestStatus.color,
                    }}>
                      {latestStatus.label}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 中央ペイン: 大型UI */}
        <div style={{ overflowY: 'auto', padding: '20px 28px', background: '#fff' }}>
          {selected ? (
            <>
              {/* 企業情報（大） */}
              <div style={{ marginBottom: 22, paddingBottom: 14, borderBottom: '1px solid ' + GRAY_200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>
                    {selected.company}
                  </span>
                  {selected.promoted_to_client_id && (
                    <span style={{
                      fontSize: 10, color: '#16A34A', border: '1px solid #16A34A',
                      borderRadius: 3, padding: '2px 7px', fontWeight: 700,
                    }}>CRM登録済</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.textMid }}>
                  {selected.business || ''}
                  {selected.representative ? ' ・ ' + selected.representative : ''}
                </div>
                <div style={{ fontSize: 11, color: C.textLight, marginTop: 6 }}>
                  次は <strong style={{ color: NAVY }}>{editRound}</strong> 周目
                </div>
              </div>

              {/* 電話番号 + 発信ボタン */}
              <div style={{ marginBottom: 18 }}>
                <div style={{
                  fontSize: 28, fontWeight: 700, color: NAVY,
                  fontFamily: "'JetBrains Mono'", letterSpacing: 2,
                  fontVariantNumeric: 'tabular-nums', textAlign: 'center', marginBottom: 8,
                }}>
                  {selected.phone || '電話番号なし'}
                </div>
                {selected.phone && (
                  <button
                    onClick={() => dialPhone(selected.phone)}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 4,
                      background: NAVY, color: '#fff',
                      fontSize: 14, fontWeight: 700, border: 'none',
                      cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                    }}
                  >発信</button>
                )}
              </div>

              {/* メモ */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 4 }}>メモ</div>
                <textarea
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  rows={3}
                  placeholder="架電メモ（任意）"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 3,
                    border: '1px solid ' + GRAY_200, fontSize: 11,
                    fontFamily: "'Noto Sans JP'", outline: 'none',
                    boxSizing: 'border-box', resize: 'vertical',
                  }}
                />
              </div>

              {/* ステータスボタン（大型グリッド 2列） */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {STATUSES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => recordStatus(s.id)}
                    style={{
                      padding: '14px', borderRadius: 4,
                      border: '1px solid ' + s.color,
                      background: s.color + '12', color: s.color,
                      fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                    }}
                  >
                    <span>{s.label}</span>
                    <kbd style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px',
                      border: '1px solid ' + s.color, borderRadius: 2,
                      fontFamily: "'JetBrains Mono'",
                    }}>{shortcutLabel(s.order)}</kbd>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: C.textLight, fontSize: 13, marginTop: 100 }}>
              左のリストから企業を選択してください<br />
              <span style={{ fontSize: 11, color: C.textLight + 'aa' }}>
                矢印キーで企業移動 ・ {IS_MAC ? '1〜0' : 'F1〜F10'} でステータス記録 ・ ? でヘルプ
              </span>
            </div>
          )}
        </div>

        {/* 右ペイン: スクリプト / Q&A / 履歴 タブ */}
        <div style={{
          background: GRAY_50, borderLeft: '1px solid ' + GRAY_200,
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{ display: 'flex', borderBottom: '1px solid ' + GRAY_200, flexShrink: 0 }}>
            {[
              { key: 'script',  label: 'スクリプト' },
              { key: 'qa',      label: 'Q&A' },
              { key: 'history', label: '履歴' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setRightTab(t.key)}
                style={{
                  flex: 1, padding: '8px 4px',
                  border: 'none',
                  background: rightTab === t.key ? '#fff' : 'transparent',
                  color: rightTab === t.key ? NAVY : C.textMid,
                  fontSize: 11, fontWeight: rightTab === t.key ? 700 : 500,
                  cursor: 'pointer',
                  borderBottom: rightTab === t.key ? '2px solid ' + NAVY : '2px solid transparent',
                  fontFamily: "'Noto Sans JP'",
                }}
              >{t.label}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#fff' }}>
            {rightTab === 'script' && (
              list.script_body ? (
                <div style={{ fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: C.textDark }}>
                  {list.script_body}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.textLight, textAlign: 'center', marginTop: 40 }}>
                  スクリプト未設定<br />
                  <span style={{ fontSize: 10 }}>リスト詳細画面で編集できます</span>
                </div>
              )
            )}
            {rightTab === 'qa' && (
              <div style={{ fontSize: 11, color: C.textLight, textAlign: 'center', marginTop: 40 }}>
                想定問答（Q&A）<br />
                <span style={{ fontSize: 10 }}>v1 では未設定。今後の機能追加で対応予定</span>
              </div>
            )}
            {rightTab === 'history' && (
              selected ? (
                (() => {
                  const rounds = recordsByCompany[selected.id] || {};
                  const ks = Object.keys(rounds).map(Number).sort((a, b) => a - b);
                  if (ks.length === 0) {
                    return <div style={{ fontSize: 11, color: C.textLight, textAlign: 'center', marginTop: 40 }}>架電履歴なし</div>;
                  }
                  return ks.map(r => {
                    const rec = rounds[r];
                    const sd = getStatus(rec.status);
                    return (
                      <div key={r} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px dashed ' + GRAY_200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <div style={{ fontSize: 9, color: C.textLight }}>
                            {r} 周目 ・ {new Date(rec.called_at).toLocaleString('ja-JP')}
                          </div>
                          {rec.recording_url && (
                            <a
                              href={rec.recording_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                fontSize: 9, fontWeight: 700, color: NAVY,
                                border: '1px solid ' + NAVY, borderRadius: 2,
                                padding: '1px 5px', textDecoration: 'none',
                              }}
                            >録音</a>
                          )}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: sd?.color || '#9CA3AF', marginBottom: 4 }}>
                          {sd?.label || rec.status}
                        </div>
                        {rec.memo && (
                          <div style={{ fontSize: 10, color: C.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {rec.memo}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              ) : (
                <div style={{ fontSize: 11, color: C.textLight, textAlign: 'center', marginTop: 40 }}>企業を選択してください</div>
              )
            )}
          </div>
        </div>
      </div>

      {/* アポ獲得詳細モーダル */}
      {appoModalCompany && (
        <CRMLeadAppoModal
          company={appoModalCompany}
          defaultGetterName={currentUser}
          onSubmit={handleAppoSubmit}
          onCancel={() => { setAppoModalCompany(null); setPendingAppoMemo(''); }}
        />
      )}

      {/* 再コール予定モーダル */}
      {recallModal && (
        <CRMLeadRecallModal
          company={recallModal.company}
          statusLabel={recallModal.statusLabel}
          onSubmit={handleRecallSubmit}
          onCancel={() => setRecallModal(null)}
        />
      )}

      {/* ヘルプ（ショートカット一覧） */}
      {showHelp && (
        <div onClick={() => setShowHelp(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.55)', zIndex: 20004,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
            width: 440, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 14 }}>
              キーボードショートカット
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {STATUSES.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '5px 8px', width: 80 }}>
                      <kbd style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                        background: '#f3f4f6', border: '1px solid #d1d5db',
                        fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 700, color: '#374151',
                      }}>{shortcutLabel(s.order)}</kbd>
                    </td>
                    <td style={{ padding: '5px 8px', color: '#374151' }}>{s.label}</td>
                  </tr>
                ))}
                {[
                  ['← →  /  ↑ ↓', '前後の企業に移動'],
                  ['Esc', '画面を閉じる / モーダルを閉じる'],
                  ['?', 'このヘルプを表示／非表示'],
                ].map(([key, desc]) => (
                  <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '5px 8px', width: 80 }}>
                      <kbd style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                        background: '#f3f4f6', border: '1px solid #d1d5db',
                        fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 700, color: '#374151',
                      }}>{key}</kbd>
                    </td>
                    <td style={{ padding: '5px 8px', color: '#374151' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setShowHelp(false)} style={{
              marginTop: 14, width: '100%', padding: '6px 12px', borderRadius: 3,
              border: 'none', background: NAVY, color: '#fff',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
            }}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
