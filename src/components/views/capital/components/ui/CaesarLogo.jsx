export default function CaesarLogo({ size = 56, animated = false }) {
  if (animated) {
    return (
      <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <style>{`
          @keyframes cbl-b1  { 0%,100%{opacity:0} 30%,50%{opacity:1} }
          @keyframes cbl-b2  { 0%,100%{opacity:0} 35%,53%{opacity:1} }
          @keyframes cbl-b3  { 0%,100%{opacity:0} 25%,47%{opacity:1} }
          @keyframes cbl-b4  { 0%,100%{opacity:0} 38%,56%{opacity:1} }
          @keyframes cbl-b5  { 0%,100%{opacity:0} 28%,46%{opacity:1} }
          @keyframes cbl-b6  { 0%,100%{opacity:0} 32%,52%{opacity:1} }
          @keyframes cbl-b7  { 0%,100%{opacity:0} 22%,44%{opacity:1} }
          @keyframes cbl-b8  { 0%,100%{opacity:0} 40%,58%{opacity:1} }
          @keyframes cbl-b9  { 0%,100%{opacity:0} 27%,49%{opacity:1} }
          @keyframes cbl-b10 { 0%,100%{opacity:0} 36%,54%{opacity:1} }
          .cbl-b1  { animation: cbl-b1  1.6s ease-in-out infinite; }
          .cbl-b2  { animation: cbl-b2  1.6s ease-in-out infinite 0.05s; }
          .cbl-b3  { animation: cbl-b3  1.6s ease-in-out infinite 0.10s; }
          .cbl-b4  { animation: cbl-b4  1.6s ease-in-out infinite 0.08s; }
          .cbl-b5  { animation: cbl-b5  1.6s ease-in-out infinite 0.03s; }
          .cbl-b6  { animation: cbl-b6  1.6s ease-in-out infinite 0.06s; }
          .cbl-b7  { animation: cbl-b7  1.6s ease-in-out infinite 0.12s; }
          .cbl-b8  { animation: cbl-b8  1.6s ease-in-out infinite 0.04s; }
          .cbl-b9  { animation: cbl-b9  1.6s ease-in-out infinite 0.09s; }
          .cbl-b10 { animation: cbl-b10 1.6s ease-in-out infinite 0.07s; }
        `}</style>
        <path d="M37 7 A21 21 0 1 0 37 49" stroke="#181818" strokeWidth="7" fill="none" strokeLinecap="butt"/>
        <rect x="34" y="4"    width="7" height="5.5" rx="1" fill="#4a8cd4"/>
        <rect x="34" y="46.5" width="7" height="5.5" rx="1" fill="#4a8cd4"/>
        <path className="cbl-b1"  d="M38 11 L42 18 L39 18 L43 26" stroke="#7ac0ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path className="cbl-b2"  d="M40 12 L37 19 L40 19 L37 26" stroke="#aad8ff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path className="cbl-b3"  d="M39 11 L44 20 L40 20 L44 27" stroke="#5aaeff" strokeWidth="1.0" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path className="cbl-b4"  d="M41 13 L38 20 L41 20 L38 27" stroke="#c0e0ff" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.8"/>
        <path className="cbl-b5"  d="M38 12 L43 21 L39 21 L43 28" stroke="#90c8ff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.7"/>
        <path className="cbl-b6"  d="M38 45 L42 38 L39 38 L43 30" stroke="#7ac0ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path className="cbl-b7"  d="M40 44 L37 37 L40 37 L37 30" stroke="#aad8ff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path className="cbl-b8"  d="M39 45 L44 36 L40 36 L44 29" stroke="#5aaeff" strokeWidth="1.0" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path className="cbl-b9"  d="M41 43 L38 36 L41 36 L38 29" stroke="#c0e0ff" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.8"/>
        <path className="cbl-b10" d="M38 44 L43 35 L39 35 L43 28" stroke="#90c8ff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.7"/>
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="28" r="20" stroke="#181818" strokeWidth="0.8" fill="none"/>
      <path d="M37 7 A21 21 0 1 0 37 49" stroke="#181818" strokeWidth="7" fill="none" strokeLinecap="butt"/>
      <rect x="34" y="4"    width="7" height="5.5" rx="1" fill="#4a8cd4"/>
      <rect x="34" y="46.5" width="7" height="5.5" rx="1" fill="#4a8cd4"/>
    </svg>
  )
}
