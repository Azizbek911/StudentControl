// Telegram WebApp SDK (index.html dagi telegram-web-app.js) uchun minimal tiplar
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramLocation {
  latitude: number;
  longitude: number;
  horizontal_accuracy: number | null;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  platform: string;
  version: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast?(version: string): boolean;
  /** Bot API 8.0+: Telegram orqali joylashuv (ruxsatni Telegram o'zi so'raydi) */
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessRequested: boolean;
    isAccessGranted: boolean;
    init(cb?: () => void): void;
    getLocation(cb: (data: TelegramLocation | null) => void): void;
    openSettings(): void;
  };
  /** Bot API 9.0+: telefonning xavfsiz xotirasi (Keychain / Keystore) */
  SecureStorage?: {
    setItem(key: string, value: string, cb?: (err: string | null, stored?: boolean) => void): void;
    getItem(key: string, cb: (err: string | null, value?: string | null, canRestore?: boolean) => void): void;
    restoreItem(key: string, cb?: (err: string | null, value?: string | null) => void): void;
  };
  /** Bot API 9.0+: qurilmadagi oddiy xotira (shu bot uchun) */
  DeviceStorage?: {
    setItem(key: string, value: string, cb?: (err: string | null, stored?: boolean) => void): void;
    getItem(key: string, cb: (err: string | null, value?: string | null) => void): void;
  };
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  /** t.me havolasini Telegram ichida ochish (bot chati) */
  openTelegramLink?(url: string): void;
  /** Tashqi havolani brauzerda ochish */
  openLink?(url: string): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg = window.Telegram?.WebApp;

// Ruxsat berilgan platformalar: faqat telefondagi Telegram ilovalari.
// Bloklanadi: tdesktop, macos, web, weba, webk, unknown ...
export const MOBILE_PLATFORMS = ["android", "android_x", "ios"];

export const isInTelegram = () => Boolean(tg?.initData);
export const isMobilePlatform = () => MOBILE_PLATFORMS.includes(tg?.platform ?? "");

/** Tashqi havola (brauzerda): Telegram'ning openLink, bo'lmasa window.open */
export function openExternal(url: string) {
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener");
}

/** Tasdiqlash oynasi: Telegram'ning o'zinikini (6.2+), bo'lmasa brauzernikini ishlatadi */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg?.showConfirm && tg.isVersionAtLeast?.("6.2")) tg.showConfirm(message, (ok) => resolve(ok));
    else resolve(window.confirm(message));
  });
}
