import { C } from '../../constants/colors';

export const Badge = ({ children, color = C.navy, glow = false, small = false }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: small ? "1px 7px" : "2px 10px",
    borderRadius: 4, fontSize: small ? 10 : 11, fontWeight: 600, letterSpacing: 0.3,
    color, background: glow ? color + "14" : "transparent",
    border: "1px solid " + color + "30", whiteSpace: "nowrap",
  }}>{children}</span>
);

export default Badge;
