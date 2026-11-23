import crypto from "node:crypto";
import { config } from "./config.js";

/** Mini App initData haqiqatan Telegramdan kelganini tekshiradi -> user yoki null */
export function verifyInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > config.initDataMaxAge) return null;
  try {
    return JSON.parse(params.get("user") ?? "");
  } catch {
    return null;
  }
}

// ---- Kichik HS256 JWT ----
const b64url = (s) => Buffer.from(s).toString("base64url");
const hmac = (data) => crypto.createHmac("sha256", config.jwtSecret).update(data).digest("base64url");

/**
 * Bazada talaba saqlanmaydi: profil (HEMIS dan) token ichida imzolangan holda yuradi.
 * sub = HEMIS ichki ID, st = { number, login, fullName, shortName, group, specialty, image }
 */
export function signToken(sub, dev, typ, st) {
  const ttl = typ === "access" ? config.accessTtl : config.refreshTtl;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ sub, dev, typ, st, iat: now, exp: now + ttl }));
  return `${header}.${body}.${hmac(`${header}.${body}`)}`;
}

export function verifyToken(token, typ) {
  const [header, body, sig] = String(token ?? "").split(".");
  if (!header || !body || !sig) return null;
  const expected = hmac(`${header}.${body}`);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (p.typ !== typ || !p.sub || !p.dev || !p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
  return p;
}

export function issueTokens(student, deviceId) {
  return {
    accessToken: signToken(student.id, deviceId, "access", student),
    refreshToken: signToken(student.id, deviceId, "refresh", student),
    expiresIn: config.accessTtl,
  };
}

const DEVICE_ID = /^[A-Za-z0-9-]{16,64}$/;
export const deviceIdOf = (req) => {
  const id = String(req.headers["x-device-id"] ?? "");
  return DEVICE_ID.test(id) ? id : null;
};

export const MOBILE_PLATFORMS = ["android", "android_x", "ios"];

/**
 * Mini App qaysi Telegram ilovasida ochilgan. Android WebView har bir so'rovga
 * X-Requested-With: <ilova paket nomi> qo'shadi: rasmiy Telegram — org.telegram.messenger,
 * Plus Messenger — org.telegram.plus va hokazo. iOS da bu sarlavha yo'q, u yerda ilovani ajratib bo'lmaydi.
 * -> { ok, app }  (app: paket nomi yoki null)
 */
export function telegramClient(req) {
  const app = String(req.headers["x-requested-with"] ?? "").trim() || null;
  if (app) return { ok: config.officialApps.includes(app.toLowerCase()), app };
  const platform = String(req.headers["x-tg-platform"] ?? "");
  return { ok: platform === "ios" || !config.clientStrict, app: null };
}

/** Telefon nomi User-Agent dan */
export function deviceName(ua = "") {
  const tg = ua.match(/Telegram-Android\/[\d.]+ \(([^;]+); Android ([\d.]+)/);
  if (tg) return `${tg[1].trim()} (Android ${tg[2]})`;
  const android = ua.match(/Android ([\d.]+);(?: [a-z]{2}[-_][A-Z]{2};)? ([^;)]+?)(?: Build\/|\))/);
  if (android) return `${android[2].trim()} (Android ${android[1]})`;
  const ios = ua.match(/(iPhone|iPad).*?OS ([\d_]+)/);
  if (ios) return `${ios[1]} (iOS ${ios[2].replace(/_/g, ".")})`;
  return null;
}

/** Fayl haqiqatan rasmmi (JPEG / PNG / WebP) */
export function imageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}
