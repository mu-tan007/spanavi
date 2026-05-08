import { color, font } from '../../constants/design';

export default function PlaceholderView({ title }) {
  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: font.weight.bold, color: color.navy, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: font.size.base, color: color.textLight }}>準備中</div>
      </div>
    </div>
  );
}
