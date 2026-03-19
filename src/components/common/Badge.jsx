import { C } from '../../constants/colors';

export const Badge = ({ children, color = C.navy, glow = false, small = false, rank }) => {
  // Gold only for rank #1
  if (rank === 1) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: small ? "1px 7px" : "2px 10px",
        borderRadius: 4, fontSize: small ? 10 : 11, fontWeight: 600,
        color: '#C8A84B',
        background: '#C8A84B1a',
        border: "1px solid #C8A84B30",
        whiteSpace: "nowrap",
      }}>{children}</span>
    );
  }

  // All other badges: thin background style, no filled/solid backgrounds
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: small ? "1px 7px" : "2px 8px",
      borderRadius: 4, fontSize: small ? 10 : 12, fontWeight: 600,
      color,
      background: color + "1a",
      borderLeft: "3px solid " + color,
      paddingLeft: 8,
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
};

export default Badge;
