import type { ReactElement, ReactNode, SVGProps } from "react";

/**
 * Interfeysdagi barcha ikonkalar — emoji o'rniga SVG (har qanday telefonda bir xil ko'rinadi).
 * 24×24, chiziqli; rangi matn rangidan (currentColor). O'lchami: className="size-6" (standart size-5).
 */
export type IconProps = SVGProps<SVGSVGElement>;
export type Icon = (props: IconProps) => ReactElement;

function Svg({ className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className ?? "size-5"}`}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Joylashuv */
export const MapPinIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M12 21c-3.5-3.6-7-7.3-7-11a7 7 0 0 1 14 0c0 3.7-3.5 7.4-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);

/** Ish vaqti */
export const ClockIcon: Icon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

/** Ketishni belgilash */
export const FlagIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h12l-2.5 4.5L17 13H5" />
  </Svg>
);

/** Kamera */
export const CameraIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M3 9a2 2 0 0 1 2-2h2l1.5-2.5h7L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

/** Talaba rasmi yo'q bo'lsa */
export const GraduationCapIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M2 9.5 12 5l10 4.5L12 14z" />
    <path d="M6 11.3V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.7" />
    <path d="M22 9.5V15" />
  </Svg>
);

/** Orqaga */
export const ArrowLeftIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

/** Muvaffaqiyat: joyida / kechikdi */
export const CheckIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

/** Joydan uzoq / rad etildi */
export const XIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

/** Tekshiruvda / noma'lum */
export const QuestionIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M9 9.5a3 3 0 1 1 4.2 2.75c-.75.35-1.2 1.05-1.2 1.85V15" />
    <path d="M12 18.5h.01" />
  </Svg>
);

/** Yuz tekshiruvi (qayta suratga olish kerak) */
export const ScanFaceIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M3 8V6a3 3 0 0 1 3-3h2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2" />
    <path d="M9 9.5v1M15 9.5v1" />
    <path d="M9 15c1.7 1.3 4.3 1.3 6 0" />
  </Svg>
);

/** Qabul qilinmadi / yuborilmadi */
export const AlertIcon: Icon = (p) => (
  <Svg {...p}>
    <path d="M12 6v8" />
    <path d="M12 18.5h.01" />
  </Svg>
);
