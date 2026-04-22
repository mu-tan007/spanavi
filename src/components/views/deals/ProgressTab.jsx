import React, { useMemo, useState } from 'react';
import { C } from '../../../constants/colors';

// 商談進捗タブ。deals を 12 ステージに分けたカンバン + クリックで詳細/ステージ変更
export default function ProgressTab({ deals, stages, loading, onStageChange, client }) {
  const [selectedDealId, setSelectedDealId] = useState(null);

  // stage 定義を order で並び替え (ストップ/ブレイクは末尾)
  const orderedStages = useMemo(() =>
    [...(stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
  , [stages]);

  const dealsByStage = useMemo(() => {
    const m = {};
    for (const s of orderedStages) m[s.id] = [];
    for (const d of (deals || [])) {
      if (m[d.stage]) m[d.stage].push(d);
      else if (orderedStages.length) m[orderedStages[0].id].push(d);
    }
    return m;
  }, [deals, orderedStages]);

  const selectedDeal = (deals || []).find(d => d.id === selectedDealId) || null;

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中...</div>;
  }
  if (!orderedStages.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textLight, background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
      ステージが定義されていません
    </div>;
  }

  const noDeals = !deals || deals.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, color: C.textMid }}>
        {client ? `${client.name} の案件 ${deals.length}件` : `全クライアントの案件 ${deals.length}件`}
      </div>

      {noDeals ? (
        <div style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight, background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
          {client ? 'このクライアントの案件はまだありません' : '案件がありません'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
          {orderedStages.map(s => {
            const list = dealsByStage[s.id] || [];
            const isTerminal = s.is_terminal;
            const isSpecial = s.id === 'stopped' || s.id === 'broken';
            const bg = isSpecial ? (s.id === 'stopped' ? '#FEF3C7' : '#FEE2E2') : C.cream;
            const headerColor = isSpecial ? (s.id === 'stopped' ? '#92400E' : '#991B1B') : C.navy;
            return (
              <div key={s.id} style={{
                flex: '0 0 220px', background: bg, border: `1px solid ${C.border}`,
                borderRadius: 4, minHeight: 160, display: 'flex', flexDirection: 'column',
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
                  ) : list.map(d => (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDealId(d.id)}
                      style={{
                        background: C.white, border: `1px solid ${C.border}`, borderRadius: 4,
                        padding: '8px 10px', cursor: 'pointer',
                        fontSize: 11, color: C.textDark,
                        opacity: isTerminal ? 0.75 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: C.navy, marginBottom: 2 }}>
                        {d.prospect_company || '(未設定)'}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMid }}>
                        {d.client?.name || '—'}{d.deal_value ? ` · ¥${Number(d.deal_value).toLocaleString()}` : ''}
                      </div>
                      {d.stage_changed_at && (
                        <div style={{ fontSize: 9, color: C.textLight, marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>
                          更新: {new Date(d.stage_changed_at).toISOString().slice(0, 10)}
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

      {selectedDeal && (
        <DealStageChangeModal
          deal={selectedDeal}
          stages={orderedStages}
          onClose={() => setSelectedDealId(null)}
          onStageChange={async (newStage) => {
            await onStageChange(selectedDeal.id, newStage);
            setSelectedDealId(null);
          }}
        />
      )}
    </div>
  );
}

function DealStageChangeModal({ deal, stages, onClose, onStageChange }) {
  const [newStage, setNewStage] = useState(deal.stage);
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
          ステージ変更: {deal.prospect_company || '(未設定)'}
        </div>
        <div style={{ padding: 20 }}>
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
          <button onClick={onClose}
            style={{ padding: '7px 14px', border: `1px solid ${C.border}`, background: C.white, color: C.textMid, borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
            キャンセル
          </button>
          <button onClick={() => onStageChange(newStage)}
            style={{ padding: '7px 14px', border: 'none', background: C.navy, color: C.white, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
