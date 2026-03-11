import { useState, useEffect } from "react";
import { C } from '../../constants/colors';
import { CALL_RESULTS } from '../../constants/callResults';
import { insertCallRecord, updateCallListItem, fetchCallRecordsByItemId } from '../../lib/supabaseWrite';
import { dialPhone } from '../../utils/phone';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import RecallModal from './RecallModal';

export default function RecallListView({ callListData, supaRecalls = [], onRecallComplete, members = [], currentUser = '', isAdmin = false, onRefresh, setCallFlowScreen }) {
  const [sortBy, setSortBy] = useState("date");
  const [selectedItem, setSelectedItem] = useState(null);
  const [rightMemo, setRightMemo] = useState('');
  const [inlineRecallModal, setInlineRecallModal] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showAssigneeSugg, setShowAssigneeSugg] = useState(false);
  const [itemCallHistory, setItemCallHistory] = useState([]);
  const [activeRecordingId, setActiveRecordingId] = useState(null);

  useEffect(() => {
    if (!selectedItem?._supaRecord?.item_id) { setItemCallHistory([]); setActiveRecordingId(null); return; }
    fetchCallRecordsByItemId(selectedItem._supaRecord.item_id)
      .then(({ data }) => setItemCallHistory(data || []));
  }, [selectedItem]);

  const assigneeSuggestions = members.filter(m =>
    !assigneeQuery || m.toLowerCase().includes(assigneeQuery.toLowerCase())
  );
  const handleAssigneeInput = (v) => {
    setAssigneeQuery(v);
    if (!v) setFilterAssignee('');
    setShowAssigneeSugg(true);
  };
  const handleAssigneeSelect = (name) => {
    setAssigneeQuery(name);
    setFilterAssignee(name);
    setShowAssigneeSugg(false);
  };
  const handleAssigneeClear = () => {
    setAssigneeQuery('');
    setFilterAssignee('');
    setShowAssigneeSugg(false);
  };

  const handleStatusClick = async (item, statusLabel, statusId) => {
    if (item._source !== 'supabase') { console.warn('[handleStatusClick] 早期リターン — sourceがsupabaseでない:', item._source); return; }
    const r = item._supaRecord;
    if (statusLabel === '受付再コール' || statusLabel === '社長再コール') {
      setInlineRecallModal({ item, statusId, label: statusLabel });
      return;
    }
    await insertCallRecord({ item_id: r.item_id, list_id: r.list_id, round: r.round + 1, status: statusLabel, memo: rightMemo || null, getter_name: currentUser });
    await updateCallListItem(r.item_id, { call_status: statusLabel });
    await onRecallComplete(r);
    setSelectedItem(null);
  };

  const handleInlineRecallSave = async (recallData) => {
    if (!inlineRecallModal) return;
    const { item, label } = inlineRecallModal;
    const r = item._supaRecord;
    const memoJson = JSON.stringify({ recall_date: recallData.recallDate, recall_time: recallData.recallTime, assignee: recallData.assignee, note: recallData.note, recall_completed: false });
    await insertCallRecord({ item_id: r.item_id, list_id: r.list_id, round: r.round + 1, status: label, memo: memoJson, getter_name: currentUser });
    await updateCallListItem(r.item_id, { call_status: label });
    await onRecallComplete(r);
    setInlineRecallModal(null);
    setSelectedItem(null);
    if (onRefresh) onRefresh();
  };

  // Collect recall items (Supabaseのみ)
  const recallItems = (supaRecalls || []).map(r => ({
    _source: 'supabase',
    _supaRecord: r,
    company: r._item.company || '企業名不明',
    phone: r._item.phone || '',
    representative: r._item.representative || '',
    address: r._item.address || '',
    status: r.status,
    recallDate: r._memoObj.recall_date || '',
    recallTime: r._memoObj.recall_time || '',
    assignee: r._memoObj.assignee || '',
    note: r._memoObj.note || '',
    listInfo: null,
    _list_name: r._list_name || '',
    _list_industry: r._list_industry || '',
    _client_name: r._client_name || '',
  }));

  // 一般ユーザーは自分担当分のみ表示
  const baseRecallItems = isAdmin
    ? recallItems
    : recallItems.filter(item => (item.assignee || '') === currentUser);
  const filteredRecallItems = filterAssignee
    ? baseRecallItems.filter(item => item.assignee === filterAssignee)
    : baseRecallItems;

  const sorted = [...filteredRecallItems].sort((a, b) => {
    if (sortBy === "date") return (a.recallDate + a.recallTime).localeCompare(b.recallDate + b.recallTime);
    if (sortBy === "assignee") return (a.assignee || "未設定").localeCompare(b.assignee || "未設定");
    return 0;
  });

  const today = new Date().toISOString().slice(0, 10);
  const nowDt = new Date();
  const isOverdue = (date, time) => { if (!date) return false; return new Date(`${date}T${time || '00:00'}:00`) <= nowDt; };

  const inputStyle = { padding: "6px 10px", borderRadius: 6, background: C.white, border: "1px solid " + C.border, color: C.textDark, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" };

  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: 'flex', gap: 14, height: 'calc(100vh - 210px)' }}>
      {/* ── 左パネル ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.white, borderRadius: 10, border: '1px solid ' + C.borderLight }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + C.borderLight, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>📞</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>再コール一覧</span>
            <span style={{ fontSize: 10, color: C.textLight }}>{sorted.length}{filterAssignee ? `/${baseRecallItems.length}` : ''}件</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 担当者フィルター combobox（管理者のみ表示） */}
            {isAdmin && <div style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid ' + C.navy, borderRadius: 6, background: C.white,
              }}>
                {filterAssignee && (
                  <div style={{
                    background: C.gold, color: C.white, fontSize: 10, fontWeight: 700,
                    padding: '0 8px', display: 'flex', alignItems: 'center',
                    whiteSpace: 'nowrap', alignSelf: 'stretch', borderRadius: '5px 0 0 5px',
                  }}>
                    {filterAssignee}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="担当者で絞り込み..."
                  value={assigneeQuery}
                  onChange={e => handleAssigneeInput(e.target.value)}
                  onFocus={() => setShowAssigneeSugg(true)}
                  onBlur={() => setTimeout(() => setShowAssigneeSugg(false), 150)}
                  style={{ ...inputStyle, border: 'none', outline: 'none', minWidth: 130, background: 'transparent' }}
                />
                {filterAssignee && (
                  <button onMouseDown={handleAssigneeClear} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: C.textLight, padding: '4px 8px', fontSize: 13, lineHeight: 1,
                  }}>✕</button>
                )}
              </div>
              {showAssigneeSugg && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                  background: C.white, border: '1px solid ' + C.navy + '40',
                  borderRadius: 6, boxShadow: '0 4px 12px rgba(26,58,92,0.15)',
                  zIndex: 200, maxHeight: 200, overflowY: 'auto', minWidth: '100%',
                }}>
                  <div
                    onMouseDown={handleAssigneeClear}
                    style={{
                      padding: '7px 12px', fontSize: 11, color: C.navy,
                      cursor: 'pointer', fontWeight: 600,
                      borderBottom: '1px solid ' + C.borderLight,
                      background: !filterAssignee ? C.navy + '08' : 'transparent',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.navy + '10'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = !filterAssignee ? C.navy + '08' : 'transparent'; }}
                  >
                    全員（全件表示）
                  </div>
                  {assigneeSuggestions.map(m => (
                    <div
                      key={m}
                      onMouseDown={() => handleAssigneeSelect(m)}
                      style={{
                        padding: '7px 12px', fontSize: 11, color: C.navy,
                        cursor: 'pointer',
                        background: m === filterAssignee ? C.gold + '15' : 'transparent',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.gold + '20'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = m === filterAssignee ? C.gold + '15' : 'transparent'; }}
                    >
                      {m}
                    </div>
                  ))}
                  {assigneeSuggestions.length === 0 && (
                    <div style={{ padding: '7px 12px', fontSize: 11, color: C.textLight }}>候補なし</div>
                  )}
                </div>
              )}
            </div>}
            {/* ソート */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
              <option value="date">日時順</option>
              <option value="assignee">担当者別</option>
            </select>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.textLight, fontSize: 13 }}>再コール予定はありません</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '78px 1.6fr 0.8fr 110px 58px 0.7fr', padding: '5px 14px', background: C.offWhite, borderBottom: '1px solid ' + C.borderLight, fontSize: 9, fontWeight: 700, color: C.textLight, letterSpacing: 0.5, flexShrink: 0 }}>
                <span>予定日時</span><span>企業名</span><span>代表者</span><span>電話番号</span><span>種別</span><span>担当</span>
              </div>
              {sorted.map((item, i) => {
                const past = isOverdue(item.recallDate, item.recallTime);
                const isSel = selectedItem && (item._source === 'supabase' ? item._supaRecord?.id === selectedItem._supaRecord?.id : (item.listId === selectedItem.listId && item.rowIdx === selectedItem.rowIdx && item.round === selectedItem.round));
                return (
                  <div key={i} onClick={() => { setSelectedItem(item); setRightMemo(item.note || ''); }}
                    style={{ display: 'grid', gridTemplateColumns: '78px 1.6fr 0.8fr 110px 58px 0.7fr', padding: '8px 14px', fontSize: 11, alignItems: 'center', borderBottom: '1px solid ' + C.borderLight, borderLeft: isSel ? '3px solid ' + C.gold : '3px solid transparent', background: isSel ? C.gold + '10' : past ? '#fff5f5' : 'transparent', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: past ? '#e53e3e' : C.navy, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{item.recallTime || '--:--'}</div>
                      <div style={{ fontSize: 9, color: C.textLight }}>{item.recallDate ? item.recallDate.slice(5).replace('-', '/') : '日時未設定'}</div>
                    </div>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</span>
                    <span style={{ color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>{item.representative}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.phone}</span>
                    <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: C.gold + '10', color: C.gold, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {item.status === 'ceo_recall' || item.status === '社長再コール' ? '社長' : '受付'}
                    </span>
                    <span style={{ fontSize: 10, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.assignee || '—'}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── 右パネル ── */}
      <div style={{ width: 380, background: C.white, borderRadius: 10, border: '1px solid ' + C.borderLight, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        {!selectedItem ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 12, flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <span>左のリストから企業を選択</span>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedItem.company}</div>
              <div style={{ fontSize: 10, color: selectedItem.status === '社長再コール' || selectedItem.status === 'ceo_recall' ? '#fc8181' : C.goldLight, marginTop: 2 }}>
                {selectedItem.status === '社長再コール' || selectedItem.status === 'ceo_recall' ? '社長再コール' : '受付再コール'}
                {selectedItem.recallDate && ` / ${selectedItem.recallDate.slice(5).replace('-', '/')} ${selectedItem.recallTime || ''}`}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
              {/* クライアント・リスト情報 */}
              {selectedItem._source === 'supabase' && (selectedItem._client_name || selectedItem._list_industry) && (
                <div style={{ marginBottom: 12, fontSize: 11, color: C.navy, fontWeight: 500 }}>
                  {selectedItem._client_name && <span>{selectedItem._client_name}</span>}
                  {selectedItem._client_name && selectedItem._list_industry && <span style={{ color: C.textLight, margin: '0 5px' }}>›</span>}
                  {selectedItem._list_industry && <span style={{ color: C.textMid }}>{selectedItem._list_industry}</span>}
                </div>
              )}
              {selectedItem._source !== 'supabase' && selectedItem.listInfo && (
                <div style={{ marginBottom: 12, fontSize: 11, color: C.navy, fontWeight: 500 }}>{selectedItem.listInfo.company}</div>
              )}
              {/* 企業情報 */}
              <div style={{ padding: '10px 12px', background: C.offWhite, borderRadius: 8, border: '1px solid ' + C.borderLight, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 8 }}>🏢 企業情報</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {selectedItem.representative && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                      <span style={{ color: C.textLight, minWidth: 40, flexShrink: 0 }}>代表者</span>
                      <span style={{ color: C.textDark, fontWeight: 500 }}>{selectedItem.representative}</span>
                    </div>
                  )}
                  {selectedItem.address && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                      <span style={{ color: C.textLight, minWidth: 40, flexShrink: 0 }}>住所</span>
                      <span style={{ color: C.textDark }}>{selectedItem.address}</span>
                    </div>
                  )}
                  {selectedItem.phone && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
                      <span style={{ color: C.textLight, minWidth: 40, flexShrink: 0 }}>電話</span>
                      <span style={{ color: C.navy, fontWeight: 600, fontFamily: "'JetBrains Mono'", whiteSpace: 'nowrap' }}>{selectedItem.phone}</span>
                      <button onClick={() => dialPhone(selectedItem.phone)} style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: C.navy, color: C.white, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'", flexShrink: 0 }}>📞 発信</button>
                      {setCallFlowScreen && selectedItem._source === 'supabase' && (() => {
                        const _list = callListData.find(l => l._supaId === selectedItem._supaRecord?.list_id);
                        if (!_list) return null;
                        return (
                          <button onClick={() => setCallFlowScreen({ list: _list, defaultItemId: selectedItem._supaRecord.item_id })}
                            style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid ' + C.gold, background: C.gold, color: C.navy, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans JP'", flexShrink: 0 }}>
                            架電フローへ
                          </button>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
              {/* ステータスボタン (supabase only) */}
              {selectedItem._source === 'supabase' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 8 }}>📋 架電結果</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {CALL_RESULTS.map(r => {
                      const isAppo = r.id === 'appointment';
                      const isExcl = r.id === 'excluded';
                      const btnBg    = isAppo ? C.gold  : isExcl ? C.red + '10' : C.navy + '08';
                      const btnColor = isAppo ? C.white : isExcl ? C.red        : C.navy;
                      const btnBdr   = isAppo ? '1.5px solid ' + C.gold : isExcl ? '1.5px solid ' + C.red + '40' : '1px solid ' + C.navy + '25';
                      return (
                        <button key={r.id} onClick={() => handleStatusClick(selectedItem, r.label, r.id)}
                          style={{ padding: '9px 6px', borderRadius: 7, border: btnBdr, background: btnBg, color: btnColor, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans JP'", lineHeight: 1.2 }}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 担当者表示 */}
              {selectedItem.assignee && (
                <div style={{ marginBottom: 8, fontSize: 11, color: C.textMid }}>担当: {selectedItem.assignee}</div>
              )}
              {/* 架電履歴 */}
              {itemCallHistory.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 6 }}>📋 架電履歴</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {itemCallHistory.map(rec => {
                      const dt = rec.called_at ? new Date(rec.called_at) : null;
                      const dtStr = dt
                        ? `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
                        : '';
                      return (
                        <div key={rec.id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 8px', borderRadius: 5, background: C.offWhite, fontSize: 11 }}>
                            <span style={{ fontWeight: 700, color: C.navy, minWidth: 36,
                              fontFamily: "'JetBrains Mono'", fontSize: 10 }}>{rec.round}回目</span>
                            <span style={{ flex: 1, color: C.textMid, fontWeight: 600 }}>{rec.status}</span>
                            <span style={{ color: C.textLight, fontSize: 10 }}>{dtStr}</span>
                            {rec.recording_url && (
                              <button
                                onClick={() => setActiveRecordingId(activeRecordingId === rec.id ? null : rec.id)}
                                title={activeRecordingId === rec.id ? "閉じる" : "録音を再生"}
                                style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                                  padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? C.red : 'inherit' }}>🎙</button>
                            )}
                          </div>
                          {activeRecordingId === rec.id && rec.recording_url && (
                            <InlineAudioPlayer url={rec.recording_url} onClose={() => setActiveRecordingId(null)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* メモ */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 5 }}>メモ</div>
                <textarea value={rightMemo} onChange={e => setRightMemo(e.target.value)} placeholder="架電前のメモ等..."
                  style={{ width: '100%', minHeight: 60, padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', resize: 'vertical', background: C.offWhite, boxSizing: 'border-box' }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* インライン再コールモーダル */}
      {inlineRecallModal && (
        <RecallModal
          row={{ company: inlineRecallModal.item.company }}
          statusId={inlineRecallModal.statusId}
          onSubmit={handleInlineRecallSave}
          onCancel={() => setInlineRecallModal(null)}
          members={members}
        />
      )}
    </div>
  );
}
