import React, { useState, useEffect } from 'react';
import { space, color, font, radius } from '../../../../constants/design';
import PageHeader from '../../../common/PageHeader';
import { useIsMobile } from '../../../../hooks/useIsMobile';
import { useAuth } from '../../../../hooks/useAuth';
import { canArchiveCustomer } from '../../../../lib/spacareer/permissions';
import { useCustomersList } from './lib/useCustomers';
import CustomerListColumn from './CustomerListColumn';
import CustomerDetail from './CustomerDetail';

// ============================================================
// スパキャリ顧客一覧（運営ダッシュボード）
// 仕様書 §7.1：3カラム一体型（PC前提）
//   左：顧客リスト
//   中央：選択顧客の個人ページ（8タブ＋視聴ログ）
//   右：タブ連動の右カラム
// ============================================================
export default function SpacareerCustomersView({ isAdmin }) {
  const { rows, loading, refresh } = useCustomersList();
  const { profile } = useAuth();
  const canArchive = canArchiveCustomer(profile?.email);
  const [selectedId, setSelectedId] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    // スマホは「一覧 → 選んだら個人ページ」の順に見せるため、先頭を自動選択しない。
    // PCは左に一覧・右に個人ページが同時に出るので、開いた直後から中身が要る。
    if (isMobile) return;
    if (!selectedId && rows.length > 0) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId, isMobile]);

  // スマホ: 320px＋詳細を横に並べると個人ページがほぼ見えないため、
  //         一覧と個人ページを1画面ずつ切り替える（選択中は個人ページのみ表示）。
  const showDetailOnly = isMobile && !!selectedId;
  const showListOnly = isMobile && !selectedId;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!showDetailOnly && (
        <PageHeader
          title="顧客一覧"
          description={isMobile
            ? '受講生を選ぶと個人ページが開きます'
            : '3カラム一体型：受講生選択／個人ページ（8タブ＋視聴ログ）／タブ連動の右カラム'}
          compact
          style={{ marginBottom: space[3] }}
        />
      )}
      {showDetailOnly && (
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          style={{
            alignSelf: 'flex-start', marginBottom: space[2],
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', border: `1px solid ${color.border}`,
            borderRadius: radius.md, background: color.white, color: color.navy,
            fontSize: font.size.sm, fontWeight: font.weight.semibold,
            fontFamily: font.family.sans, cursor: 'pointer',
          }}
        >← 顧客一覧へ戻る</button>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '320px 1fr',
        gap: space[3],
        flex: 1,
        minHeight: 0,
        padding: 0,
      }}>
        {!showDetailOnly && (
          <div style={{ minHeight: 0 }}>
            <CustomerListColumn rows={rows} loading={loading}
              selectedId={selectedId} onSelect={setSelectedId}
              canViewArchived={canArchive} />
          </div>
        )}
        {!showListOnly && (
          <div style={{ minHeight: 0 }}>
            <CustomerDetail customerId={selectedId} isAdmin={isAdmin}
              onRefreshList={refresh}
              onArchived={() => setSelectedId(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
