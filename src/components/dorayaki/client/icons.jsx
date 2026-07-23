// dorayaki.AI ポータル用 細線アイコン群(絵文字禁止トーン)。
// currentColor 追従・stroke ベース。size で一括制御。
import React from 'react';

function Svg({ children, size = 18, sw = 1.6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const IconProjects = (p) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></Svg>
);
export const IconCalls = (p) => (
  <Svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l2 5v3a1 1 0 0 1-1 1A17 17 0 0 1 4 5a1 1 0 0 1 1-1Z" /></Svg>
);
export const IconAppointments = (p) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" />
    <path d="M8.5 14.5l2 2 4-4" />
  </Svg>
);
export const IconCompanies = (p) => (
  <Svg {...p}>
    <path d="M4 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" /><path d="M13 9h6a1 1 0 0 1 1 1v11" />
    <path d="M7 8h3M7 12h3M7 16h3M16 13h1M16 17h1" />
  </Svg>
);
export const IconAnalytics = (p) => (
  <Svg {...p}><path d="M4 20V4M20 20H4" /><path d="M8 16v-4M12 16V8M16 16v-6" /></Svg>
);
export const IconReports = (p) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4" />
    <path d="M8.5 12h7M8.5 16h7" />
  </Svg>
);
export const IconMembers = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 6a3 3 0 0 1 0 6M17.5 20a5.5 5.5 0 0 0-2-4" />
  </Svg>
);
export const IconSettings = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Svg>
);
export const IconLogout = (p) => (
  <Svg {...p}><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 12H3M6 8l-4 4 4 4" /></Svg>
);
export const IconBell = (p) => (
  <Svg {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></Svg>
);
