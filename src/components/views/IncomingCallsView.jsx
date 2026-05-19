import { useState, useEffect } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Badge, DataTable } from '../ui';

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

  const applyLink = async (item) => {
    if (!linkModal) return;
    await supabase
      .from('incoming_calls')
      .update({ item_id: item.id, company_name: item.company || null })
      .eq('id', linkModal.callId);
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
            key: 'status', label: 'ステータス', width: 120, align: 'center',
            render: (r) => r.status
              ? <Badge variant={statusVariant(r.status)} dot>{r.status}</Badge>
              : '-'
          },
          {
            key: 'handler', label: '対応者', width: 130, align: 'left',
            cellStyle: { color: color.textMid },
            render: (r) => r.handled_by || '-'
          },
          {
            key: 'action', label: '操作', width: 140, align: 'center',
            render: (r) => r.status !== '対応済み' ? (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); markHandled(r.id); }}>
                対応済みにする
              </Button>
            ) : null
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
                着信番号: {linkModal.callerNumber || '-'}
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
