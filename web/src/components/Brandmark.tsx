// The Capsule brand mark — a rounded azure tile with a drawn "C" and orbit dot.
// Used in the nav rail (clickable → home) and anywhere the logo appears.
export function Brandmark({ size = 34 }: { size?: number }) {
  return (
    <svg className="brandmark" width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id="capsule-lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2899f5" />
          <stop offset="1" stopColor="#0f6cbd" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#capsule-lg)" />
      <path d="M28 13 A10 10 0 1 0 28 27" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="20" r="2.4" fill="#fff" />
    </svg>
  );
}
