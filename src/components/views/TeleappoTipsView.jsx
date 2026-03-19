import { C } from '../../constants/colors';

export default function TeleappoTipsView() {
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Mastery</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>テレアポ上達のコツ・ノウハウ</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0D2247', marginBottom: 8 }}>テレアポの極意</div>
          <div style={{ fontSize: 13, color: C.textLight }}>準備中</div>
        </div>
      </div>
    </div>
  );
}
