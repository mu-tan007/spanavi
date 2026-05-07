// このファイルは Week 5-C で本実装。
// 5-B の段階ではビルドを通すための仮実装。
import { C } from '../../../constants/colors';
import { NAVY, GRAY_200 } from './utils';

export default function CRMLeadCallingScreen({ list, onClose }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center',
      background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 10 }}>
        架電画面（{list?.name}）
      </div>
      <div style={{ fontSize: 12, color: C.textMid, marginBottom: 20 }}>
        本実装は次のステップ（Week 5-C）で追加します。
      </div>
      <button
        onClick={onClose}
        style={{
          padding: '8px 16px', borderRadius: 4,
          border: '1px solid ' + NAVY, background: '#fff',
          color: NAVY, fontSize: 12, cursor: 'pointer',
        }}
      >← 戻る</button>
    </div>
  );
}
