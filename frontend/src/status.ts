import { AlertIcon, CheckIcon, ClockIcon, QuestionIcon, XIcon, type Icon } from "./components/icons";
import type { CheckStatus, CheckType } from "./types";

/** Talabaga ko'rinadigan status nomlari, ranglari va SVG ikonkalari */
export const STATUS: Record<CheckStatus, { text: string; cls: string; icon: Icon }> = {
  present: { text: "Joyida", icon: CheckIcon, cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  late: { text: "Kechikdi", icon: CheckIcon, cls: "bg-amber-500/15 text-amber-700" },
  out_of_range: { text: "Joydan uzoq", icon: XIcon, cls: "bg-red-500/10 text-red-600" },
  suspicious: { text: "Tekshiruvda", icon: QuestionIcon, cls: "bg-amber-500/15 text-amber-700" },
  rejected: { text: "Rad etildi", icon: XIcon, cls: "bg-red-500/10 text-red-600" },
  refused: { text: "Qabul qilinmadi", icon: AlertIcon, cls: "bg-tg-hint/15 text-tg-hint" },
  api_error: { text: "Yuborilmadi", icon: AlertIcon, cls: "bg-tg-hint/15 text-tg-hint" },
  unknown: { text: "Noma'lum", icon: QuestionIcon, cls: "bg-tg-hint/15 text-tg-hint" },
  pending: { text: "Yuborilmoqda", icon: ClockIcon, cls: "bg-tg-hint/15 text-tg-hint" },
};

export const TYPE_LABEL: Record<CheckType, string> = { CHECK_IN: "Kelish", CHECK_OUT: "Ketish" };
