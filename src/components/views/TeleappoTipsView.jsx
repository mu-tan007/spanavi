import { C } from '../../constants/colors';
import PageHeader from '../common/PageHeader';

export default function TeleappoTipsView() {
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        eyebrow="研修 · Mastery"
        title="Mastery"
        description="テレアポ上達のコツ・ノウハウ"
        style={{ marginBottom: 24 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0D2247', marginBottom: 8 }}>テレアポの極意</div>
          <div style={{ fontSize: 13, color: C.textLight }}>準備中</div>
        </div>
      </div>
    </div>
  );
}
