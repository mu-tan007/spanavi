import { color, font, space } from '../../constants/design';

export default function MaspFirmsView() {
  return (
    <div style={{ padding: space[8], color: color.navy }}>
      <h1 style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, marginBottom: space[3] }}>
        Firms (デバッグ中)
      </h1>
      <p style={{ fontSize: font.size.sm, color: color.textMid }}>
        このページが見えれば View 自体はレンダリング可能です。MaspFirmsView を一時的に簡略化中。
      </p>
    </div>
  );
}
