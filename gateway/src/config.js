import crypto from "node:crypto";

try {
  process.loadEnvFile();
} catch {
  // .env yo'q — Docker muhit o'zgaruvchilari
}

const env = process.env;
const botToken = env.BOT_TOKEN ?? "";
const port = Number(env.PORT ?? 3000);

export const config = {
  port,
  botToken,
  databaseUrl: env.DATABASE_URL ?? "",
  hemisUrl: (env.HEMIS_URL ?? "https://student.jizpi.uz/rest/v1").replace(/\/$/, ""),

  // ---- Admin sayt API si: talabani bog'lash, bugungi joy, davomat qarori ----
  /** Base URL (masalan https://admin.misol.uz). Bo'sh bo'lsa — sinov uchun ichki "mock" API */
  // "10.1.20.21:8080" kabi yozilsa ham ishlaydi — http:// o'zi qo'shiladi
  adminApiUrl: (env.ADMIN_API_URL
    ? /^https?:\/\//i.test(env.ADMIN_API_URL.trim())
      ? env.ADMIN_API_URL.trim()
      : `http://${env.ADMIN_API_URL.trim()}`
    : `http://127.0.0.1:${port}/mock`
  ).replace(/\/+$/, ""),
  adminApiMock: !env.ADMIN_API_URL,
  /** X-API-KEY (admin beradi) */
  adminApiKey: env.ADMIN_API_KEY || (env.ADMIN_API_URL ? "" : "mock-key"),
  adminApiTimeoutMs: Number(env.ADMIN_API_TIMEOUT ?? 30) * 1000,
  /** /link ga qaysi ID yuboriladi: student_id_number (12 xonali talaba ID, HEMIS login — standart) | id (HEMIS ichki ID) */
  adminLinkIdField: env.ADMIN_LINK_ID === "id" ? "id" : "student_id_number",
  /** Hujjatda yo'q: true bo'lsa /checkin ga HEMIS rasmi ham "hemisPhoto" maydonida yuboriladi */
  adminSendHemisPhoto: env.ADMIN_API_SEND_HEMIS_PHOTO === "true",
  /** Talaba ketma-ket ikki so'rov orasida kamida shuncha soniya kutadi */
  checkCooldownSec: Number(env.CHECK_COOLDOWN ?? 30),

  // Mock API (faqat ADMIN_API_URL bo'sh bo'lsa): amaliyot joyi shu nuqta, radius ichida -> PRESENT
  mock: {
    lat: Number(env.MOCK_LAT ?? 40.13),
    lng: Number(env.MOCK_LNG ?? 67.836),
    radiusM: Number(env.MOCK_RADIUS_M ?? 300),
  },

  /** Developerlar: Telegram ID lar (vergul bilan). Faqat loglarni ko'radi */
  developerIds: (env.DEVELOPER_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0),

  /**
   * Faqat rasmiy Telegram ilovalari (Android WebView X-Requested-With da yuboradigan paket nomi).
   * Plus Messenger (org.telegram.plus), Nekogram va boshqa norasmiy ilovalar ro'yxatda yo'q — bloklanadi
   */
  officialApps: (env.TG_OFFICIAL_APPS || "org.telegram.messenger,org.telegram.messenger.web,org.telegram.messenger.beta,org.thunderdog.challegram")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** true: Android da ilova nomi (X-Requested-With) kelmasa ham bloklanadi (eski WebView). iOS da bu sarlavha hech qachon bo'lmaydi */
  clientStrict: env.TG_CLIENT_STRICT === "true",

  // ---- Yuz tekshiruvi (face servisi: OpenCV YuNet + SFace) — selfi HEMIS rasmiga solishtiriladi ----
  /** face servisi manzili (Docker: http://face:8000). Bo'sh bo'lsa — yuz tekshiruvi o'chiq */
  faceUrl: (env.FACE_URL ?? "").trim().replace(/\/+$/, ""),
  /**
   * block — selfida yuz bo'lmasa yoki HEMIS rasmiga mos kelmasa, talaba qayta suratga oladi (admin saytga yuborilmaydi)
   * log   — faqat logga yoziladi, davomat baribir yuboriladi
   * off   — o'chiq
   */
  faceMode: ["block", "log", "off"].includes(env.FACE_MODE) ? env.FACE_MODE : "block",
  /** Kosinus o'xshashlik chegarasi: shundan past — boshqa odam (OpenCV tavsiyasi: 0.363) */
  faceThreshold: Number(env.FACE_THRESHOLD ?? 0.363),
  faceTimeoutMs: Number(env.FACE_TIMEOUT ?? 20) * 1000,

  logRetentionDays: Number(env.LOG_RETENTION_DAYS ?? 90),
  initDataMaxAge: 24 * 60 * 60,
  jwtSecret: env.JWT_SECRET || crypto.createHash("sha256").update(`v2-jwt:${botToken}`).digest("hex"),
  accessTtl: 15 * 60,
  refreshTtl: 30 * 24 * 60 * 60,
  timeZone: "Asia/Tashkent",
};

try {
  new URL(config.adminApiUrl);
} catch {
  console.error(`ADMIN_API_URL noto'g'ri: "${env.ADMIN_API_URL}". Masalan: http://10.1.20.21:8080`);
  process.exit(1);
}

for (const [key, value] of [
  ["BOT_TOKEN", config.botToken],
  ["DATABASE_URL", config.databaseUrl],
  ["ADMIN_API_KEY", config.adminApiKey],
]) {
  if (!value) {
    console.error(`${key} yozilmagan (v2/.env)`);
    process.exit(1);
  }
}
