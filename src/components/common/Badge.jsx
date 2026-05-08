import { color, font, radius, alpha } from '../../constants/design';

export const Badge = ({ children, color: badgeColor = color.navy, glow = false, small = false, rank }) => {
  // Gold only for rank #1
  if (rank === 1) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: small ? "1px 7px" : "2px 10px",
        borderRadius: radius.md, fontSize: small ? 10 : 11, fontWeight: font.weight.semibold,
        color: color.gold,
        background: alpha(color.gold, 0.10),
        border: `1px solid ${alpha(color.gold, 0.19)}`,
        whiteSpace: "nowrap",
      }}>{children}</span>
    );
  }

  // All other badges: thin background style, no filled/solid backgrounds
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: small ? "1px 7px" : "2px 8px",
      borderRadius: radius.md, fontSize: small ? 10 : 12, fontWeight: font.weight.semibold,
      color: badgeColor,
      background: alpha(badgeColor, 0.10),
      borderLeft: `3px solid ${badgeColor}`,
      paddingLeft: 8,
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
};

export default Badge;
