import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Badge } from '../../ui';
import { dialPhone } from '../../../utils/phone';
import {
  insertClientCallRecord, deleteClientCallRecordByRound,
  promoteLeadCompanyToClient, updateClient, updateClientNextContactAt,
  invokeGetZoomRecording, updateClientCallRecordRecordingUrl,
} from '../../../lib/supabaseWrite';
import { useIsMobile } from '../../../hooks/useIsMobile';
import CRMLeadAppoModal from './CRMLeadAppoModal';
import CRMLeadRecallModal from './CRMLeadRecallModal';

// ステータス定義（CRM新規開拓 専用）
//   既存3画面の「社長接続」ではなく「キーマン接続」、加えて「問い合わせフォーム」を新設
//   ショートカットは既存ソーシング側と同じく Mac=数字キー / Win=Fキー（order 1〜10）
//   配色は src/constants/callResults.js の Lists ページと同じ navy/gray/blue/red の落ち着いたトーンに統一
const STATUSES = [
  { id: 'absent',           label: '不通',             order: 1,  color: '#6B7280', bg: '#6B728018', excluded: false, recall: false, isAppo: false },
  { id: 'keyman_absent',    label: 'キーマン不在',     order: 2,  color: '#6B7280', bg: '#6B728018', excluded: false, recall: false, isAppo: false },
  { id: 'keyman_connect',   label: 'キーマン接続',     order: 3,  color: '#2563EB', bg: '#2563EB18', excluded: false, recall: false, isAppo: false },
  { id: 'appointment',      label: 'アポ獲得',         order: 4,  color: '#0D2247', bg: '#0D224710', excluded: false, recall: false, isAppo: true  },
  { id: 'reception_block',  label: '受付ブロック',     order: 5,  color: '#6B7280', bg: '#6B728018', excluded: false, recall: false, isAppo: false },
  { id: 'reception_recall', label: '受付再コール',     order: 6,  color: '#2563EB', bg: '#2563EB18', excluded: false, recall: true,  isAppo: false },
  { id: 'keyman_recall',    label: 'キーマン再コール', order: 7,  color: '#2563EB', bg: '#2563EB18', excluded: false, recall: true,  isAppo: false },
  { id: 'rejected',         label: 'お断り',           order: 8,  color: '#6B7280', bg: '#6B728018', excluded: true,  recall: false, isAppo: false },
  { id: 'inquiry_form',     label: '問い合わせフォーム', order: 9,  color: '#2563EB', bg: '#2563EB18', excluded: false, recall: false, isAppo: false },
  { id: 'excluded',         label: '除外',             order: 10, color: '#e53835', bg: '#e5383510', excluded: true,  recall: false, isAppo: false },
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

export default function CRMLeadCallingScreen({ list, companies, records, currentUser, members = [], setClientData, onClose, filters = null, onOpenFocus = null }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // モバイル時は架電画面の機能が複雑なため PC を推奨
  if (isMobile) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: color.white, zIndex: 10000, padding: space[6],
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: font.family.sans,
      }}>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[1], textAlign: 'center' }}>
          架電画面はPCでご利用ください
        </div>
        <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[5], textAlign: 'center', lineHeight: font.lineHeight.relaxed }}>
          ステータス記録・周回管理・録音保存などの機能を<br />
          快適に使うために、PCでの操作を推奨しています。
        </div>
        <Button variant="outline" size="md" onClick={onClose}>← 戻る</Button>
      </div>
    );
  }

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

  // 録音URLをZoom APIから取得（架電直後に呼び出す）
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
      console.error('[CRM Lead fetchRecordingUrl] error:', e);
      return null;
    }
  };

  // バックグラウンドで録音URLを取得して record に紐付ける
  const attachRecordingInBackground = (recId, phone, calledAt, prevCalledAt) => {
    if (!recId || !phone) return;
    setTimeout(async () => {
      let url = await fetchRecordingUrl(phone, calledAt, prevCalledAt);
      if (!url) {
        // 1度目で取れなければ60秒後に再試行
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
    // 親 (CRMLeadListDetailView) から渡された絞り込みを最優先で適用
    if (filters?.rangeStart != null || filters?.rangeEnd != null) {
      const s = filters.rangeStart || 1;
      const e = filters.rangeEnd || companies.length;
      arr = arr.filter(c => (c.no || 0) >= s && (c.no || 0) <= e);
    }
    if (filters?.statusFilter && filters.statusFilter.length > 0) {
      arr = arr.filter(c => {
        const latest = getLatestStatus(c.id);
        return latest && filters.statusFilter.includes(latest);
      });
    }
    if (filters?.prefFilter && filters.prefFilter.length > 0) {
      arr = arr.filter(c => filters.prefFilter.includes(c.prefecture));
    }
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
  }, [companies, searchTerm, sortBy, sortDir, recordsByCompany, rangeApplied, rangeStart, rangeEnd, filters]);

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
    // 1つ前のラウンドの called_at（録音時間窓の下限として渡す）
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
    // バックグラウンドで Zoom 録音URLを取得して紐付け
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
    // 録音URL取得（バックグラウンド）
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
        position: 'fixed', bottom: space[4], right: space[4], zIndex: 10000,
        width: 300, background: color.white,
        border: `1px solid ${color.border}`, borderRadius: radius.lg,
        boxShadow: shadow.lg,
        overflow: 'hidden',
        fontFamily: font.family.sans,
      }}>
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[2]}px ${space[3]}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: space[2],
        }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold }}>{list.name}</div>
            <div style={{ fontSize: 9, color: alpha(color.white, 0.75) }}>
              架電中（CRM新規開拓）
            </div>
          </div>
          <div style={{ display: 'flex', gap: space[1] }}>
            <button
              onClick={() => setIsMinimized(false)}
              title="最大化"
              style={{
                width: 24, height: 22, borderRadius: radius.sm,
                border: `1px solid ${color.white}`, background: 'transparent',
                color: color.white, fontSize: font.size.sm, cursor: 'pointer', padding: 0,
              }}
            >□</button>
            <button
              onClick={onClose}
              title="閉じる"
              style={{
                width: 24, height: 22, borderRadius: radius.sm,
                border: `1px solid ${color.white}`, background: 'transparent',
                color: color.white, fontSize: font.size.md, cursor: 'pointer', padding: 0, lineHeight: 1,
              }}
            >×</button>
          </div>
        </div>
        <div style={{ padding: `${space[2.5]}px ${space[3]}px`, fontSize: font.size.xs }}>
          <div style={{ color: color.textMid, marginBottom: space[1] }}>
            選択中: <strong style={{ color: color.navy }}>{selected?.company || '—'}</strong>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: space[1.5],
            fontSize: 10, color: color.textLight,
          }}>
            <span>件数 {companies.length}</span>
            <span>架電済 {calledCount}</span>
            <span style={{ color: color.success, fontWeight: font.weight.semibold }}>アポ {apptCount}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: color.offWhite, zIndex: 10000, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      fontFamily: font.family.sans,
    }}>
      {/* ヘッダー */}
      <div style={{
        background: color.navy, padding: `${space[2]}px ${space[6]}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[4] }}>
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.white }}>{list.name}</div>
            <div style={{ fontSize: 10, color: alpha(color.white, 0.7) }}>
              {list.industry || '業界未設定'}
              {searchTerm && (
                <span> ・ 表示 {visibleCompanies.length} 件</span>
              )}
            </div>
          </div>
          {/* 統計バッジ */}
          <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
            {[
              { label: '件数', val: stats.total, color: color.white },
              { label: '架電可能', val: stats.callable, color: alpha(color.white, 0.85) },
              { label: '架電済', val: stats.called, color: '#90EE90' },
              { label: 'アポ', val: stats.appo, color: '#FFD66B' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', minWidth: 36 }}>
                <div style={{ fontSize: 8, color: alpha(color.white, 0.6), letterSpacing: 0.5 }}>{s.label}</div>
                <div style={{
                  fontSize: font.size.lg, fontWeight: font.weight.bold, color: s.color,
                  fontFamily: font.family.mono,
                  fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
                }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="企業名・事業内容..."
            style={{
              padding: '5px 10px', borderRadius: radius.sm,
              border: `1px solid ${alpha(color.white, 0.4)}`,
              background: alpha(color.white, 0.1), color: color.white,
              fontSize: font.size.xs, fontFamily: font.family.sans, outline: 'none',
              width: 180,
            }}
          />
          <button
            onClick={() => setShowHelp(h => !h)}
            title="ショートカット一覧"
            style={{
              padding: '5px 10px', borderRadius: radius.sm,
              border: `1px solid ${color.white}`, background: 'transparent',
              color: color.white, fontSize: font.size.xs, cursor: 'pointer', fontFamily: font.family.sans,
              minWidth: 28,
            }}
          >?</button>
          <button
            onClick={() => setIsMinimized(true)}
            title="最小化（他画面を操作できる小ウィンドウへ）"
            style={{
              padding: '5px 10px', borderRadius: radius.sm,
              border: `1px solid ${color.white}`, background: 'transparent',
              color: color.white, fontSize: font.size.xs, cursor: 'pointer', fontFamily: font.family.sans,
              minWidth: 28,
            }}
          >−</button>
          <button
            onClick={() => setShowScript(s => !s)}
            disabled={!list.script_body}
            style={{
              padding: '5px 12px', borderRadius: radius.sm,
              border: `1px solid ${list.script_body ? color.white : alpha(color.white, 0.3)}`,
              background: 'transparent', color: list.script_body ? color.white : alpha(color.white, 0.3),
              fontSize: font.size.xs, fontWeight: font.weight.medium, cursor: list.script_body ? 'pointer' : 'not-allowed',
              fontFamily: font.family.sans,
            }}
          >{showScript ? 'スクリプトを閉じる' : 'スクリプト'}</button>
          <button
            onClick={onClose}
            style={{
              padding: '5px 12px', borderRadius: radius.sm,
              border: `1px solid ${color.white}`, background: 'transparent',
              color: color.white, fontSize: font.size.xs, cursor: 'pointer', fontFamily: font.family.sans,
            }}
          >閉じる</button>
        </div>
      </div>

      {/* 範囲指定バー */}
      <div style={{
        background: color.white, borderBottom: `1px solid ${color.border}`,
        padding: `${space[1.5]}px ${space[6]}px`,
        display: 'flex', alignItems: 'center', gap: space[2],
        fontSize: font.size.xs, color: color.textMid, flexShrink: 0,
      }}>
        <span style={{ fontWeight: font.weight.semibold }}>範囲指定</span>
        <span>No.</span>
        <input
          type="number"
          value={rangeStart}
          onChange={e => setRangeStart(e.target.value)}
          placeholder="1"
          min={1}
          style={{
            width: 70, padding: '4px 8px', borderRadius: radius.sm,
            border: `1px solid ${color.border}`, fontSize: font.size.xs,
            fontFamily: font.family.mono, textAlign: 'center', outline: 'none',
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
            width: 70, padding: '4px 8px', borderRadius: radius.sm,
            border: `1px solid ${color.border}`, fontSize: font.size.xs,
            fontFamily: font.family.mono, textAlign: 'center', outline: 'none',
          }}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            if (!rangeStart && !rangeEnd) { alert('範囲を入力してください'); return; }
            setRangeApplied(true);
            setSelectedIdx(null);
          }}
          style={{ minHeight: 0, padding: '4px 12px', fontSize: font.size.xs, fontWeight: font.weight.medium }}
        >適用</Button>
        {rangeApplied && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRangeApplied(false);
              setRangeStart(''); setRangeEnd('');
              setSelectedIdx(null);
            }}
            style={{ minHeight: 0, padding: '4px 12px', fontSize: font.size.xs }}
          >解除</Button>
        )}
        {rangeApplied && (
          <span style={{ fontSize: 10, color: color.textLight }}>
            （範囲適用中: {visibleCompanies.length} 件）
          </span>
        )}
      </div>

      {/* スクリプト表示 */}
      {showScript && list.script_body && (
        <div style={{
          background: '#FFFBEB', borderBottom: `1px solid ${alpha(color.gold, 0.5)}`,
          padding: `${space[3]}px ${space[6]}px`, maxHeight: 200, overflowY: 'auto',
          fontSize: font.size.sm, lineHeight: font.lineHeight.relaxed, color: color.textDark,
          whiteSpace: 'pre-wrap', flexShrink: 0,
        }}>
          {list.script_body}
        </div>
      )}

      {/* 企業選択時のステータスバー */}
      {selected && (
        <div style={{
          background: color.white, borderBottom: `1px solid ${color.border}`,
          padding: `${space[2.5]}px ${space[6]}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[4] }}>
            <div>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
                {selected.company}
                {selected.promoted_to_client_id && (
                  <Badge variant="success" size="sm" style={{ marginLeft: space[2] }}>CRM登録済</Badge>
                )}
              </div>
              <div style={{ fontSize: 10, color: color.textLight, marginTop: 2 }}>
                {selected.business || ''} {selected.representative ? '・ ' + selected.representative : ''}
              </div>
            </div>
            {selected.phone && (
              <button
                onClick={() => dialPhone(selected.phone)}
                style={{
                  padding: '6px 14px', borderRadius: radius.md,
                  border: `1px solid ${color.navy}`, background: alpha(color.navy, 0.08),
                  color: color.navy, fontSize: font.size.base, fontWeight: font.weight.bold,
                  fontFamily: font.family.mono, cursor: 'pointer',
                }}
              >{selected.phone}</button>
            )}
            <span style={{ fontSize: font.size.xs, color: color.textMid }}>
              次は {editRound} 周目
            </span>
          </div>
          <input
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="メモ（任意）"
            style={{
              width: 280, padding: '6px 10px', borderRadius: radius.sm,
              border: `1px solid ${color.border}`, fontSize: font.size.xs,
              fontFamily: font.family.sans, outline: 'none',
            }}
          />
        </div>
      )}

      {/* メイン: 企業一覧テーブル */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 0' }}>
        <div style={{ background: color.white, minHeight: '100%' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `40px 1.4fr 1fr 100px ${'40px '.repeat(displayRounds).trim()}`,
            padding: '8px 16px', background: color.navy,
            fontSize: 10, fontWeight: font.weight.semibold, color: color.white,
            position: 'sticky', top: 0, zIndex: 1,
          }}>
            {[
              { key: 'no', label: 'No' },
              { key: 'company', label: '企業名' },
              { key: 'business', label: '事業内容', sortable: false },
              { key: 'lastCall', label: '電話番号', sortLabel: '最終発信日' },
            ].map(col => {
              const sortable = col.sortable !== false;
              const active = sortBy === col.key;
              const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : (sortable ? ' ▽' : '');
              return (
                <span
                  key={col.key}
                  onClick={() => {
                    if (!sortable) return;
                    if (sortBy === col.key) {
                      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy(col.key);
                      setSortDir('asc');
                    }
                  }}
                  style={{ cursor: sortable ? 'pointer' : 'default', userSelect: 'none' }}
                  title={col.sortLabel || col.label}
                >{col.label}{arrow}</span>
              );
            })}
            {Array.from({ length: displayRounds }, (_, i) => (
              <span key={i} style={{ textAlign: 'center' }}>{i + 1}</span>
            ))}
          </div>
          {visibleCompanies.map((c, i) => {
            const isSelected = i === selectedIdx;
            const excluded = isExcluded(c.id);
            const rounds = recordsByCompany[c.id] || {};
            return (
              <div
                key={c.id}
                onClick={() => {
                  // Lists 同様、行クリックで 1企業集中ページに遷移
                  if (onOpenFocus) onOpenFocus(c.id);
                  else setSelectedIdx(i);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `40px 1.4fr 1fr 100px ${'40px '.repeat(displayRounds).trim()}`,
                  padding: '6px 16px', fontSize: 10, alignItems: 'center',
                  borderBottom: `1px solid ${color.border}`,
                  background: isSelected ? '#EFF6FF' : (excluded ? '#FEE2E230' : (i % 2 === 0 ? color.white : color.offWhite)),
                  borderLeft: isSelected ? `3px solid ${color.navy}` : '3px solid transparent',
                  opacity: excluded ? 0.5 : 1,
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: color.textLight, fontFamily: font.family.mono }}>{c.no}</span>
                <span style={{ fontWeight: font.weight.semibold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.company}
                  {c.promoted_to_client_id && (
                    <span style={{ marginLeft: 4, fontSize: 7, color: color.success, border: `1px solid ${color.success}`, borderRadius: radius.sm, padding: '0px 3px', fontWeight: font.weight.bold }}>CRM</span>
                  )}
                </span>
                <span style={{ color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.business || '-'}</span>
                <span style={{ fontFamily: font.family.mono, color: color.textMid }}>{c.phone || '-'}</span>
                {Array.from({ length: displayRounds }, (_, k) => {
                  const r = rounds[k + 1];
                  if (!r) return <span key={k} style={{ textAlign: 'center', color: alpha(color.textLight, 0.4) }}>-</span>;
                  const sd = getStatus(r.status);
                  return (
                    <span
                      key={k}
                      onClick={(e) => { e.stopPropagation(); undoLatestStatus(c.id, k + 1); }}
                      title={`${sd?.label || r.status}（クリックで取消）`}
                      style={{
                        textAlign: 'center', cursor: 'pointer',
                        fontSize: 7, fontWeight: font.weight.bold, padding: '1px 2px',
                        borderRadius: radius.sm,
                        background: alpha(sd?.color || '#9CA3AF', 0.12),
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

      {/* フッター: ステータスボタン群 — Lists CallFlowView と同じ控えめなトーンに統一 */}
      {selected && (
        <div style={{
          background: color.white, borderTop: `1px solid ${color.border}`,
          padding: `${space[2.5]}px ${space[4]}px`,
          display: 'flex', flexWrap: 'wrap', gap: 6,
          justifyContent: 'center', flexShrink: 0,
        }}>
          {STATUSES.map(s => {
            const isAppo = s.isAppo;
            return (
              <button
                key={s.id}
                onClick={() => recordStatus(s.id)}
                style={{
                  padding: '8px 14px', borderRadius: radius.md,
                  border: isAppo ? 'none' : `1px solid ${color.gray200}`,
                  background: isAppo ? color.navy : color.white,
                  color: isAppo ? color.white : color.gray500,
                  fontSize: font.size.sm, fontWeight: font.weight.semibold,
                  cursor: 'pointer', fontFamily: font.family.sans,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <kbd style={{
                  fontSize: 9, fontWeight: font.weight.bold, padding: '1px 4px',
                  border: `1px solid ${isAppo ? alpha(color.white, 0.4) : color.gray300}`,
                  background: 'transparent',
                  color: isAppo ? color.white : color.gray500,
                  borderRadius: radius.sm,
                  fontFamily: font.family.mono,
                }}>{shortcutLabel(s.order)}</kbd>
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {!selected && (
        <div style={{
          background: color.white, borderTop: `1px solid ${color.border}`,
          padding: 14, textAlign: 'center', fontSize: font.size.xs, color: color.textLight,
          flexShrink: 0,
        }}>
          企業を選択するとショートカット（{IS_MAC ? '1〜0' : 'F1〜F10'}）でステータスを記録できます
        </div>
      )}

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
          background: alpha(color.navyDeep, 0.55), zIndex: 20004,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
            width: 440, padding: space[6], boxShadow: shadow.xl,
          }}>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: 14 }}>
              キーボードショートカット
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
              <tbody>
                {STATUSES.map(s => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${color.gray100}` }}>
                    <td style={{ padding: '5px 8px', width: 80 }}>
                      <kbd style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: radius.sm,
                        background: color.gray100, border: `1px solid ${color.gray300}`,
                        fontFamily: font.family.mono, fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.gray700,
                      }}>{shortcutLabel(s.order)}</kbd>
                    </td>
                    <td style={{ padding: '5px 8px', color: color.gray700 }}>{s.label}</td>
                  </tr>
                ))}
                {[
                  ['← →  /  ↑ ↓', '前後の企業に移動'],
                  ['Esc', '画面を閉じる / モーダルを閉じる'],
                  ['?', 'このヘルプを表示／非表示'],
                ].map(([key, desc]) => (
                  <tr key={key} style={{ borderBottom: `1px solid ${color.gray100}` }}>
                    <td style={{ padding: '5px 8px', width: 80 }}>
                      <kbd style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: radius.sm,
                        background: color.gray100, border: `1px solid ${color.gray300}`,
                        fontFamily: font.family.mono, fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.gray700,
                      }}>{key}</kbd>
                    </td>
                    <td style={{ padding: '5px 8px', color: color.gray700 }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={() => setShowHelp(false)}
              style={{ marginTop: 14, minHeight: 0, padding: '6px 12px', fontSize: font.size.sm, fontWeight: font.weight.medium }}
            >閉じる</Button>
          </div>
        </div>
      )}
    </div>
  );
}
