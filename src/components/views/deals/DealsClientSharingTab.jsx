import React from 'react';
import { C } from '../../../constants/colors';

export default function DealsClientSharingTab() {
  return (
    <div style={{
      padding: 40, textAlign: 'center', color: C.textMid,
      minHeight: 'calc(100% - 40px)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>PHASE 2.5</div>
      <h3 style={{ fontSize: 20, fontWeight: 600, color: C.navy, marginBottom: 10, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
        Client Sharing
      </h3>
      <div style={{ width: 48, height: 2, background: C.gold, marginBottom: 14 }} />
      <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7, maxWidth: 400 }}>
        クライアント企業を Spanavi に招待し、Deal の進捗を共有する機能です。
      </p>
      <p style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>Phase 2.5 で実装予定</p>
    </div>
  );
}
