import React, { useState, useEffect } from 'react';
import { space } from '../../../../constants/design';
import PageHeader from '../../../common/PageHeader';
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
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!selectedId && rows.length > 0) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="顧客一覧"
        description="3カラム一体型：受講生選択／個人ページ（8タブ＋視聴ログ）／タブ連動の右カラム"
        compact
        style={{ marginBottom: space[3] }}
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: space[3],
        flex: 1,
        minHeight: 0,
        padding: 0,
      }}>
        <div style={{ minHeight: 0 }}>
          <CustomerListColumn rows={rows} loading={loading}
            selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div style={{ minHeight: 0 }}>
          <CustomerDetail customerId={selectedId} isAdmin={isAdmin}
            onRefreshList={refresh} />
        </div>
      </div>
    </div>
  );
}
