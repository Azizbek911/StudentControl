// StudentControl v2 — gateway
//
// Hech narsa saqlamaydi (faqat LOGLAR). Hamma ma'lumot umumiy (admin sayt) API da:
//   1) Login: HEMIS login/parol -> /account/me -> admin API POST /api/bot/link { hemisId, telegramId }
//      Talaba profili bazaga yozilmaydi — imzolangan token ichida yuradi. Parol saqlanmaydi.
//   2) Bosh sahifa: admin API GET /api/bot/today
//   3) Davomat: joylashuv + selfi -> yuz tekshiruvi (face servisi, selfi HEMIS rasmiga solishtiriladi)
//      -> admin API POST /api/bot/checkin (selfi diskka yozilmaydi)
//   4) Har bir voqea logs jadvaliga -> developer Mini App da ko'radi
//
// Admin sayt javob bermasa talabaga xato matni ko'rsatilmaydi: /today -> { retry: true },
// /check -> 502 + code "api_unavailable". Ilova "Yuklanmoqda" animatsiyasini ko'rsatib, o'zi qayta so'raydi.

import http from "node:http";
import { linkStudent, sendCheckin, todayTask } from "./admin-api.js";
import { config } from "./config.js";
import { migrate, one, q } from "./db.js";
import { checkFace, faceEnabled, warmFace } from "./face.js";
import { hemisLogin, hemisMe, hemisPhoto, profileFromHemis } from "./hemis.js";
import { clientIp, fileOf, HttpError, readForm, readJson, sendJson } from "./http.js";
import { log } from "./log.js";
import { mockAdminApi } from "./mock.js";
import { deviceIdOf, deviceName, imageType, issueTokens, MOBILE_PLATFORMS, telegramClient, verifyInitData, verifyToken } from "./security.js";

const MAX_PHOTO = 8 * 1024 * 1024;
const apiName = () => (config.adminApiMock ? "mock" : new URL(config.adminApiUrl).host);
/** Admin API qaroriga ega davomat loglari (talabaning "Bugun" ro'yxati shulardan) */
const RESULT_STATUSES = ["present", "late", "out_of_range", "suspicious", "rejected", "refused"];
const STATUS_OF = { PRESENT: "present", LATE: "late", OUT_OF_RANGE: "out_of_range", SUSPICIOUS: "suspicious", REJECTED: "rejected" };

// ---------------- Yordamchilar ----------------

const tgUserOf = (req) => verifyInitData(String(req.headers["x-tg-init-data"] ?? ""));

const timeOf = (d) =>
  new Date(d).toLocaleTimeString("uz-UZ", { timeZone: config.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });

/** Bearer token + X-Device-Id -> talaba profili (tokendan; aks holda 401) */
function studentAuth(ctx) {
  const token = String(ctx.req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const p = verifyToken(token, "access");
  const dev = deviceIdOf(ctx.req);
  if (!p?.st || !dev || p.dev !== dev) throw new HttpError(401, "Qayta kiring");
  return p.st;
}

/** Telegram ID faqat imzolangan initData dan (talaba yozgan qiymatdan emas) */
function requireTelegram(ctx) {
  const tg = tgUserOf(ctx.req);
  if (!tg?.id) throw new HttpError(401, "Ilovani Telegram bot ichidan qayta oching");
  return Number(tg.id);
}

/** Developer: Telegram initData + DEVELOPER_IDS (aks holda 403) */
function developerAuth(ctx) {
  const u = tgUserOf(ctx.req);
  if (!u || !config.developerIds.includes(Number(u.id))) throw new HttpError(403, "Faqat developer uchun");
  return u;
}

const UNOFFICIAL_TEXT =
  "Ilova faqat rasmiy Telegram orqali ishlaydi. Telegram'ni Google Play yoki App Store'dan o'rnatib, botni o'sha yerda oching.";

/** Norasmiy Telegram ilovasidan (Plus Messenger va h.k.) kirish urinishi — logga */
function logUnofficial(ctx, c) {
  const ua = String(ctx.req.headers["user-agent"] ?? "");
  return log({
    level: "warn",
    kind: "auth",
    status: "unofficial_client",
    telegramId: tgUserOf(ctx.req)?.id ?? null,
    ip: ctx.ip,
    message: `${ctx.url.pathname}: ${c.app ?? "ilova nomi kelmadi"}`,
    details: {
      app: c.app,
      platform: String(ctx.req.headers["x-tg-platform"] ?? "") || null,
      device: deviceName(ua),
      ua: ua.slice(0, 300),
    },
  });
}

/** Talaba so'rovlari faqat rasmiy Telegram ilovasidan (aks holda 403, code: unofficial_client) */
async function requireOfficialClient(ctx) {
  const c = telegramClient(ctx.req);
  ctx.client = c;
  if (c.ok) return;
  await logUnofficial(ctx, c);
  throw new HttpError(403, UNOFFICIAL_TEXT, { code: "unofficial_client" });
}

/** Talabaga yuz tekshiruvi natijasi (FACE_MODE=block): qayta suratga olish kerak */
const FACE_TEXT = {
  no_face: "Rasmda yuzingiz aniqlanmadi. Yorug' joyda, yuzingizni ovalga to'g'rilab qayta suratga oling.",
  face_mismatch:
    "Rasmdagi yuz HEMIS dagi rasmingizga mos kelmadi. Ko'zoynak va niqobsiz, yorug' joyda, kameraga to'g'ri qarab qayta suratga oling.",
};

const who = (st, telegramId, ip) => ({ studentId: st.id, studentName: st.fullName ?? st.login, telegramId, ip });
const short = (r) => ({ httpStatus: r.httpStatus, response: r.body?.slice(0, 500) ?? null, ms: r.ms });

/** Admin API ga yuboriladigan HEMIS ID lar: avval ADMIN_LINK_ID dagisi, 404 bo'lsa — ikkinchisi */
function linkIdsOf(st) {
  const number = String(st.number || st.login);
  const internal = String(st.id);
  return [...new Set(config.adminLinkIdField === "id" ? [internal, number] : [number, internal])];
}

/**
 * Admin saytga bog'lash: POST /api/bot/link.
 * -> { ok: true, fullName?, group? } | { ok: false, status, error, transient }
 */
async function link(st, telegramId, base) {
  let r;
  let hemisId;
  for (const id of linkIdsOf(st)) {
    hemisId = id;
    r = await linkStudent(id, telegramId);
    if (r.httpStatus !== 404) break; // topildi yoki boshqa xato — ikkinchi ID ni sinash shart emas
  }
  const details = { hemisId, ...short(r) };

  if (r.ok) {
    await log({ ...base, kind: "link", status: "ok", message: `${r.data.fullName ?? "?"} · ${r.data.group ?? "?"}`, details });
    return { ok: true, fullName: r.data.fullName ?? null, group: r.data.group ?? null };
  }
  if (r.httpStatus === 409) {
    // Ehtimol oldin aynan shu akkauntga bog'langan: /today 404 bermasa — bog'langan
    const t = await todayTask(telegramId);
    if (t.ok || t.httpStatus === 409) {
      await log({ ...base, kind: "link", status: "already", message: "Oldin bog'langan", details });
      return { ok: true };
    }
    await log({ ...base, level: "warn", kind: "link", status: "conflict", message: r.error, details });
    return { ok: false, status: 409, error: r.error };
  }
  if (r.httpStatus === 404 || r.httpStatus === 400) {
    await log({ ...base, level: "warn", kind: "link", status: "not_found", message: r.error, details });
    return { ok: false, status: 403, error: r.error };
  }
  await log({
    ...base,
    level: "error",
    kind: "link",
    status: "api_error",
    message: r.httpStatus === 401 ? `${r.error} — ADMIN_API_KEY ni tekshiring` : r.error,
    details,
  });
  return { ok: false, status: 502, error: "Admin sayt vaqtincha javob bermayapti. Birozdan keyin urinib ko'ring.", transient: true };
}

// ---------------- Umumiy ----------------

async function health() {
  await q("SELECT 1");
  return { ok: true, api: apiName(), face: faceEnabled() ? config.faceMode : "off" };
}

/** Ilova ochilganda: developer yoki talaba */
async function role(ctx) {
  const u = tgUserOf(ctx.req);
  const developer = Boolean(u && config.developerIds.includes(Number(u.id)));
  if (developer) return { role: "developer", name: u.first_name ?? null };
  // Talaba norasmiy Telegramda bo'lsa — ilova kirish o'rniga to'xtatish ekranini ko'rsatadi
  const c = telegramClient(ctx.req);
  if (!c.ok && c.app) await logUnofficial(ctx, c);
  return { role: "student", name: u?.first_name ?? null, client: { ok: c.ok, app: c.app } };
}

// ---------------- Talaba: kirish ----------------

async function login(ctx) {
  const { req, ip } = ctx;
  const tg = tgUserOf(req);
  if (!tg) {
    await log({ level: "warn", kind: "auth", status: "not_telegram", message: "Login: initData yo'q yoki noto'g'ri", ip });
    throw new HttpError(401, "Ilovani Telegram bot ichidan oching");
  }
  const platform = String(req.headers["x-tg-platform"] ?? "");
  if (!MOBILE_PLATFORMS.includes(platform)) {
    await log({ level: "warn", kind: "login", status: "not_mobile", telegramId: tg.id, ip, message: `Platforma: ${platform || "?"}` });
    throw new HttpError(403, "Ilova faqat telefondagi Telegram orqali ishlaydi");
  }
  const body = await readJson(req);
  const loginStr = String(body.login ?? "").trim();
  const password = String(body.password ?? "");
  if (!loginStr || !password || loginStr.length > 32 || password.length > 128) throw new HttpError(400, "Login va parolni kiriting");
  const deviceId = deviceIdOf(req);
  if (!deviceId) throw new HttpError(400, "Qurilmani aniqlab bo'lmadi. Ilovani qayta oching.");
  const base = {
    telegramId: tg.id,
    ip,
    details: { login: loginStr, device: deviceName(req.headers["user-agent"]), client: ctx.client?.app ?? null },
  };

  // 1) HEMIS (parol hech qayerda saqlanmaydi)
  let st;
  try {
    st = profileFromHemis(await hemisMe(await hemisLogin(loginStr, password)), loginStr);
  } catch (e) {
    const wrong = e instanceof HttpError && e.status === 401;
    await log({ ...base, level: wrong ? "warn" : "error", kind: "login", status: wrong ? "wrong_password" : "hemis_down", message: e.message });
    throw e;
  }

  // 2) Admin saytga bog'lash. API vaqtincha ishlamasa — kirishga ruxsat, keyinroq qayta bog'lanadi
  const b = { ...base, ...who(st, tg.id, ip) };
  const l = await link(st, Number(tg.id), b);
  if (!l.ok && !l.transient) throw new HttpError(l.status, l.error);
  if (l.group) st.group = l.group; // admin saytdagi guruh nomi

  warmFace(st.image); // HEMIS rasmidagi yuz belgisi oldindan (birinchi davomat tezroq bo'lsin)
  await log({ ...b, kind: "login", status: "ok", message: st.fullName });
  return { ...issueTokens(st, deviceId), student: st };
}

async function refresh(ctx) {
  const body = await readJson(ctx.req);
  const p = verifyToken(body.refreshToken, "refresh");
  const dev = deviceIdOf(ctx.req);
  if (!p?.st || !dev || p.dev !== dev) throw new HttpError(401, "Qayta kiring");
  return issueTokens(p.st, dev);
}

async function me(ctx) {
  return studentAuth(ctx);
}

// ---------------- Talaba: bugun ----------------

/**
 * GET /api/today -> { task | null, message | null, retry?, checks } — vazifa admin API dan, ro'yxat loglardan.
 * retry: true — admin sayt javob bermadi; ilova "Yuklanmoqda" ko'rsatib, birozdan keyin qayta so'raydi
 */
async function today(ctx) {
  const st = studentAuth(ctx);
  const telegramId = requireTelegram(ctx);
  const base = who(st, telegramId, ctx.ip);
  const checks = await todayChecks(st.id);
  const retry = { task: null, message: null, retry: true, checks };

  let t = await todayTask(telegramId);
  if (t.httpStatus === 404) {
    // Admin saytda bog'lanmagan (yoki bog'lanish o'chirilgan) — bog'lab, qayta so'raymiz
    const l = await link(st, telegramId, base);
    if (!l.ok) return l.transient ? retry : { task: null, message: l.error, checks };
    t = await todayTask(telegramId);
  }
  if (t.ok) return { task: t.data, message: null, checks };
  if (t.httpStatus === 409 || t.httpStatus === 404) return { task: null, message: t.error, checks };
  await log({ ...base, level: "error", kind: "today", status: "api_error", message: t.error, details: short(t) });
  return retry;
}

async function todayChecks(studentId) {
  const rows = await q(
    `SELECT id, created_at, status, details FROM logs
     WHERE kind = 'check' AND student_id = $1 AND status = ANY($3)
       AND created_at >= (date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)
     ORDER BY id DESC LIMIT 20`,
    [studentId, config.timeZone, RESULT_STATUSES],
  );
  return rows.map((r) => ({
    id: r.id,
    time: timeOf(r.created_at),
    status: r.status,
    type: r.details?.type ?? "CHECK_IN",
    distanceM: r.details?.distanceM ?? null,
    notes: r.details?.notes ?? [],
  }));
}

// ---------------- Talaba: davomat ----------------

const lastCheck = new Map(); // HEMIS ID -> vaqt (ms); faqat xotirada
/** Davomat yozilmadi (yuz mos emas / admin sayt javob bermadi) — to'liq kutish shart emas, 5 soniya yetarli */
const softCooldown = (id) => lastCheck.set(id, Date.now() - Math.max(0, config.checkCooldownSec - 5) * 1000);

/** POST /api/check (multipart: type, latitude, longitude, accuracy, locatedAt, selfie) -> admin API /checkin */
async function check(ctx) {
  const st = studentAuth(ctx);
  const telegramId = requireTelegram(ctx);
  const base = { kind: "check", ...who(st, telegramId, ctx.ip) };

  const wait = config.checkCooldownSec - Math.floor((Date.now() - (lastCheck.get(st.id) ?? 0)) / 1000);
  if (wait > 0) {
    await log({ ...base, level: "warn", status: "too_often", message: `${wait} s kutish kerak` });
    throw new HttpError(429, `Juda tez. ${wait} soniyadan keyin qayta urinib ko'ring.`);
  }

  const form = await readForm(ctx.req, MAX_PHOTO + 512 * 1024);
  const latitude = Number(form.get("latitude"));
  const longitude = Number(form.get("longitude"));
  const accuracy = Number(form.get("accuracy") ?? 0) || null;
  const type = form.get("type") === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";
  // Joylashuv aniqlangan vaqt (telefon soati). Kelajakda bo'lsa — hozirgi vaqt
  const nowSec = Math.floor(Date.now() / 1000);
  const locatedSec = Math.floor(Number(form.get("locatedAt")) / 1000);
  const sentAt = Number.isFinite(locatedSec) && locatedSec > 0 ? Math.min(locatedSec, nowSec) : nowSec;
  const selfie = await fileOf(form, "selfie");
  const selfieType = imageType(selfie);
  const problem =
    !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      ? "Joylashuv noto'g'ri"
      : !selfie
        ? "Old kamera rasmi yuborilmadi"
        : !selfieType || selfieType === "webp"
          ? "Rasm formati noto'g'ri (JPEG/PNG kerak)"
          : null;
  if (problem) {
    await log({ ...base, level: "warn", status: "bad_request", message: problem, details: { type, latitude, longitude, accuracy } });
    throw new HttpError(400, problem);
  }
  lastCheck.set(st.id, Date.now());

  // Yuz tekshiruvi: selfi HEMIS rasmiga solishtiriladi. Servis ishlamasa — davomat baribir yuboriladi
  const face = await checkFace(st.image, selfie);
  if (face.status === "error") {
    await log({ ...base, kind: "face", level: "error", status: "face_down", message: face.reason, details: { face } });
  }
  const faceProblem = face.status === "no_face" ? "no_face" : face.status === "mismatch" ? "face_mismatch" : null;
  if (faceProblem && config.faceMode === "block") {
    softCooldown(st.id);
    await log({
      ...base,
      level: "warn",
      status: faceProblem,
      message:
        faceProblem === "no_face"
          ? "Selfida yuz topilmadi — qayta suratga olish so'raldi"
          : `Yuz HEMIS rasmiga mos emas (${face.similarity} < ${face.threshold}) — qayta suratga olish so'raldi`,
      details: { type, latitude, longitude, accuracy, face, selfieBytes: selfie.length },
    });
    throw new HttpError(422, FACE_TEXT[faceProblem], { code: faceProblem });
  }

  // HEMIS rasmi — hujjatda yo'q maydon, faqat ADMIN_API_SEND_HEMIS_PHOTO=true bo'lsa (saqlanmaydi)
  let hemis = null;
  if (config.adminSendHemisPhoto) {
    try {
      hemis = await hemisPhoto(st.image);
    } catch (e) {
      await log({ ...base, level: "warn", status: "no_hemis_photo", message: e.message });
    }
  }

  const payload = { telegramId, lat: latitude, lng: longitude, accuracy, sentAt, type, photo: { buf: selfie, type: selfieType }, hemisPhoto: hemis };
  let r = await sendCheckin(payload);
  let linkDown = false;
  if (r.httpStatus === 404) {
    // Bog'lanmagan bo'lsa — bog'lab, bir marta qayta yuboramiz
    const l = await link(st, telegramId, base);
    if (l.ok) r = await sendCheckin(payload);
    else linkDown = Boolean(l.transient);
  }

  const d = r.ok ? r.data : null;
  const notes = Array.isArray(d?.notes) ? d.notes.map(String) : [];
  // refused = admin API rad etdi (bog'lanmagan, joy yo'q, bugun allaqachon belgilangan ...)
  const status = r.ok
    ? (STATUS_OF[String(d.status).toUpperCase()] ?? "unknown")
    : [400, 404, 409].includes(r.httpStatus) && !linkDown
      ? "refused"
      : "api_error";
  const inside = status === "present" || status === "late" ? true : status === "out_of_range" ? false : null;
  const level = status === "api_error" || status === "unknown" ? "error" : status === "present" || status === "late" ? "info" : "warn";
  const kindText = type === "CHECK_OUT" ? "Ketish" : "Kelish";
  // FACE_MODE=log: yuz muammosi davomatni to'xtatmaydi, faqat log matnida ko'rinadi
  const faceNote = faceProblem ? ` · yuz: ${faceProblem === "no_face" ? "topilmadi" : `mos emas (${face.similarity})`}` : "";

  await log({
    ...base,
    level: faceProblem && level === "info" ? "warn" : level,
    status,
    message:
      (r.ok
        ? `${kindText}: ${d.status}${d.distanceM != null ? ` · ${d.distanceM} m` : ""}${notes.length ? ` · ${notes.join("; ")}` : ""}`
        : r.httpStatus === 401
          ? `${r.error} — ADMIN_API_KEY ni tekshiring`
          : `${kindText}: ${r.error}`) + faceNote,
    details: {
      type,
      latitude,
      longitude,
      accuracy,
      sentAt,
      apiStatus: d?.status ?? null,
      distanceM: d?.distanceM ?? null,
      radiusM: d?.radiusM ?? null,
      location: d?.location ?? null,
      notes,
      remoteId: d?.id ?? null,
      api: apiName(),
      ...short(r),
      selfieBytes: selfie.length,
      hemisPhotoSent: Boolean(hemis),
      face: face.status === "off" ? null : face,
    },
  });

  if (status === "refused") throw new HttpError(409, r.error);
  if (status === "api_error") {
    // Davomat yozilmadi — ilova "Yuklanmoqda" ko'rsatib, o'zi qayta yuboradi (5 soniyadan keyin)
    softCooldown(st.id);
    throw new HttpError(502, "Yuklanmoqda", { code: "api_unavailable" });
  }
  return {
    type,
    status,
    inside,
    distanceM: d.distanceM ?? null,
    radiusM: d.radiusM ?? null,
    location: d.location ?? null,
    notes,
    time: timeOf(Date.now()),
  };
}

// ---------------- Developer: loglar ----------------

const LOG_COLUMNS = `id, created_at AS "createdAt", level, kind, status, message, student_id AS "studentId",
  student_name AS "studentName", telegram_id AS "telegramId", ip, details`;

/** GET /api/dev/logs?status=a,b&level=&kind=&q=&before=<id>&limit= */
async function devLogs(ctx) {
  developerAuth(ctx);
  const p = ctx.url.searchParams;
  const where = [];
  const args = [];
  const add = (sql, v) => {
    args.push(v);
    where.push(sql.replaceAll("?", `$${args.length}`));
  };
  const list = (name) => (p.get(name) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (list("status").length) add("status = ANY(?)", list("status"));
  if (list("level").length) add("level = ANY(?)", list("level"));
  if (list("kind").length) add("kind = ANY(?)", list("kind"));
  const text = (p.get("q") ?? "").trim();
  if (text) {
    if (/^\d+$/.test(text)) add("(student_id::text = ? OR telegram_id::text = ? OR details->>'hemisId' = ? OR details->>'login' = ?)", text);
    else add("(message ILIKE ? OR student_name ILIKE ?)", `%${text}%`);
  }
  const before = Number(p.get("before"));
  if (before > 0) add("id < ?", before);
  const limit = Math.min(200, Math.max(1, Number(p.get("limit")) || 50));

  const items = await q(`SELECT ${LOG_COLUMNS} FROM logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ${limit}`, args);
  // Oxirgi 24 soat: har bir status nechta (filtrlarsiz)
  const counts = await q(
    `SELECT kind, status, level, count(*)::int AS n FROM logs WHERE created_at > now() - interval '24 hours'
     GROUP BY kind, status, level ORDER BY n DESC`,
  );
  const totals = await one(
    `SELECT count(DISTINCT student_id)::int AS students,
            count(*) FILTER (WHERE kind = 'check' AND status = ANY($1))::int AS checks24h
     FROM logs WHERE created_at > now() - interval '24 hours'`,
    [RESULT_STATUSES],
  );
  return { items, counts, totals, api: apiName() };
}

async function devLog(ctx) {
  developerAuth(ctx);
  const item = await one(`SELECT ${LOG_COLUMNS} FROM logs WHERE id = $1`, [Number(ctx.params[0])]);
  if (!item) throw new HttpError(404, "Log topilmadi");
  return item;
}

// ---------------- Marshrutlar ----------------

/** Talaba marshrutlari: faqat rasmiy Telegram ilovasidan */
const STUDENT = { official: true };

const routes = [
  ["GET", /^\/api\/health$/, health],
  ["GET", /^\/api\/role$/, role],
  ["POST", /^\/api\/auth\/login$/, login, STUDENT],
  ["POST", /^\/api\/auth\/refresh$/, refresh, STUDENT],
  ["GET", /^\/api\/auth\/me$/, me, STUDENT],
  ["GET", /^\/api\/today$/, today, STUDENT],
  ["POST", /^\/api\/check$/, check, STUDENT],
  ["GET", /^\/api\/dev\/logs$/, devLogs],
  ["GET", /^\/api\/dev\/logs\/(\d+)$/, devLog],
  // Sinov uchun admin API (ADMIN_API_URL bo'sh bo'lsa)
  ["GET", /^\/mock\/api\/bot\//, mockAdminApi],
  ["POST", /^\/mock\/api\/bot\//, mockAdminApi],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://local");
  const ctx = { req, res, url, ip: clientIp(req), params: [] };
  try {
    const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
    if (!route) throw new HttpError(404, "Topilmadi");
    ctx.params = route[1].exec(url.pathname).slice(1);
    if (route[3]?.official) await requireOfficialClient(ctx);
    const data = await route[2](ctx);
    if (data !== undefined && !res.headersSent) sendJson(res, 200, data);
  } catch (e) {
    if (res.headersSent) return res.end();
    if (e instanceof HttpError) {
      return sendJson(res, e.status, e.mockError ? { error: e.message } : { message: e.message, ...(e.extra?.code && { code: e.extra.code }) });
    }
    await log({ level: "error", kind: "system", status: "error", ip: ctx.ip, message: `${req.method} ${url.pathname}: ${e.message}`, details: { stack: e.stack?.split("\n").slice(0, 6) } });
    sendJson(res, 500, { message: "Server xatosi" });
  }
});

// ---------------- Eski loglarni tozalash ----------------

async function cleanup() {
  try {
    await q(`DELETE FROM logs WHERE created_at < now() - make_interval(days => $1)`, [config.logRetentionDays]);
  } catch (e) {
    console.error("Tozalash:", e.message);
  }
}

// ---------------- Ishga tushirish ----------------

await migrate();
server.requestTimeout = 120_000;
server.listen(config.port, () => {
  const api = config.adminApiMock ? `MOCK (ichki, radius ${config.mock.radiusM} m)` : config.adminApiUrl;
  const face = faceEnabled() ? `${config.faceMode} (${config.faceUrl}, chegara ${config.faceThreshold})` : "o'chiq";
  console.log(`Gateway :${config.port} — admin API: ${api}, yuz tekshiruvi: ${face}, developerlar: ${config.developerIds.length}`);
  log({
    kind: "system",
    status: "started",
    message: "Gateway ishga tushdi",
    details: {
      api: apiName(),
      linkId: config.adminLinkIdField,
      sendHemisPhoto: config.adminSendHemisPhoto,
      face: faceEnabled() ? { mode: config.faceMode, threshold: config.faceThreshold } : "off",
      developers: config.developerIds.length,
    },
  });
});
cleanup();
setInterval(cleanup, 60 * 60 * 1000).unref();

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.once(sig, () => {
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
  });
}
