import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { C } from '../../../constants/colors';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';

// 商談進捗タブ。
//   - 面談済のアポを「初回面談」カラムに配置 (deals 行が無くてもカードは出す)
//   - deals 行があればそのステージに配置
//   - カードクリック → ステージ変更 (deals 行を作成/更新)
export default function ProgressTab({ deals, stages, onStageChange, client, engagementId, refresh }) {
  const [appos, setAppos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const orgId = getOrgId();

  // 面談済アポを取得 (client 選択時はそのクライアントのみ)
  useEffect(() => {
    if (!orgId) { setAppos([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('appointments')
        .select('id, company_name, meeting_date, status, client_id, client:clients(id, name), sales_amount')
        .eq('org_id', orgId)
        .eq('status', '面談済')
        .order('meeting_date', { ascending: false })
        .limit(5000);
      if (engagementId) q = q.eq('engagement_id', engagementId);
      if (client?.id) q = q.eq('client_id', client.id);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) console.error('[ProgressTab] 面談済アポ取得失敗:', error);
      setAppos(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, engagementId, client?.id]);

  const orderedStages = useMemo(
    () => [...(stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [stages]
  );

  // appointment_id → deal
  const dealByAppo = useMemo(() => {
    const m = {};
    for (const d of (deals || [])) if (d.appointment_id) m[d.appointment_id] = d;
    return m;
  }, [deals]);

  // 全カード (アポ + deal で紐付けされていないもの)
  const allCards = useMemo(() => {
    const cards = [];
    // アポベース
    for (const a of appos) {
      const deal = dealByAppo[a.id];
      cards.push({
        id: `appo:${a.id}`,
        appointment_id: a.id,
        deal_id: deal?.id || null,
        company: a.company_name || '—',
        client_name: a.client?.name || '',
        stage: deal?.stage || 'first_meeting',
        meeting_date: a.meeting_date,
        deal_value: deal?.deal_value || a.sales_amount || null,
        stage_changed_at: deal?.stage_changed_at || null,
      });
    }
    // deal だけある (appointment_id 無し) ケース
    for (const d of (deals || [])) {
      if (d.appointment_id) continue;
      cards.push({
        id: `deal:${d.id}`,
        appointment_id: null,
        deal_id: d.id,
        company: d.prospect_company || '—',
        client_name: d.client?.name || '',
        stage: d.stage || 'first_meeting',
        meeting_date: null,
        deal_value: d.deal_value || null,
        stage_changed_at: d.stage_changed_at,
      });
    }
    return cards;
  }, [appos, deals, dealByAppo]);

  const cardsByStage = useMemo(() => {
    const m = {};
    for (const s of orderedStages) m[s.id] = [];
    for (const c of allCards) {
      (m[c.stage] || (m[orderedStages[0]?.id] || [])).push(c);
    }
    return m;
  }, [allCards, orderedStages]);

  const selectedCard = allCards.find(c => c.id === selectedCardId) || null;

  const handleStageChange = useCallback(async (card, newStage) => {
    if (card.deal_id) {
      // 既存 deal の stage を更新
      await onStageChange(card.deal_id, newStage);
      await refresh?.();
    } else if (card.appointment_id) {
      // アポから新規 deal を作成
      const { data: appo } = await supabase.from('appointments')
        .select('id, company_name, client_id, engagement_id, phone, sales_amount, company_name')
        .eq('id', card.appointment_id)
        .single();
      if (!appo) return;
      const isTerminal = ['spa_closing','broken'].includes(newStage);
      const { error } = await supabase.from('deals').insert({
        org_id: orgId,
        engagement_id: appo.engagement_id,
        client_id: appo.client_id,
        appointment_id: appo.id,
        prospect_company: appo.company_name,
        deal_value: appo.sales_amount || null,
        stage: newStage,
        stage_changed_at: new Date().toISOString(),
        closed_status: newStage === 'spa_closing' ? 'won' : newStage === 'broken' ? 'lost' : 'open',
        closed_at: isTerminal ? new Date().toISOString() : null,
      });
      if (error) console.error('[deals.insert]', error);
      await refresh?.();
    }
    setSelectedCardId(null);
  }, [onStageChange, refresh, orgId]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>;
  }
  if (!orderedStages.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textLight, background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
      ステージが定義されていません
    </div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, color: C.textMid }}>
        {client
          ? `${client.name} の面談済アポ ${appos.length}件 / 案件 ${deals.length}件`
          : `全クライアントの面談済アポ ${appos.length}件 / 案件 ${deals.length}件`}
      </div>

      {allCards.length === 0 ? (
        <div style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight, background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
          {client ? 'このクライアントの面談済アポと案件はまだありません' : '面談済アポと案件がまだありません'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
          {orderedStages.map(s => {
            const list = cardsByStage[s.id] || [];
            const isSpecial = s.id === 'stopped' || s.id === 'broken';
            const bg = isSpecial ? (s.id === 'stopped' ? '#FEF3C7' : '#FEE2E2') : C.cream;
            const headerColor = isSpecial ? (s.id === 'stopped' ? '#92400E' : '#991B1B') : C.navy;
            return (
              <div key={s.id} style={{
                flex: '0 0 220px', background: bg, border: `1px solid ${C.border}`,
                borderRadius: 4, minHeight: 200, display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  padding: '8px 10px', background: headerColor, color: C.white,
                  borderRadius: '4px 4px 0 0', fontSize: 11, fontWeight: 600,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>{s.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{list.length}</span>
                </div>
                <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.length === 0 ? (
                    <div style={{ fontSize: 10, color: C.textLight, textAlign: 'center', padding: '12px 0' }}>—</div>
                  ) : list.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCardId(c.id)}
                      style={{
                        background: C.white, border: `1px solid ${c.deal_id ? C.border : '#DBEAFE'}`, borderRadius: 4,
                        padding: '8px 10px', cursor: 'pointer',
                        fontSize: 11, color: C.textDark,
                        opacity: s.is_terminal ? 0.75 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: C.navy, marginBottom: 2 }}>
                        {c.company}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMid }}>
                        {c.client_name || '—'}
                        {c.deal_value ? ` · ¥${Number(c.deal_value).toLocaleString()}` : ''}
                      </div>
                      {!c.deal_id && (
                        <div style={{ fontSize: 9, color: '#1E40AF', marginTop: 2 }}>
                          新規 (ステージ未設定)
                        </div>
                      )}
                      {c.meeting_date && (
                        <div style={{ fontSize: 9, color: C.textLight, marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>
                          面談: {String(c.meeting_date).slice(0, 10)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCard && (
        <StageChangeModal
          card={selectedCard}
          stages={orderedStages}
          onClose={() => setSelectedCardId(null)}
          onChange={(newStage) => handleStageChange(selectedCard, newStage)}
        />
      )}
    </div>
  );
}

function StageChangeModal({ card, stages, onClose, onChange }) {
  const [newStage, setNewStage] = useState(card.stage);
  const [saving, setSaving] = useState(false);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: 4, width: 420, maxWidth: '95vw',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600, color: C.navy }}>
          ステージ変更: {card.company}
        </div>
        <div style={{ padding: 20 }}>
          {!card.deal_id && (
            <div style={{ fontSize: 11, color: '#1E40AF', marginBottom: 10, background: '#EFF6FF', padding: '6px 10px', borderRadius: 4 }}>
              面談済アポから新規に商談レコードを作成します
            </div>
          )}
          <div style={{ fontSize: 11, color: C.textMid, marginBottom: 8 }}>新しいステージ</div>
          <select
            value={newStage}
            onChange={e => setNewStage(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 12,
              border: `1px solid ${C.border}`, borderRadius: 4, background: C.white,
            }}
          >
            {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '7px 14px', border: `1px solid ${C.border}`, background: C.white, color: C.textMid, borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
            キャンセル
          </button>
          <button onClick={async () => { setSaving(true); await onChange(newStage); setSaving(false); }} disabled={saving}
            style={{ padding: '7px 14px', border: 'none', background: C.navy, color: C.white, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
