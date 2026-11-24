/**
 * Yuklanish animatsiyalari (SVG). Rangi: tugma rangi (Telegram mavzusi), matn — kulrang.
 *   <Loader />                    — "Yuklanmoqda" (aylanuvchi halqa)
 *   <Loader label="Yuborilmoqda" />
 *   <FaceScan label="Tekshirilmoqda" /> — yuz skanerlanmoqda (davomat yuborilayotganda)
 */

/** Uch nuqta — navbat bilan yonib-o'chadi */
function Dots() {
  return (
    <svg viewBox="0 0 24 6" className="ml-0.5 inline-block h-[0.4em] w-[1.6em] align-baseline" aria-hidden="true">
      {[3, 12, 21].map((cx, i) => (
        <circle key={cx} cx={cx} cy="3" r="2.4" fill="currentColor" opacity="0.25">
          <animate attributeName="opacity" values="0.25;1;0.25" dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

function Label({ text }: { text: string }) {
  return (
    <span className="text-sm font-medium text-tg-hint">
      {text}
      <Dots />
    </span>
  );
}

/** Aylanuvchi halqa */
export function Spinner({ className = "size-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`animate-spin ${className}`} aria-hidden="true">
      <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
      <circle
        cx="24"
        cy="24"
        r="19"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="38 120"
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}

export default function Loader({ label = "Yuklanmoqda", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={`flex flex-col items-center gap-3 text-tg-button ${className}`}>
      <Spinner />
      <Label text={label} />
    </div>
  );
}

/** Yuz skaneri: ramka burchaklari, yuz chizig'i va yuqoridan pastga yuradigan skaner chizig'i */
export function FaceScan({ label = "Tekshirilmoqda", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={`flex flex-col items-center gap-4 text-tg-button ${className}`}>
      <svg viewBox="0 0 120 120" className="size-36" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
        <defs>
          <linearGradient id="scan-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.28" />
          </linearGradient>
          <clipPath id="scan-area">
            <rect x="14" y="14" width="92" height="92" rx="14" />
          </clipPath>
        </defs>

        {/* Ramka burchaklari */}
        <g strokeWidth="4" strokeLinejoin="round">
          <path d="M14 36V24a10 10 0 0 1 10-10h12" />
          <path d="M84 14h12a10 10 0 0 1 10 10v12" />
          <path d="M106 84v12a10 10 0 0 1-10 10H84" />
          <path d="M36 106H24a10 10 0 0 1-10-10V84" />
        </g>

        {/* Yuz */}
        <g strokeWidth="2.5" strokeOpacity="0.55" strokeLinejoin="round">
          <ellipse cx="60" cy="58" rx="24" ry="30" />
          <path d="M49 52h4M67 52h4" />
          <path d="M60 55v9h-3" />
          <path d="M51 72c5 4 13 4 18 0" />
        </g>

        {/* Skaner chizig'i (ostida yorug'lik izi) */}
        <g clipPath="url(#scan-area)">
          <g>
            <rect x="14" y="-6" width="92" height="22" fill="url(#scan-glow)" stroke="none" />
            <path d="M18 16h84" strokeWidth="3" />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 8; 0 86; 0 8"
              dur="2.4s"
              calcMode="spline"
              keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
              repeatCount="indefinite"
            />
          </g>
        </g>
      </svg>
      <Label text={label} />
    </div>
  );
}
