import { C } from '../../constants/colors';

const NAVY = '#0D2247';

export const ScorePill = ({ score, label, color }) => {
  const pillColor = NAVY;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "3px 10px 3px 4px", borderRadius: 20,
      background: pillColor + "10", border: "1px solid " + pillColor + "25",
      flexShrink: 0,
    }}>
      <div style={{
        width: 26, height: 26, minWidth: 26, minHeight: 26, borderRadius: "50%",
        background: "conic-gradient(" + pillColor + " " + (score * 3.6) + "deg, " + C.borderLight + " 0deg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <div style={{
          width: 18, height: 18, minWidth: 18, minHeight: 18, borderRadius: "50%", background: C.white,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 700, color: pillColor, fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
        }}>{score}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: pillColor, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
};

export default ScorePill;
