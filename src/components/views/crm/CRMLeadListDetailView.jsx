import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Badge, Input } from '../../ui';
import {
  fetchClientLeadCompanies, fetchClientCallRecords,
  updateClientLeadList,
} from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50 } from './utils';
import { useIsMobile } from '../../../hooks/useIsMobile';
import CRMLeadCallingScreen from './CRMLeadCallingScreen';
import CRMLeadCallFlowView from './CRMLeadCallFlowView';

// CRM新規開拓のステータス一覧（CRMLeadCallFlowView と揃える）
const STATUS_OPTIONS = [
  { id: 'missed',           label: '不通' },
  { id: 'keyman_absent',    label: 'キーマン不在' },
  { id: 'keyman_connect',   label: 'キーマン接続' },
  { id: 'appointment',      label: 'アポ獲得' },
  { id: 'reception_block',  label: '受付ブロック' },
  { id: 'reception_recall', label: '受付再コール' },
  { id: 'keyman_recall',    label: 'キーマン再コール' },
  { id: 'keyman_decline',   label: 'キーマン断り' },
  { id: 'inquiry_form',     label: '問い合わせフォーム' },
  { id: 'excluded',         label: '除外' },
];

const STATUS_VARIANT = {
  appointment: 'success',
  keyman_connect: 'primary',
  inquiry_form: 'info',
  reception_recall: 'warn',
  keyman_recall: 'warn',
  keyman_decline: 'danger',
  reception_block: 'danger',
  excluded: 'neutral',
  missed: 'neutral',
  keyman_absent: 'neutral',
};

function StatusBadge({ status }) {
  if (!status) return <span style={{ color: color.textLight, fontSize: font.size.xs - 1 }}>—</span>;
  const variant = STATUS_VARIANT[status] || 'neutral';
  const label = STATUS_OPTIONS.find(s => s.id === status)?.label || status;
  return <Badge variant={variant} size="sm">{label}</Badge>;
}

function ScriptEditor({ list }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(list?.script_body || '');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setBody(list?.script_body || ''); }, [list?.id]);

  const handleSave = async () => {
    setSaving(true);
    await updateClientLeadList(list.id, { scriptBody: body });
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['crm-lead-lists'] });
  };

  const isUnchanged = body === (list?.script_body || '');

  return (
    <div style={{
      marginBottom: space[4],
      background: color.white,
      border: `1px solid ${color.border}`,
      borderRadius: radius.md,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: font.family.sans,
          fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy,
        }}
      >
        <span>架電トークスクリプト{body ? '' : '（未設定）'}</span>
        <span style={{ fontSize: font.size.md, color: color.textLight }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 12px' }}>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            placeholder="このリスト向けの営業トーク台本を入力"
            style={{
              width: '100%', padding: '10px',
              borderRadius: radius.md, border: `1px solid ${color.border}`,
              fontSize: font.size.sm, fontFamily: font.family.sans, lineHeight: 1.6,
              outline: 'none', resize: 'vertical',
              background: color.offWhite, color: color.textDark,
            }}
          />
          <div style={{ marginTop: space[1.5], textAlign: 'right' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isUnchanged}
              loading={saving}
            >{saving ? '保存中...' : 'スクリプトを保存'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CRMLeadListDetailView({ list, currentUser, members = [], setClientData, onBack, inModal = false }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [callingMode, setCallingMode] = useState(null); // 'list' | 'flow' | null
  const [focusedCompanyId, setFocusedCompanyId] = useState(null);

  // 絞り込み state (Lists DetailModal と同等)
  const [flowStartNo, setFlowStartNo] = useState('');
  const [flowEndNo, setFlowEndNo] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState([]); // 空=全件
  const [prefFilters, setPrefFilters] = useState([]);
  const [prefDropOpen, setPrefDropOpen] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ['crm-lead-companies', list?.id],
    queryFn: async () => {
      if (!list?.id) return [];
      const { data } = await fetchClientLeadCompanies(list.id);
      return data || [];
    },
    enabled: !!list?.id,
    staleTime: 30_000,
  });

  const { data: records = [] } = useQuery({
    queryKey: ['crm-lead-records', list?.id],
    queryFn: async () => {
      if (!list?.id) return [];
      const { data } = await fetchClientCallRecords(list.id);
      return data || [];
    },
    enabled: !!list?.id,
    staleTime: 30_000,
  });

  // 各企業の最新ラウンドステータス
  const lastStatusByCompany = {};
  const maxRoundByCompany = {};
  records.forEach(r => {
    if (!maxRoundByCompany[r.lead_company_id] || r.round > maxRoundByCompany[r.lead_company_id]) {
      maxRoundByCompany[r.lead_company_id] = r.round;
      lastStatusByCompany[r.lead_company_id] = r.status;
    }
  });

  // この企業データから利用可能な都道府県を抽出
  const availablePrefs = useMemo(
    () => [...new Set(companies.map(c => c.prefecture).filter(Boolean))].sort(),
    [companies]
  );

  if (!list) {
    return (
      <div style={{ padding: space[5] }}>
        <Button variant="secondary" size="sm" onClick={onBack}>← 戻る</Button>
        <div style={{ marginTop: space[3], color: color.textLight }}>リストが見つかりません</div>
      </div>
    );
  }

  const handleCloseCall = () => {
    setCallingMode(null);
    setFocusedCompanyId(null);
    queryClient.invalidateQueries({ queryKey: ['crm-lead-records', list.id] });
    queryClient.invalidateQueries({ queryKey: ['crm-lead-companies', list.id] });
  };

  // 1企業の集中ページに移動（一覧ページから行クリック時）
  const handleOpenFocus = (companyId) => {
    setFocusedCompanyId(companyId);
    setCallingMode('flow');
  };

  // 集中ページから一覧ページに戻る
  const handleBackToList = () => {
    setFocusedCompanyId(null);
    setCallingMode('list');
  };

  // 絞り込み条件を集約
  const callFilters = {
    rangeStart: flowStartNo ? parseInt(flowStartNo) : null,
    rangeEnd: flowEndNo ? parseInt(flowEndNo) : null,
    statusFilter: selectedStatuses.length > 0 ? selectedStatuses : null,
    prefFilter: prefFilters.length > 0 ? prefFilters : null,
  };

  // 架電画面の dispatch
  if (callingMode === 'flow') {
    return (
      <CRMLeadCallFlowView
        list={list}
        companies={companies}
        records={records}
        currentUser={currentUser}
        members={members}
        setClientData={setClientData}
        defaultCompanyId={focusedCompanyId}
        onBackToList={handleBackToList}
        onClose={handleCloseCall}
        filters={callFilters}
      />
    );
  }
  if (callingMode === 'list') {
    return (
      <CRMLeadCallingScreen
        list={list}
        companies={companies}
        records={records}
        currentUser={currentUser}
        members={members}
        setClientData={setClientData}
        filters={callFilters}
        onOpenFocus={handleOpenFocus}
        onClose={handleCloseCall}
      />
    );
  }

  // 集計
  const total = companies.length;
  const calledCount = Object.keys(lastStatusByCompany).length;
  const apptCount = Object.values(lastStatusByCompany).filter(s => s === 'appointment').length;
  const inquiryCount = Object.values(lastStatusByCompany).filter(s => s === 'inquiry_form').length;

  // ステータスチップのトグル
  const toggleStatus = (id) => {
    setSelectedStatuses(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const togglePref = (p) => {
    setPrefFilters(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  return (
    <div>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4],
        padding: '14px 18px', background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
          {!inModal && (
            <Button variant="secondary" size="sm" onClick={onBack}>← リスト一覧</Button>
          )}
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>{list.name}</div>
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>
              {list.industry ? list.industry + ' / ' : ''}{total} 件
              {' '}・ 架電済 {calledCount} 件
              {' '}・ アポ {apptCount} 件
              {inquiryCount > 0 ? ` ・ 問合せ ${inquiryCount} 件` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* スクリプト編集（注記相当） */}
      <ScriptEditor list={list} />

      {/* 絞り込み + 架電開始 (Lists DetailModal と同等の単一フロー) */}
      <div style={{
        marginBottom: space[4], padding: '14px 18px',
        background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`,
        borderLeft: `3px solid ${color.navy}`,
      }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[3] }}>
          架電範囲の指定
        </div>

        {/* No 範囲 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size.xs, color: color.textMid, whiteSpace: 'nowrap', minWidth: 70 }}>No.</span>
          <Input
            type="number"
            size="sm"
            value={flowStartNo}
            onChange={e => setFlowStartNo(e.target.value)}
            placeholder="開始"
            fullWidth={false}
            containerStyle={{ width: 80 }}
            style={{ fontFamily: font.family.mono, textAlign: 'center' }}
          />
          <span style={{ fontSize: font.size.xs, color: color.textMid }}>〜</span>
          <Input
            type="number"
            size="sm"
            value={flowEndNo}
            onChange={e => setFlowEndNo(e.target.value)}
            placeholder="終了"
            fullWidth={false}
            containerStyle={{ width: 80 }}
            style={{ fontFamily: font.family.mono, textAlign: 'center' }}
          />
          <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
            未入力なら全件（1〜{total}）
          </span>
        </div>

        {/* ステータスフィルタチップ */}
        <div style={{ marginBottom: space[3] }}>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1.5] }}>ステータス絞り込み</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              onClick={() => setSelectedStatuses([])}
              style={{
                padding: '4px 10px', borderRadius: radius.md, cursor: 'pointer',
                fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
                background: selectedStatuses.length === 0 ? color.navy : color.cream,
                color: selectedStatuses.length === 0 ? color.white : color.textMid,
                border: `1px solid ${selectedStatuses.length === 0 ? color.navy : color.border}`,
              }}
            >全ステータス</button>
            {STATUS_OPTIONS.map(s => {
              const isActive = selectedStatuses.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleStatus(s.id)}
                  style={{
                    padding: '4px 10px', borderRadius: radius.md, cursor: 'pointer',
                    fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
                    background: isActive ? color.navy : color.cream,
                    color: isActive ? color.white : color.textMid,
                    border: `1px solid ${isActive ? color.navy : color.border}`,
                  }}
                >{s.label}</button>
              );
            })}
          </div>
        </div>

        {/* 都道府県フィルタ */}
        <div style={{ marginBottom: space[3], position: 'relative' }}>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1.5] }}>エリア (都道府県) 絞り込み</div>
          <button
            onClick={() => setPrefDropOpen(o => !o)}
            disabled={availablePrefs.length === 0}
            style={{
              padding: '6px 12px', borderRadius: radius.md,
              border: `1px solid ${color.border}`,
              background: color.white, color: color.textMid,
              fontSize: font.size.xs, fontFamily: font.family.sans,
              cursor: availablePrefs.length === 0 ? 'not-allowed' : 'pointer',
              minWidth: 200, textAlign: 'left',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: availablePrefs.length === 0 ? 0.5 : 1,
            }}
          >
            <span>
              {prefFilters.length === 0 ? '全エリア' : `${prefFilters.length} 件選択`}
            </span>
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>{prefDropOpen ? '▲' : '▼'}</span>
          </button>
          {prefDropOpen && availablePrefs.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 10,
              background: color.white, border: `1px solid ${color.border}`,
              borderRadius: radius.md, boxShadow: shadow.md,
              padding: space[2], minWidth: 240, maxHeight: 280, overflowY: 'auto',
            }}>
              {availablePrefs.map(p => {
                const isActive = prefFilters.includes(p);
                return (
                  <label
                    key={p}
                    style={{
                      display: 'flex', alignItems: 'center', gap: space[1.5],
                      padding: '4px 6px', cursor: 'pointer', fontSize: font.size.xs,
                      borderRadius: radius.sm,
                      background: isActive ? alpha(color.navy, 0.05) : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => togglePref(p)}
                      style={{ accentColor: color.navy }}
                    />
                    <span style={{ color: color.textDark }}>{p}</span>
                  </label>
                );
              })}
              <div style={{ display: 'flex', gap: space[1], marginTop: space[1.5], paddingTop: space[1.5], borderTop: `1px solid ${color.borderLight}` }}>
                <Button size="sm" variant="outline" onClick={() => setPrefFilters([])}>クリア</Button>
                <Button size="sm" onClick={() => setPrefDropOpen(false)}>閉じる</Button>
              </div>
            </div>
          )}
        </div>

        {/* 架電開始 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: space[3] }}>
          <Button
            variant="primary"
            size="md"
            disabled={total === 0}
            onClick={() => setCallingMode('list')}
          >架電開始</Button>
          <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
            検索すると一覧が表示されます。企業の行をタップすると集中ページに遷移します。
          </span>
        </div>
      </div>

      {/* 企業一覧プレビュー (絞り込み前の全件) */}
      {isMobile ? (
        <div>
          {companies.length === 0 ? (
            <div style={{
              padding: '30px 0', textAlign: 'center', color: color.textLight, fontSize: font.size.sm,
              background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
            }}>企業データがありません</div>
          ) : (
            companies.slice(0, 30).map(c => (
              <div key={c.id} style={{
                background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
                padding: '10px 12px', marginBottom: space[1.5],
                opacity: c.is_excluded ? 0.55 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], marginBottom: space[1] }}>
                  <span style={{ fontSize: 9, color: color.textLight, fontFamily: font.family.mono }}>No.{c.no}</span>
                  <StatusBadge status={lastStatusByCompany[c.id]} />
                  {c.promoted_to_client_id && (<Badge variant="success" size="sm">CRM登録済</Badge>)}
                </div>
                <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[1] }}>
                  {c.company}
                </div>
                <div style={{ fontSize: font.size.xs - 1, color: color.textMid, marginBottom: 2 }}>
                  {c.business || '事業内容なし'}
                </div>
                <div style={{ fontSize: font.size.xs - 1, color: color.textMid, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{c.representative || '代表者不明'}</span>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} style={{
                      fontFamily: font.family.mono, color: color.navy, fontWeight: font.weight.semibold,
                      textDecoration: 'none', border: `1px solid ${color.navy}`,
                      borderRadius: radius.sm, padding: '1px 6px',
                    }} onClick={e => e.stopPropagation()}>{c.phone}</a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (() => {
        const cols = '40px 1.4fr 1fr 0.8fr 0.8fr 100px';
        return (
          <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.white, overflow: 'auto', maxHeight: 320 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: cols,
              padding: '8px 16px', background: color.navy, position: 'sticky', top: 0,
              fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.white,
            }}>
              <span>No</span>
              <span>企業名</span>
              <span>事業内容</span>
              <span>電話番号</span>
              <span>代表者</span>
              <span style={{ textAlign: 'center' }}>最新状況</span>
            </div>
            {companies.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
                企業データがありません
              </div>
            ) : (
              companies.slice(0, 200).map((c, i) => (
                <div key={c.id} style={{
                  display: 'grid', gridTemplateColumns: cols,
                  padding: '7px 16px', fontSize: font.size.xs, alignItems: 'center',
                  borderBottom: `1px solid ${color.offWhite}`,
                  opacity: c.is_excluded ? 0.5 : 1,
                }}>
                  <span style={{ color: color.textLight, fontFamily: font.family.mono, fontSize: font.size.xs - 1 }}>{c.no}</span>
                  <span style={{ fontWeight: font.weight.semibold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.company}
                    {c.promoted_to_client_id && (
                      <span style={{ marginLeft: 6, display: 'inline-block' }}>
                        <Badge variant="success" size="sm">CRM登録済</Badge>
                      </span>
                    )}
                  </span>
                  <span style={{ color: color.textMid, fontSize: font.size.xs - 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.business || '-'}</span>
                  <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs - 1, color: color.textMid }}>{c.phone || '-'}</span>
                  <span style={{ color: color.textMid, fontSize: font.size.xs - 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.representative || '-'}</span>
                  <span style={{ textAlign: 'center' }}>
                    <StatusBadge status={lastStatusByCompany[c.id]} />
                  </span>
                </div>
              ))
            )}
            {companies.length > 200 && (
              <div style={{ padding: '8px 16px', fontSize: font.size.xs, color: color.textLight, textAlign: 'center', background: color.offWhite }}>
                プレビューは200件まで表示。「架電開始」を押すと絞り込み結果の全件が表示されます。
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
