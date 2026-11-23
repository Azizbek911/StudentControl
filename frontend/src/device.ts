import { tg } from "./telegram";

/**
 * Qurilma ID si: birinchi ochilganda tasodifiy yaratiladi va saqlanadi.
 * Qayerda saqlanadi (birinchisidan boshlab o'qiladi):
 *   1) Telegram SecureStorage — telefonning Keychain/Keystore'i; sayt manzili o'zgarsa ham, kesh tozalansa ham qoladi
 *   2) Telegram DeviceStorage — shu bot uchun qurilma xotirasi
 *   3) localStorage — eski Telegram versiyalari uchun
 * Topilgan ID qolgan joylarga ham yozib qo'yiladi.
 */
const KEY = "sc_device_id";
const TIMEOUT_MS = 3000;

let cached: string | null = null;

const storageSupported = () => Boolean(tg?.isVersionAtLeast?.("9.0"));

/** Telegram callback API sini Promise ga o'raydi; javob kelmasa — fallback */
function call<T>(fn: (done: (v: T) => void) => void, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), TIMEOUT_MS);
    const done = (v: T) => {
      clearTimeout(timer);
      resolve(v);
    };
    try {
      fn(done);
    } catch {
      done(fallback);
    }
  });
}

function secureGet(): Promise<string | null> {
  const ss = tg?.SecureStorage;
  if (!storageSupported() || !ss) return Promise.resolve(null);
  return call<string | null>(
    (done) =>
      ss.getItem(KEY, (err, value, canRestore) => {
        if (err) return done(null);
        if (value) return done(value);
        // Ilova qayta o'rnatilgan bo'lsa — foydalanuvchi ruxsati bilan tiklanadi
        if (canRestore) return ss.restoreItem(KEY, (e, v) => done(e ? null : (v ?? null)));
        done(null);
      }),
    null,
  );
}

function secureSet(value: string): Promise<boolean> {
  const ss = tg?.SecureStorage;
  if (!storageSupported() || !ss) return Promise.resolve(false);
  return call<boolean>((done) => ss.setItem(KEY, value, (err, ok) => done(!err && Boolean(ok))), false);
}

function deviceGet(): Promise<string | null> {
  const ds = tg?.DeviceStorage;
  if (!storageSupported() || !ds) return Promise.resolve(null);
  return call<string | null>((done) => ds.getItem(KEY, (err, value) => done(err ? null : (value ?? null))), null);
}

function deviceSet(value: string): Promise<boolean> {
  const ds = tg?.DeviceStorage;
  if (!storageSupported() || !ds) return Promise.resolve(false);
  return call<boolean>((done) => ds.setItem(KEY, value, (err, ok) => done(!err && Boolean(ok))), false);
}

function localGet(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function localSet(value: string) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // e'tiborsiz
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

const VALID = /^[A-Za-z0-9-]{16,64}$/;
const valid = (v: string | null): v is string => Boolean(v && VALID.test(v));

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const secure = await secureGet();
  const device = valid(secure) ? null : await deviceGet();
  const local = localGet();
  const id = [secure, device, local].find(valid) ?? newId();

  // Topilmagan joylarga yozib qo'yamiz — keyingi safar qaysi biri ishlasa ham ID bir xil bo'ladi
  await Promise.all([secure === id ? true : secureSet(id), device === id || secure === id ? true : deviceSet(id)]);
  if (local !== id) localSet(id);

  cached = id;
  return id;
}

/** api.ts uchun: getDeviceId() bir marta chaqirilgandan keyin */
export const currentDeviceId = () => cached;
