import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Badge } from '../../ui';
import {
  fetchClientLeadCompanies, fetchClientCallRecords,
  updateClientLeadList,
} from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50 } from './utils';
import { useIsMobile } from '../../../hooks/useIsMobile';
import CRMLeadCallingScreen from './CRMLeadCallingScreen';
import CRMLeadCallFlowView from './CRMLeadCallFlowView';

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

const STATUS_VARIANT = {
  appointment: 'success',
  keyman_connect: 'primary',
  inquiry_form: 'info',
  reception_recall: 'warn',
  keyman_recall: 'warn',
  rejected: 'danger',
  reception_block: 'danger',
  excluded: 'neutral',
  absent: 'neutral',
  keyman_absent: 'neutral',
};

function StatusBadge({ status }) {
  if (!status) return <span style={{ color: color.textLight, fontSize: font.size.xs - 1 }}>—</span>;
  const variant = STATUS_VARIANT[status] || 'neutral';
  const label = STATUS_LABELS[status] || status;
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
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

  const isUnchanged = body === (list?.script_body || '');

  return (
    <div style={{
      marginBottom: space[4],
      background: color.white,
      border: '1px solid ' + GRAY_200,
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
          fontSize: font.size.sm, fontWeight: font.weight.bold, color: NAVY,
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
              borderRadius: radius.md, border: '1px solid ' + GRAY_200,
              fontSize: font.size.sm, fontFamily: font.family.sans, lineHeight: 1.6,
              outline: 'none', resize: 'vertical',
              background: GRAY_50, color: color.textDark,
            }}
          />
          <div style={{ marginTop: space[1.5], textAlign: 'right' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isUnchanged}
              loading={saving}
              style={{ background: (saving || isUnchanged) ? color.textLight : NAVY }}
            >{saving ? '保存中...' : 'スクリプトを保存'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CRMLeadListDetailView({ list, currentUser, members = [], setClientData, onBack }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [callingMode, setCallingMode] = useState(null); // 'list' | 'flow' | null

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
      <div style={{ padding: space[5] }}>
        <Button variant="secondary" size="sm" onClick={onBack}>← 戻る</Button>
        <div style={{ marginTop: space[3], color: color.textLight }}>リストが見つかりません</div>
      </div>
    );
  }

  if (callingMode) {
    const handleClose = () => {
      setCallingMode(null);
      queryClient.invalidateQueries({ queryKey: ['crm-lead-records', list.id] });
      queryClient.invalidateQueries({ queryKey: ['crm-lead-companies', list.id] });
    };
    const props = { list, companies, records, currentUser, members, setClientData, onClose: handleClose };
    return callingMode === 'flow'
      ? <CRMLeadCallFlowView {...props} />
      : <CRMLeadCallingScreen {...props} />;
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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4],
        padding: '14px 18px', background: color.white, borderRadius: radius.md,
        border: '1px solid ' + GRAY_200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
          >← リスト一覧</Button>
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY }}>{list.name}</div>
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>
              {list.industry ? list.industry + ' / ' : ''}{total} 件
              {' '}・ 架電済 {calledCount} 件
              {' '}・ アポ {apptCount} 件
              {inquiryCount > 0 ? ` ・ 問合せ ${inquiryCount} 件` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[1.5] }}>
          <Button
            variant="outline"
            size="md"
            onClick={() => setCallingMode('list')}
            disabled={total === 0}
            title="一覧モードで起動（複数企業を一覧で見ながら効率的に架電）"
            style={{ borderColor: total === 0 ? color.textLight : NAVY, color: total === 0 ? color.textLight : NAVY }}
          >一覧モードで開始</Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => setCallingMode('flow')}
            disabled={total === 0}
            title="集中モードで起動（1社ずつフォーカスしてじっくり架電）"
            style={{ background: total === 0 ? color.textLight : NAVY }}
          >集中モードで開始</Button>
        </div>
      </div>

      {/* スクリプト編集 */}
      <ScriptEditor list={list} />

      {/* 企業一覧（モバイルはカード形式） */}
      {isMobile ? (
        <div>
          {companies.length === 0 ? (
            <div style={{
              padding: '30px 0', textAlign: 'center', color: color.textLight, fontSize: font.size.sm,
              background: color.white, border: '1px solid ' + GRAY_200, borderRadius: radius.md,
            }}>
              企業データがありません
            </div>
          ) : (
            companies.map(c => (
              <div key={c.id} style={{
                background: color.white, border: '1px solid ' + GRAY_200, borderRadius: radius.md,
                padding: '10px 12px', marginBottom: space[1.5],
                opacity: c.is_excluded ? 0.55 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], marginBottom: space[1] }}>
                  <span style={{ fontSize: 9, color: color.textLight, fontFamily: font.family.mono }}>No.{c.no}</span>
                  <StatusBadge status={lastStatusByCompany[c.id]} />
                  {c.promoted_to_client_id && (
                    <Badge variant="success" size="sm">CRM登録済</Badge>
                  )}
                </div>
                <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: NAVY, marginBottom: space[1] }}>
                  {c.company}
                </div>
                <div style={{ fontSize: font.size.xs - 1, color: color.textMid, marginBottom: 2 }}>
                  {c.business || '事業内容なし'}
                </div>
                <div style={{ fontSize: font.size.xs - 1, color: color.textMid, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{c.representative || '代表者不明'}</span>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} style={{
                      fontFamily: font.family.mono, color: NAVY, fontWeight: font.weight.semibold,
                      textDecoration: 'none', border: '1px solid ' + NAVY,
                      borderRadius: radius.sm, padding: '1px 6px',
                    }} onClick={e => e.stopPropagation()}>
                      {c.phone}
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
      <div style={{ border: '1px solid ' + GRAY_200, borderRadius: radius.md, background: color.white, overflow: 'auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: cols,
          padding: '8px 16px', background: NAVY,
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
          companies.map((c, i) => (
            <div key={c.id} style={{
              display: 'grid', gridTemplateColumns: cols,
              padding: '7px 16px', fontSize: font.size.xs, alignItems: 'center',
              borderBottom: '1px solid ' + GRAY_200,
              background: i % 2 === 0 ? color.white : GRAY_50,
              opacity: c.is_excluded ? 0.5 : 1,
            }}>
              <span style={{ color: color.textLight, fontFamily: font.family.mono, fontSize: font.size.xs - 1 }}>{c.no}</span>
              <span style={{ fontWeight: font.weight.semibold, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      </div>
      )}
    </div>
  );
}
