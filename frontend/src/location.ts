import { tg } from "./telegram";

export interface Position {
  latitude: number;
  longitude: number;
  /** GPS aniqligi, metr */
  accuracy: number;
}

export class LocationError extends Error {
  constructor(message: string, public canOpenSettings = false) {
    super(message);
  }
}

// Telegram aniqlikni bermasa — o'rtacha qiymat
const UNKNOWN_ACCURACY = 100;

const INIT_TIMEOUT_MS = 5_000;
const LOCATE_TIMEOUT_MS = 30_000;

/** Telegram LocationManager ishga tushadimi (javob bermasa — null, oddiy geolokatsiyaga o'tiladi) */
function initTelegram(): Promise<boolean> {
  const lm = tg?.LocationManager;
  if (!lm || !tg?.isVersionAtLeast?.("8.0")) return Promise.resolve(false);
  if (lm.isInited) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), INIT_TIMEOUT_MS);
    lm.init(() => {
      clearTimeout(timer);
      resolve(lm.isInited);
    });
  });
}

/** Telegram LocationManager (Bot API 8.0+): ruxsatni Telegram o'zi so'raydi */
function viaTelegram(): Promise<Position> {
  const lm = tg!.LocationManager!;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new LocationError("Joylashuvni aniqlash uzoq davom etdi. Ochiq joyga chiqib qayta urinib ko'ring.")),
      LOCATE_TIMEOUT_MS,
    );
    const done = <T,>(fn: (v: T) => void) => (v: T) => {
      clearTimeout(timer);
      fn(v);
    };
    resolve = done(resolve);
    reject = done(reject);
    const get = () => {
      if (!lm.isLocationAvailable) {
        return reject(new LocationError("Telefoningizda joylashuv xizmati mavjud emas yoki o'chirilgan."));
      }
      lm.getLocation((d) => {
        if (d) {
          return resolve({
            latitude: d.latitude,
            longitude: d.longitude,
            accuracy: d.horizontal_accuracy ?? UNKNOWN_ACCURACY,
          });
        }
        const denied = lm.isAccessRequested && !lm.isAccessGranted;
        reject(
          new LocationError(
            denied
              ? "Joylashuvga ruxsat berilmagan. Sozlamalarda ruxsat bering va qayta urinib ko'ring."
              : "Joylashuvni aniqlab bo'lmadi. Telefonda GPS yoqilganini tekshiring.",
            denied,
          ),
        );
      });
    };
    get();
  });
}

/** Oddiy brauzer geolokatsiyasi (eski Telegram versiyalari uchun) */
function viaBrowser(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new LocationError("Joylashuvni aniqlash qo'llab-quvvatlanmaydi."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new LocationError(
            e.code === e.PERMISSION_DENIED
              ? "Joylashuvga ruxsat berilmagan. Telefon sozlamalarida Telegram uchun joylashuvni yoqing."
              : e.code === e.TIMEOUT
                ? "Joylashuvni aniqlash uzoq davom etdi. Ochiq joyga chiqib qayta urinib ko'ring."
                : "Joylashuvni aniqlab bo'lmadi. GPS yoqilganini tekshiring.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

export async function getLocation(): Promise<Position> {
  return (await initTelegram()) ? viaTelegram() : viaBrowser();
}

export function openLocationSettings() {
  tg?.LocationManager?.openSettings();
}

// Juda yomon GPS (masalan 1 km) — foydalanuvchiga ogohlantirish (yuborishni to'xtatmaydi, qarorni API qiladi)
export const POOR_ACCURACY = 150;
