import { C } from '../../constants/colors';

export const ScorePill = ({ score, label, color }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 7,
    padding: "3px 10px 3px 4px", borderRadius: 20,
    background: color + "10", border: "1px solid " + color + "25",
    flexShrink: 0,
  }}>
    <div style={{
      width: 26, height: 26, minWidth: 26, minHeight: 26, borderRadius: "50%",
      background: "conic-gradient(" + color + " " + (score * 3.6) + "deg, " + C.borderLight + " 0deg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, minWidth: 18, minHeight: 18, borderRadius: "50%", background: C.white,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
      }}>{score}</div>
    </div>
    <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: "nowrap" }}>{label}</span>
  </div>
);

export default ScorePill;
