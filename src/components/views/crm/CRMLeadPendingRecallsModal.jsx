import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import { fetchAllPendingRecalls } from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

const STATUS_LABEL = {
  reception_recall: '受付再コール',
  keyman_recall: 'キーマン再コール',
};

function parseRecallAt(raw) {
  // memo に保存された日時文字列（toLocaleString('ja-JP') 形式）をパース
  // 例: "2026/5/16 10:00:00" / "2026-05-16 10:00:00"
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return null;
  return t;
}

function formatRecallAt(raw) {
  const t = parseRecallAt(raw);
  if (t == null) return raw || '—';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CRMLeadPendingRecallsModal({ onClose }) {
  const { data: recalls = [], isLoading } = useQuery({
    queryKey: ['crm-lead-pending-recalls'],
    queryFn: async () => {
      const { data } = await fetchAllPendingRecalls();
      return data;
    },
    staleTime: 30_000,
  });

  // 予定日時順にソート（過去日付が上、近い順）
  const sorted = useMemo(() => {
    const now = Date.now();
    return [...recalls].sort((a, b) => {
      const ta = parseRecallAt(a.recall_at_raw);
      const tb = parseRecallAt(b.recall_at_raw);
      // 予定日時不明は末尾
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      // 過去（now未満）が上、その中で古い順、未来は近い順
      const pastA = ta < now;
      const pastB = tb < now;
      if (pastA && !pastB) return -1;
      if (!pastA && pastB) return 1;
      return ta - tb;
    });
  }, [recalls]);

  const overdueCount = sorted.filter(r => {
    const t = parseRecallAt(r.recall_at_raw);
    return t != null && t < Date.now();
  }).length;

  const cols = '120px 1.5fr 1fr 110px 100px';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 20002,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
        width: 880, maxHeight: '85vh', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '12px 20px', background: NAVY, color: '#fff',
          fontWeight: 700, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            再コール予定の企業
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 400, marginTop: 2 }}>
              全リスト横断 ・ {sorted.length} 件
              {overdueCount > 0 && (
                <span style={{ color: '#FFD66B', fontWeight: 700, marginLeft: 8 }}>
                  予定日超過 {overdueCount} 件
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            padding: '5px 12px', borderRadius: 3,
            border: '1px solid #fff', background: 'transparent',
            color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
          }}>閉じる</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
              読み込み中...
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
              再コール予定の企業はありません
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: cols,
                padding: '8px 16px', background: GRAY_50,
                fontSize: 11, fontWeight: 700, color: NAVY,
                borderBottom: '1px solid ' + GRAY_200,
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                <span>予定日時</span>
                <span>企業名</span>
                <span>所属リスト</span>
                <span>ステータス</span>
                <span style={{ textAlign: 'center' }}>周回</span>
              </div>
              {sorted.map(r => {
                const t = parseRecallAt(r.recall_at_raw);
                const isOverdue = t != null && t < Date.now();
                return (
                  <div
                    key={r.id}
                    style={{
                      display: 'grid', gridTemplateColumns: cols,
                      padding: '10px 16px', fontSize: 11, alignItems: 'center',
                      borderBottom: '1px solid ' + GRAY_200,
                      background: isOverdue ? '#FEE2E230' : '#fff',
                    }}
                  >
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: 'tabular-nums',
                      color: isOverdue ? '#DC2626' : NAVY,
                      fontWeight: isOverdue ? 700 : 600,
                    }}>
                      {formatRecallAt(r.recall_at_raw)}
                      {isOverdue && (
                        <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#DC2626' }}>超過</span>
                      )}
                    </span>
                    <span style={{ fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.company?.company || '(企業名不明)'}
                      {r.company?.representative && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: C.textLight, fontWeight: 400 }}>
                          {r.company.representative}
                        </span>
                      )}
                    </span>
                    <span style={{ color: C.textMid, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.list?.name || '(リスト不明)'}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: r.status === 'reception_recall' ? '#B8860B' : '#1E40AF',
                    }}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    <span style={{
                      textAlign: 'center',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: 'tabular-nums',
                      color: C.textMid, fontSize: 10,
                    }}>{r.round}周目</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={{
          padding: '8px 16px', borderTop: '1px solid ' + GRAY_200,
          fontSize: 10, color: C.textLight,
        }}>
          ※「最新ラウンドが受付再コール／キーマン再コール」の企業のみを表示。
          memo の予定日時はそのレコード作成時に入力された値を使用。
          所属リストを開いて該当企業を選び、再コールしてください。
        </div>
      </div>
    </div>
  );
}
