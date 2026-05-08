import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Badge } from '../../ui';
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
        background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
        width: 880, maxHeight: '85vh', overflow: 'hidden',
        boxShadow: shadow.xl,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '12px 20px', background: color.navy, color: color.white,
          fontWeight: font.weight.bold, fontSize: font.size.md,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            再コール予定の企業
            <div style={{
              fontSize: font.size.xs - 1, color: alpha(color.white, 0.85),
              fontWeight: font.weight.normal, marginTop: 2,
            }}>
              全リスト横断 ・ {sorted.length} 件
              {overdueCount > 0 && (
                <span style={{ color: '#FFD66B', fontWeight: font.weight.bold, marginLeft: 8 }}>
                  予定日超過 {overdueCount} 件
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            style={{
              borderColor: color.white,
              color: color.white,
              background: 'transparent',
            }}
          >閉じる</Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
              読み込み中...
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
              再コール予定の企業はありません
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: cols,
                padding: '8px 16px', background: color.gray50,
                fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy,
                borderBottom: `1px solid ${color.border}`,
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
                      padding: '10px 16px', fontSize: font.size.xs, alignItems: 'center',
                      borderBottom: `1px solid ${color.border}`,
                      background: isOverdue ? alpha(color.danger, 0.08) : color.white,
                    }}
                  >
                    <span style={{
                      fontFamily: font.family.mono,
                      fontVariantNumeric: 'tabular-nums',
                      color: isOverdue ? color.danger : color.navy,
                      fontWeight: isOverdue ? font.weight.bold : font.weight.semibold,
                    }}>
                      {formatRecallAt(r.recall_at_raw)}
                      {isOverdue && (
                        <Badge variant="danger" size="sm" style={{ marginLeft: 6 }}>超過</Badge>
                      )}
                    </span>
                    <span style={{ fontWeight: font.weight.semibold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.company?.company || '(企業名不明)'}
                      {r.company?.representative && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: color.textLight, fontWeight: font.weight.normal }}>
                          {r.company.representative}
                        </span>
                      )}
                    </span>
                    <span style={{ color: color.textMid, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.list?.name || '(リスト不明)'}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: font.weight.bold,
                      color: r.status === 'reception_recall' ? '#B8860B' : '#1E40AF',
                    }}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    <span style={{
                      textAlign: 'center',
                      fontFamily: font.family.mono,
                      fontVariantNumeric: 'tabular-nums',
                      color: color.textMid, fontSize: 10,
                    }}>{r.round}周目</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={{
          padding: '8px 16px', borderTop: `1px solid ${color.border}`,
          fontSize: 10, color: color.textLight,
        }}>
          ※「最新ラウンドが受付再コール／キーマン再コール」の企業のみを表示。
          memo の予定日時はそのレコード作成時に入力された値を使用。
          所属リストを開いて該当企業を選び、再コールしてください。
        </div>
      </div>
    </div>
  );
}
