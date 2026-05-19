import { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Badge, DataTable } from '../ui';
import { invokeGetZoomRecording } from '../../lib/supabaseWrite';
import InlineAudioPlayer from '../common/InlineAudioPlayer';

import { getOrgId } from '../../lib/orgContext';
import PageHeader from '../common/PageHeader';

const formatJST = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatDuration = (sec) => {
  if (sec == null || sec < 0) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}秒`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// リスト表示ラベル: call_lists.nameがclientName含む場合はlistNameのみ
const listLabel = (m) => {
  if (!m.clientName) return m.listName || '';
  if (m.listName.startsWith(m.clientName)) return m.listName;
  return m.listName ? `${m.clientName} – ${m.listName}` : m.clientName;
};

const normalizePhone = (n) => {
  if (!n) return '';
  const digits = n.replace(/\D/g, '');
  if (digits.startsWith('81')) return '0' + digits.slice(2);
  return digits;
};

export default function IncomingCallsView({ setCallFlowScreen }) {
  const isMobile = useIsMobile();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  // phone(正規化済み) → [{ itemId, company, listId, listName, clientName }]
  const [phoneItemMap, setPhoneItemMap] = useState({});
  // リスト選択モーダル: null | [{ itemId, company, listId, listName, clientName }]
  const [selectModal, setSelectModal] = useState(null);
  // 未紐づけ手動リンク: { callId, callerNumber } | null
  const [linkModal, setLinkModal] = useState(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState([]);
  const [linkSearching, setLinkSearching] = useState(false);
  // 録音再生表示中の行ID
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  // 録音自動取得を 1 行 1 回に制限するための refs
  const _autoFetchedRef = useRef(new Set());

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('incoming_calls')
      .select('*')
      .eq('org_id', getOrgId())
      .order('received_at', { ascending: false })
      .limit(200);
    const rows = data || [];
    setRecords(rows);

    // 全電話番号を一括でcall_list_itemsに問い合わせ
    // phone（会社番号）/ sub_phone_number（別事業所）/ keyman_mobile（キーマン携帯）の
    // いずれかで一致した項目を集計する。
    const phones = [...new Set(
      rows.map(r => normalizePhone(r.caller_number)).filter(Boolean)
    )];
    if (phones.length > 0) {
      const phonesCsv = phones.join(',');
      const orClause = [
        `phone.in.(${phonesCsv})`,
        `sub_phone_number.in.(${phonesCsv})`,
        `keyman_mobile.in.(${phonesCsv})`,
      ].join(',');
      const { data: items } = await supabase
        .from('call_list_items')
        .select('id, company, phone, sub_phone_number, keyman_mobile, list_id, call_lists(id, name, clients(name))')
        .or(orClause)
        .limit(500);
      const map = {};
      (items || []).forEach(item => {
        const numbers = [item.phone, item.sub_phone_number, item.keyman_mobile]
          .map(normalizePhone)
          .filter(Boolean);
        numbers.forEach(p => {
          if (!phones.includes(p)) return;
          if (!map[p]) map[p] = [];
          if (map[p].some(x => x.itemId === item.id)) return;
          map[p].push({
            itemId: item.id,
            company: item.company || '',
            listId: item.list_id,
            listName: item.call_lists?.name || '',
            clientName: item.call_lists?.clients?.name || '',
          });
        });
      });
      setPhoneItemMap(map);
    }

    setLoading(false);
  };

  // Phase A: 録音 URL が未取得の応答済み着信について Zoom Cloud Recording から
  // 自動的に URL を引いて incoming_calls.recording_url に保存する。
  // 行ロード後、duration_sec が記録済 (= 通話終了) かつ recording_url 未設定の行が対象。
  // get-zoom-recording は callee_number/caller_number 両方をフィルタ対象にしているため
  // inbound の場合でも caller_number で hit する。
  const autoFetchRecording = async (row) => {
    if (!row?.id || row.recording_url || _autoFetchedRef.current.has(row.id)) return;
    if (!row.answered_by_zoom_user_id || !row.caller_number) return;
    if (row.duration_sec == null || row.duration_sec < 5) return; // 5秒未満は録音されない想定
    _autoFetchedRef.current.add(row.id);
    try {
      const { data } = await invokeGetZoomRecording({
        zoom_user_id: row.answered_by_zoom_user_id,
        callee_phone: row.caller_number, // get-zoom-recording は caller/callee 両方検索
        called_at: row.received_at,
      });
      const url = data?.recording_url;
      if (url) {
        await supabase.from('incoming_calls').update({ recording_url: url }).eq('id', row.id);
        setRecords(prev => prev.map(r => r.id === row.id ? { ...r, recording_url: url } : r));
      }
    } catch (e) {
      console.warn('[IncomingCalls] auto-fetch recording error:', e);
    }
  };

  useEffect(() => {
    if (!records.length) return;
    // 終了済み・録音未取得の行を上位 20 件だけ走査（過去分は手動再取得に任せる）
    records.slice(0, 20).forEach(r => {
      if (r.ended_at && !r.recording_url) autoFetchRecording(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length]);

  const searchCompanies = async (q) => {
    setLinkQuery(q);
    if (!q || q.trim().length < 1) { setLinkResults([]); return; }
    setLinkSearching(true);
    const { data } = await supabase
      .from('call_list_items')
      .select('id, company, phone, list_id, call_lists(id, name, clients(name))')
      .eq('org_id', getOrgId())
      .ilike('company', `%${q.trim()}%`)
      .limit(20);
    setLinkResults(data || []);
    setLinkSearching(false);
  };

  // Phase C: 手動リンク時に keyman_mobile を自動学習（同じ番号からの次回着信は自動紐づけ）
  const applyLink = async (item) => {
    if (!linkModal) return;
    await supabase
      .from('incoming_calls')
      .update({ item_id: item.id, company_name: item.company || null })
      .eq('id', linkModal.callId);

    // keyman_mobile が未設定の場合のみ学習保存（既存値は尊重）
    if (linkModal.callerNumber) {
      await supabase
        .from('call_list_items')
        .update({ keyman_mobile: linkModal.callerNumber })
        .eq('id', item.id)
        .is('keyman_mobile', null);
    }

    setRecords(prev => prev.map(r => r.id === linkModal.callId
      ? { ...r, item_id: item.id, company_name: item.company || null }
      : r));
    setLinkModal(null);
    setLinkQuery('');
    setLinkResults([]);
  };

  useEffect(() => { load(); }, []);

  const markHandled = async (id) => {
    await supabase
      .from('incoming_calls')
      .update({ status: '対応済み', handled_at: new Date().toISOString() })
      .eq('id', id);
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: '対応済み' } : r));
  };

  const handleCompanyClick = (matches) => {
    if (matches.length === 1) {
      navigateTo(matches[0]);
    } else {
      setSelectModal(matches);
    }
  };

  const navigateTo = (match) => {
    if (!setCallFlowScreen) return;
    setCallFlowScreen({
      list: { _supaId: match.listId, id: match.listId, company: match.company },
      defaultItemId: match.itemId,
      defaultListMode: false,
      singleItemMode: true,
    });
    setSelectModal(null);
  };

  // Phase C: 着信行から「アポ取得」→ CallFlowView を該当企業フォーカス＋AppoReportModal自動展開、
  // 録音URLも初期値として渡す
  const openAppoFromIncoming = (row, match) => {
    if (!setCallFlowScreen || !match) return;
    setCallFlowScreen({
      list: { _supaId: match.listId, id: match.listId, company: match.company },
      defaultItemId: match.itemId,
      defaultListMode: false,
      singleItemMode: true,
      initialRecordingUrl: row.recording_url || '',
      autoOpenAppoModal: true,
    });
  };

  const filtered = records.filter(r =>
    statusFilter === 'all' ? true : r.status === statusFilter
  );

  // ステータス → Badge variant
  const statusVariant = (s) => s === '対応済み' ? 'success' : 'danger';

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', height: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="着信対応"
        description="着信履歴"
        style={{ marginBottom: isMobile ? 16 : 24 }}
      />
      {/* フィルター */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        marginBottom: space[4], gap: space[2],
      }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          {['all', '未対応', '対応済み'].map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'primary' : 'outline'}
              onClick={() => setStatusFilter(s)}
              style={statusFilter !== s ? { color: color.textMid, borderColor: color.border } : undefined}
            >
              {s === 'all' ? 'すべて' : s}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load}>
            ↻ 更新
          </Button>
        </div>
      </div>

      {/* テーブル (DataTable 共通コンポーネント) */}
      <DataTable
        ariaLabel="着信履歴"
        height="100%"
        style={{ flex: 1, minHeight: 0 }}
        loading={loading}
        rows={filtered}
        rowKey="id"
        emptyMessage="着信履歴がありません"
        columns={[
          {
            key: 'receivedAt', label: '受信日時', width: 130, align: 'right',
            cellStyle: { color: color.textMid, fontFamily: font.family.mono, fontSize: font.size.xs },
            render: (r) => formatJST(r.received_at),
          },
          {
            key: 'company', label: '企業名・リスト', width: 280, align: 'left',
            cellStyle: { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' },
            render: (r) => {
              const phone = normalizePhone(r.caller_number);
              const matches = phoneItemMap[phone] || [];
              const uniqueMatches = matches.filter((m, idx, arr) =>
                arr.findIndex(x => x.itemId === m.itemId) === idx
              );
              const companyName = uniqueMatches[0]?.company || r.company_name || null;
              const canNavigate = uniqueMatches.length > 0 && setCallFlowScreen;
              if (!companyName) {
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); setLinkModal({ callId: r.id, callerNumber: r.caller_number }); setLinkQuery(''); setLinkResults([]); }}
                    style={{
                      padding: '3px 10px', borderRadius: radius.md, border: `1px dashed ${color.border}`,
                      background: color.white, color: color.textMid, cursor: 'pointer',
                      fontSize: font.size.xs, fontFamily: font.family.sans, fontWeight: font.weight.medium,
                    }}
                  >
                    企業に紐づける
                  </button>
                );
              }
              return (
                <div>
                  {canNavigate ? (
                    <span
                      onClick={(e) => { e.stopPropagation(); handleCompanyClick(uniqueMatches); }}
                      style={{ color: color.navy, fontWeight: font.weight.bold, cursor: 'pointer', textDecoration: 'underline', fontSize: font.size.sm }}
                    >
                      {companyName}
                    </span>
                  ) : (
                    <span style={{ color: color.textDark, fontWeight: font.weight.bold, fontSize: font.size.sm }}>
                      {companyName}
                    </span>
                  )}
                  {uniqueMatches.length > 0 && (
                    <div style={{ marginTop: 3 }}>
                      {uniqueMatches.map(m => (
                        <div key={m.itemId} style={{
                          fontSize: 10, color: color.textLight,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          <span style={{ color: color.textLight }}>└</span>
                          <span
                            onClick={(e) => { e.stopPropagation(); setCallFlowScreen && navigateTo(m); }}
                            style={{
                              cursor: setCallFlowScreen ? 'pointer' : 'default',
                              color: setCallFlowScreen ? alpha(color.navy, 0.8) : color.textLight,
                              textDecoration: setCallFlowScreen ? 'underline' : 'none',
                            }}
                          >
                            {listLabel(m)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'phone', label: '電話番号', width: 130, align: 'left',
            cellStyle: { fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums', color: color.textMid },
            render: (r) => r.caller_number || '-',
          },
          {
            key: 'duration', label: '通話時間', width: 80, align: 'right',
            cellStyle: { fontFamily: font.family.mono, color: color.textMid, fontSize: font.size.xs },
            render: (r) => formatDuration(r.duration_sec),
          },
          {
            key: 'recording', label: '録音', width: 180, align: 'left',
            cellStyle: { whiteSpace: 'normal', overflow: 'visible' },
            render: (r) => {
              if (activeRecordingId === r.id && r.recording_url) {
                return (
                  <InlineAudioPlayer
                    url={r.recording_url}
                    onClose={() => setActiveRecordingId(null)}
                  />
                );
              }
              if (r.recording_url) {
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveRecordingId(r.id); }}
                    style={{
                      padding: '4px 10px', borderRadius: radius.md,
                      border: `1px solid ${color.border}`, background: color.white,
                      color: color.navy, cursor: 'pointer',
                      fontSize: font.size.xs, fontWeight: font.weight.semibold,
                    }}
                  >
                    ▶ 再生
                  </button>
                );
              }
              if (r.ended_at && r.duration_sec >= 5) {
                return <span style={{ fontSize: font.size.xs, color: color.textLight }}>取得中…</span>;
              }
              return <span style={{ color: color.textLight }}>-</span>;
            },
          },
          {
            key: 'status', label: 'ステータス', width: 100, align: 'center',
            render: (r) => r.status
              ? <Badge variant={statusVariant(r.status)} dot>{r.status}</Badge>
              : '-'
          },
          {
            key: 'action', label: '操作', width: 220, align: 'center',
            cellStyle: { whiteSpace: 'normal', overflow: 'visible' },
            render: (r) => {
              const phone = normalizePhone(r.caller_number);
              const matches = phoneItemMap[phone] || [];
              const primaryMatch = matches[0] || null;
              const hasCompany = primaryMatch || r.company_name;
              return (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {hasCompany && primaryMatch && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={(e) => { e.stopPropagation(); openAppoFromIncoming(r, primaryMatch); }}
                      style={{ fontSize: font.size.xs }}
                    >
                      アポ取得
                    </Button>
                  )}
                  {r.status !== '対応済み' && (
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); markHandled(r.id); }}>
                      対応済
                    </Button>
                  )}
                </div>
              );
            }
          },
        ]}
      />

      {/* リスト選択モーダル */}
      {selectModal && (
        <div
          onClick={() => setSelectModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: alpha(color.navyDeep, 0.5), backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: color.white, borderRadius: radius.md,
              minWidth: 320, maxWidth: 420,
              boxShadow: shadow.xl,
              border: `1px solid ${color.border}`,
              overflow: 'hidden',
            }}
          >
            <div style={{
              background: color.navy, color: color.white,
              padding: '12px 24px',
              fontWeight: font.weight.semibold, fontSize: font.size.md,
            }}>
              どのリストから架電しますか？
            </div>
            <div style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginBottom: space[5] }}>
              {selectModal.map(m => (
                <button
                  key={m.itemId}
                  onClick={() => navigateTo(m)}
                  style={{
                    padding: '10px 14px', borderRadius: radius.md,
                    border: `1px solid ${color.border}`,
                    background: color.cream, cursor: 'pointer', textAlign: 'left',
                    fontFamily: font.family.sans, fontSize: font.size.sm, color: color.navy,
                    fontWeight: font.weight.medium, transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = color.cream; }}
                >
                  {listLabel(m)}
                  {m.company && (
                    <span style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.normal, marginLeft: 8 }}>
                      {m.company}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <Button size="sm" variant="outline" onClick={() => setSelectModal(null)}>
                キャンセル
              </Button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 未紐づけ着信の手動リンクモーダル */}
      {linkModal && (
        <div
          onClick={() => setLinkModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: alpha(color.navyDeep, 0.5), backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 320,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: color.white, borderRadius: radius.md,
              width: 480, maxWidth: '90vw', maxHeight: '80vh',
              boxShadow: shadow.xl, border: `1px solid ${color.border}`,
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              background: color.navy, color: color.white,
              padding: '12px 24px',
              fontWeight: font.weight.semibold, fontSize: font.size.md,
            }}>
              企業に紐づける
              <div style={{ fontSize: font.size.xs, fontWeight: font.weight.normal, opacity: 0.85, marginTop: 2 }}>
                着信番号: {linkModal.callerNumber || '-'}（紐づけ時にキーマン携帯として自動保存）
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${color.border}` }}>
              <input
                type="text"
                autoFocus
                value={linkQuery}
                onChange={e => searchCompanies(e.target.value)}
                placeholder="企業名で検索"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: radius.md,
                  border: `1px solid ${color.border}`, fontSize: font.size.sm,
                  fontFamily: font.family.sans, outline: 'none', background: color.offWhite,
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
              {linkSearching && <div style={{ padding: 12, fontSize: font.size.xs, color: color.textLight }}>検索中…</div>}
              {!linkSearching && linkQuery.trim() && linkResults.length === 0 && (
                <div style={{ padding: 12, fontSize: font.size.xs, color: color.textLight }}>該当する企業はありません</div>
              )}
              {linkResults.map(item => (
                <button
                  key={item.id}
                  onClick={() => applyLink(item)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '10px 12px', marginBottom: 6,
                    borderRadius: radius.md, border: `1px solid ${color.border}`,
                    background: color.cream, cursor: 'pointer',
                    fontFamily: font.family.sans,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = color.cream; }}
                >
                  <div style={{ fontSize: font.size.sm, color: color.navy, fontWeight: font.weight.semibold }}>
                    {item.company || '(企業名なし)'}
                  </div>
                  <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>
                    {item.call_lists?.name || ''} {item.call_lists?.clients?.name ? `（${item.call_lists.clients.name}）` : ''}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 20px', borderTop: `1px solid ${color.border}`, textAlign: 'right' }}>
              <Button size="sm" variant="outline" onClick={() => setLinkModal(null)}>キャンセル</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
