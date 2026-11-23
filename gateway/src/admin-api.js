import { config } from "./config.js";

/**
 * Admin sayt API si (amaliyot joylari, davomat qarori shu yerda).
 * Har bir so'rovda X-API-KEY. Xato: { "error": "matn" } + HTTP kod.
 *
 *   POST /api/bot/link     { hemisId, telegramId }               -> { ok, fullName, group }
 *   GET  /api/bot/today?telegramId=                             -> { location, address, radiusM, workStart, workEnd }
 *   POST /api/bot/checkin  multipart: telegramId, lat, lng, accuracy, sentAt, type, photo
 *                                                               -> { id, status, distanceM, radiusM, location, notes }
 *
 * Har bir chaqiruv natijasi: { ok, httpStatus, data, error, body, ms }
 *   ok=false va httpStatus=null — API ga ulanib bo'lmadi / vaqt tugadi
 */

/** Admin API qaytaradigan davomat statuslari */
export const CHECKIN_STATUSES = ["PRESENT", "LATE", "OUT_OF_RANGE", "SUSPICIOUS", "REJECTED"];

async function call(method, path, body) {
  const started = Date.now();
  const headers = { "X-API-KEY": config.adminApiKey, accept: "application/json" };
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${config.adminApiUrl}${path}`, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(config.adminApiTimeoutMs),
    });
  } catch (e) {
    return {
      ok: false,
      httpStatus: null,
      data: null,
      body: null,
      ms: Date.now() - started,
      error:
        e.name === "TimeoutError"
          ? `Admin API ${config.adminApiTimeoutMs / 1000} soniyada javob bermadi`
          : `Admin API ga ulanib bo'lmadi: ${e.cause?.code ?? e.cause?.errors?.[0]?.code ?? e.cause?.message ?? e.message}`,
    };
  }
  const text = (await res.text().catch(() => "")).slice(0, 4000);
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // JSON emas
  }
  const ms = Date.now() - started;
  if (!res.ok) {
    const msg = typeof data?.error === "string" && data.error ? data.error : `Admin API xatosi: HTTP ${res.status}`;
    return { ok: false, httpStatus: res.status, data, body: text, ms, error: msg };
  }
  if (data === null) return { ok: false, httpStatus: res.status, data, body: text, ms, error: "Admin API javobi JSON emas" };
  return { ok: true, httpStatus: res.status, data, body: text, ms, error: null };
}

/** Talabani Telegram akkauntiga bog'lash (bir marta) */
export function linkStudent(hemisId, telegramId) {
  return call("POST", "/api/bot/link", { hemisId: String(hemisId), telegramId: Number(telegramId) });
}

/** Bugungi amaliyot joyi va ish vaqti */
export function todayTask(telegramId) {
  return call("GET", `/api/bot/today?telegramId=${encodeURIComponent(telegramId)}`);
}

/**
 * Davomat (kelish yoki ketish)
 * @param {{ telegramId: number, lat: number, lng: number, accuracy: number|null, sentAt: number,
 *           type: "CHECK_IN"|"CHECK_OUT", photo: { buf: Buffer, type: string }, hemisPhoto?: { buf: Buffer, type: string } | null }} a
 */
export function sendCheckin(a) {
  const f = new FormData();
  f.set("telegramId", String(a.telegramId));
  f.set("lat", String(a.lat));
  f.set("lng", String(a.lng));
  if (a.accuracy != null) f.set("accuracy", String(a.accuracy));
  f.set("sentAt", String(a.sentAt));
  f.set("type", a.type);
  const ext = (t) => (t === "jpeg" ? "jpg" : t);
  f.set("photo", new Blob([a.photo.buf], { type: `image/${a.photo.type}` }), `selfie.${ext(a.photo.type)}`);
  // Hujjatda yo'q maydon: faqat ADMIN_API_SEND_HEMIS_PHOTO=true bo'lsa yuboriladi
  if (a.hemisPhoto) {
    f.set("hemisPhoto", new Blob([a.hemisPhoto.buf], { type: `image/${a.hemisPhoto.type}` }), `hemis.${ext(a.hemisPhoto.type)}`);
  }
  return call("POST", "/api/bot/checkin", f);
}
