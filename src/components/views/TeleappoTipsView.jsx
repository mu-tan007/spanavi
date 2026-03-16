import { C } from '../../constants/colors';

export default function TeleappoTipsView() {
  return (
    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 8 }}>テレアポの極意</div>
        <div style={{ fontSize: 13, color: C.textLight }}>準備中</div>
      </div>
    </div>
  );
}
