import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import {
  fetchClientLeadCompanies, fetchClientCallRecords,
  updateClientLeadList,
} from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50 } from './utils';
import CRMLeadCallingScreen from './CRMLeadCallingScreen';

function StatusBadge({ status }) {
  if (!status) return <span style={{ color: C.textLight, fontSize: 10 }}>—</span>;
  const STATUS_LABELS = {
    absent: '不通',
    keyman_absent: 'キーマン不在',
    keyman_connect: 'キーマン接続',
    appointment: 'アポ獲得',
    reception_block: '受付ブロック',
    reception_recall: '受付再コール',
    keyman_recall: 'キーマン再コール',
    rejected: 'お断り',
    inquiry_form: '問い合わせフォーム',
    excluded: '除外',
  };
  const STATUS_COLORS = {
    appointment: '#16A34A',
    keyman_connect: '#1E40AF',
    inquiry_form: '#7c3aed',
    reception_recall: '#B8860B',
    keyman_recall: '#B8860B',
    rejected: '#DC2626',
    reception_block: '#DC2626',
    excluded: '#9CA3AF',
    absent: '#6B7280',
    keyman_absent: '#6B7280',
  };
  const color = STATUS_COLORS[status] || '#6B7280';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px',
      borderRadius: 2, background: color + '15', color,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
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

  return (
    <div style={{
      marginBottom: 16,
      background: '#fff',
      border: '1px solid ' + GRAY_200,
      borderRadius: 4,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: "'Noto Sans JP'",
          fontSize: 12, fontWeight: 700, color: NAVY,
        }}
      >
        <span>架電トークスクリプト{body ? '' : '（未設定）'}</span>
        <span style={{ fontSize: 14, color: C.textLight }}>{open ? '−' : '+'}</span>
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
              borderRadius: 4, border: '1px solid ' + GRAY_200,
              fontSize: 12, fontFamily: "'Noto Sans JP'", lineHeight: 1.6,
              outline: 'none', resize: 'vertical',
              background: GRAY_50,
            }}
          />
          <div style={{ marginTop: 6, textAlign: 'right' }}>
            <button
              onClick={handleSave}
              disabled={saving || body === (list?.script_body || '')}
              style={{
                padding: '6px 14px', borderRadius: 3, border: 'none',
                background: (saving || body === (list?.script_body || '')) ? C.textLight : NAVY,
                color: '#fff', fontSize: 11, fontWeight: 500,
                cursor: (saving || body === (list?.script_body || '')) ? 'not-allowed' : 'pointer',
                fontFamily: "'Noto Sans JP'",
              }}
            >{saving ? '保存中...' : 'スクリプトを保存'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CRMLeadListDetailView({ list, currentUser, members = [], setClientData, onBack }) {
  const queryClient = useQueryClient();
  const [callingOpen, setCallingOpen] = useState(false);

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

  // 各企業の最新ラウンドステータスを集計
  const lastStatusByCompany = {};
  const maxRoundByCompany = {};
  records.forEach(r => {
    if (!maxRoundByCompany[r.lead_company_id] || r.round > maxRoundByCompany[r.lead_company_id]) {
      maxRoundByCompany[r.lead_company_id] = r.round;
      lastStatusByCompany[r.lead_company_id] = r.status;
    }
  });

  if (!list) {
    return (
      <div style={{ padding: 20 }}>
        <button onClick={onBack}>← 戻る</button>
        <div style={{ marginTop: 12, color: C.textLight }}>リストが見つかりません</div>
      </div>
    );
  }

  if (callingOpen) {
    return (
      <CRMLeadCallingScreen
        list={list}
        companies={companies}
        records={records}
        currentUser={currentUser}
        setClientData={setClientData}
        onClose={() => {
          setCallingOpen(false);
          queryClient.invalidateQueries({ queryKey: ['crm-lead-records', list.id] });
          queryClient.invalidateQueries({ queryKey: ['crm-lead-companies', list.id] });
        }}
      />
    );
  }

  // 集計
  const total = companies.length;
  const calledCount = Object.keys(lastStatusByCompany).length;
  const apptCount = Object.values(lastStatusByCompany).filter(s => s === 'appointment').length;
  const inquiryCount = Object.values(lastStatusByCompany).filter(s => s === 'inquiry_form').length;

  const cols = '40px 1.4fr 1fr 0.8fr 0.8fr 100px';

  return (
    <div>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
        padding: '14px 18px', background: '#fff', borderRadius: 4,
        border: '1px solid ' + GRAY_200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              padding: '6px 12px', borderRadius: 3,
              border: '1px solid ' + GRAY_200, background: '#fff',
              color: C.textMid, fontSize: 11, cursor: 'pointer',
              fontFamily: "'Noto Sans JP'",
            }}
          >← リスト一覧</button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{list.name}</div>
            <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>
              {list.industry ? list.industry + ' / ' : ''}{total} 件
              {' '}・ 架電済 {calledCount} 件
              {' '}・ アポ {apptCount} 件
              {inquiryCount > 0 ? ` ・ 問合せ ${inquiryCount} 件` : ''}
            </div>
          </div>
        </div>
        <button
          onClick={() => setCallingOpen(true)}
          disabled={total === 0}
          style={{
            padding: '8px 18px', borderRadius: 4, border: 'none',
            background: total === 0 ? C.textLight : NAVY,
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: total === 0 ? 'not-allowed' : 'pointer',
            fontFamily: "'Noto Sans JP'",
          }}
        >架電を開始</button>
      </div>

      {/* スクリプト編集 */}
      <ScriptEditor list={list} />

      {/* 企業一覧 */}
      <div style={{ border: '1px solid ' + GRAY_200, borderRadius: 4, background: '#fff', overflow: 'auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: cols,
          padding: '8px 16px', background: NAVY,
          fontSize: 11, fontWeight: 600, color: '#fff',
        }}>
          <span>No</span>
          <span>企業名</span>
          <span>事業内容</span>
          <span>電話番号</span>
          <span>代表者</span>
          <span style={{ textAlign: 'center' }}>最新状況</span>
        </div>
        {companies.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: C.textLight, fontSize: 12 }}>
            企業データがありません
          </div>
        ) : (
          companies.map((c, i) => (
            <div key={c.id} style={{
              display: 'grid', gridTemplateColumns: cols,
              padding: '7px 16px', fontSize: 11, alignItems: 'center',
              borderBottom: '1px solid ' + GRAY_200,
              background: i % 2 === 0 ? '#fff' : GRAY_50,
              opacity: c.is_excluded ? 0.5 : 1,
            }}>
              <span style={{ color: C.textLight, fontFamily: "'JetBrains Mono'", fontSize: 10 }}>{c.no}</span>
              <span style={{ fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.company}
                {c.promoted_to_client_id && (
                  <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, color: '#16A34A', border: '1px solid #16A34A', borderRadius: 2, padding: '1px 4px' }}>CRM登録済</span>
                )}
              </span>
              <span style={{ color: C.textMid, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.business || '-'}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textMid }}>{c.phone || '-'}</span>
              <span style={{ color: C.textMid, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.representative || '-'}</span>
              <span style={{ textAlign: 'center' }}>
                <StatusBadge status={lastStatusByCompany[c.id]} />
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
