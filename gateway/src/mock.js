// Sinov uchun admin API (ADMIN_API_URL bo'sh bo'lsa). Hujjatdagi /api/bot/* ni xotirada taqlid qiladi.
// Tashqariga ochilmaydi: nginx faqat /api ni uzatadi, bu esa /mock/... da.
//
// Sinov qoidalari:
//   - hemisId "000" bilan tugasa -> 404 (amaliyot guruhida yo'q)
//   - amaliyot joyi: MOCK_LAT/MOCK_LNG, radius MOCK_RADIUS_M
//   - sentAt 120 soniyadan eski yoki aniqlik > 100 m -> SUSPICIOUS
//   - bir kunda bir marta CHECK_IN va bir marta CHECK_OUT (keyingisi 409)

import { config } from "./config.js";
import { fileOf, HttpError, readForm, readJson } from "./http.js";

const tgByHemis = new Map();
const hemisByTg = new Map();
const marks = new Set();
let nextId = 1;

const site = () => ({
  location: "JIZPI o'quv binosi (mock)",
  address: "Jizzax sh., Islom Karimov ko'chasi 4",
  radiusM: config.mock.radiusM,
  workStart: "08:00",
  workEnd: "18:00",
});

function distanceM(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

const fail = (status, error) => Object.assign(new HttpError(status, error), { mockError: true });

/** -> javob obyekti yoki undefined (yo'l topilmasa) */
export async function mockAdminApi(ctx) {
  if (!config.adminApiMock) throw new HttpError(404, "Topilmadi");
  if (ctx.req.headers["x-api-key"] !== "mock-key") throw fail(401, "API kalit noto'g'ri");
  const p = ctx.url.pathname.replace(/^\/mock/, "");

  if (ctx.req.method === "POST" && p === "/api/bot/link") {
    const { hemisId, telegramId } = await readJson(ctx.req);
    if (!hemisId || !telegramId) throw fail(400, "hemisId va telegramId kerak");
    if (String(hemisId).endsWith("000")) throw fail(404, "Talaba amaliyot guruhida topilmadi");
    const tg = Number(telegramId);
    if ((hemisByTg.has(tg) && hemisByTg.get(tg) !== String(hemisId)) || (tgByHemis.has(String(hemisId)) && tgByHemis.get(String(hemisId)) !== tg)) {
      throw fail(409, "Telegram akkaunt boshqa talabaga bog'langan");
    }
    tgByHemis.set(String(hemisId), tg);
    hemisByTg.set(tg, String(hemisId));
    return { ok: true, fullName: `Talaba ${hemisId}`, group: "G-101 (mock)" };
  }

  if (ctx.req.method === "GET" && p === "/api/bot/today") {
    if (!hemisByTg.has(Number(ctx.url.searchParams.get("telegramId")))) throw fail(404, "Talaba bog'lanmagan");
    return site();
  }

  if (ctx.req.method === "POST" && p === "/api/bot/checkin") {
    const f = await readForm(ctx.req, 20 * 1024 * 1024);
    const tg = Number(f.get("telegramId"));
    if (!hemisByTg.has(tg)) throw fail(404, "Talaba bog'lanmagan");
    const lat = Number(f.get("lat"));
    const lng = Number(f.get("lng"));
    const sentAt = Number(f.get("sentAt"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !sentAt) throw fail(400, "lat, lng, sentAt kerak");
    const type = f.get("type") === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";
    const key = `${tg}:${new Date().toLocaleDateString("sv-SE", { timeZone: config.timeZone })}:${type}`;
    if (marks.has(key)) throw fail(409, type === "CHECK_IN" ? "Bugun kelish allaqachon belgilangan" : "Bugun ketish allaqachon belgilangan");

    const s = site();
    const distance = Math.round(distanceM(lat, lng, config.mock.lat, config.mock.lng));
    const accuracy = Number(f.get("accuracy")) || null;
    const notes = [];
    if (!(await fileOf(f, "photo"))) notes.push("Selfie yuborilmagan");
    if (Date.now() / 1000 - sentAt > 120) notes.push("Lokatsiya eski (120 soniyadan ko'p)");
    if (accuracy && accuracy > 100) notes.push(`GPS aniqligi past (±${Math.round(accuracy)} m)`);
    let status = "PRESENT";
    if (distance > s.radiusM) {
      status = "OUT_OF_RANGE";
      notes.unshift(`Joydan ${distance} m uzoqdasiz`);
    } else if (notes.length) status = "SUSPICIOUS";
    if (status === "PRESENT" || status === "SUSPICIOUS") marks.add(key);
    return { id: nextId++, status, distanceM: distance, radiusM: s.radiusM, location: s.location, notes };
  }

  throw new HttpError(404, "Topilmadi");
}
