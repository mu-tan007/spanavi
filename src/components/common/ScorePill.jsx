import { color, font, alpha } from '../../constants/design';

const NAVY = '#0D2247';

export const ScorePill = ({ score, label, color: _unusedColor }) => {
  const pillColor = NAVY;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "3px 10px 3px 4px", borderRadius: 20,
      background: alpha(pillColor, 0.063), border: `1px solid ${alpha(pillColor, 0.145)}`,
      flexShrink: 0,
    }}>
      <div style={{
        width: 26, height: 26, minWidth: 26, minHeight: 26, borderRadius: "50%",
        background: `conic-gradient(${pillColor} ${score * 3.6}deg, ${color.borderLight} 0deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <div style={{
          width: 18, height: 18, minWidth: 18, minHeight: 18, borderRadius: "50%", background: color.white,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: font.weight.bold, color: pillColor, fontFamily: font.family.mono,
          flexShrink: 0,
        }}>{score}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: font.weight.semibold, color: pillColor, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
};

export default ScorePill;
