// Admin API ga ko'p so'rov yuborish (yuklama testi). loadtest.sh orqali gateway konteyneri ichida ishlaydi.
// Sozlamalar muhitdan: LT_COUNT, LT_CONCURRENCY, LT_ENDPOINT (checkin|today|link), LT_TYPE (CHECK_IN|CHECK_OUT),
//                      LT_TG, LT_HEMIS, LT_LAT, LT_LNG, LT_ACC
import zlib from "node:zlib";
import { linkStudent, sendCheckin, todayTask } from "/app/src/admin-api.js";
import { config } from "/app/src/config.js";
import { db, one } from "/app/src/db.js";
import { log } from "/app/src/log.js";

const env = process.env;
const N = Math.max(1, Number(env.LT_COUNT) || 10);
const CONCURRENCY = Math.max(1, Math.min(N, Number(env.LT_CONCURRENCY) || 1));
const ENDPOINT = ["checkin", "today", "link"].includes(env.LT_ENDPOINT) ? env.LT_ENDPOINT : "checkin";
const TYPE = env.LT_TYPE === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";

// Telegram ID / HEMIS ID / joylashuv berilmasa — loglardagi oxirgi talabaniki
const last = await one(
  `SELECT telegram_id, student_id, details FROM logs
   WHERE kind IN ('check', 'login', 'link') AND telegram_id IS NOT NULL AND student_id IS NOT NULL
   ORDER BY COALESCE(details ? 'latitude', false) DESC, id DESC LIMIT 1`,
);
const TG = Number(env.LT_TG) || last?.telegram_id;
const HEMIS = env.LT_HEMIS || (await one(`SELECT details->>'hemisId' h FROM logs WHERE kind = 'link' AND details ? 'hemisId' AND telegram_id = $1 ORDER BY id DESC LIMIT 1`, [TG ?? 0]))?.h || last?.student_id;
const LAT = Number(env.LT_LAT) || Number(last?.details?.latitude) || config.mock.lat;
const LNG = Number(env.LT_LNG) || Number(last?.details?.longitude) || config.mock.lng;
const ACC = Number(env.LT_ACC) || Math.round(Number(last?.details?.accuracy)) || 20;

if (!TG) {
  console.error("Telegram ID topilmadi: --tg ID bering (yoki avval ilovaga bir marta kiring)");
  process.exit(1);
}

const api = config.adminApiMock ? "MOCK (ichki)" : config.adminApiUrl;
console.log(`API:       ${api}`);
console.log(`So'rov:    ${ENDPOINT === "checkin" ? `POST /api/bot/checkin (${TYPE})` : ENDPOINT === "today" ? "GET /api/bot/today" : "POST /api/bot/link"}`);
console.log(`Soni:      ${N}, parallel ${CONCURRENCY}`);
console.log(`Telegram:  ${TG}${ENDPOINT === "link" ? `   HEMIS: ${HEMIS}` : ""}`);
if (ENDPOINT === "checkin") console.log(`Joylashuv: ${LAT}, ${LNG} (±${ACC} m)`);
console.log("");

// Har so'rovga boshqa rang (32x32 PNG) — bir xil rasm "takror" deb hisoblanmasligi uchun
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function png(seed) {
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(32, 0);
  ihdr.writeUInt32BE(32, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((32 * 3 + 1) * 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = y * 97 + 1 + x * 3;
      raw[i] = (seed * 37 + x * 5) & 255;
      raw[i + 1] = (seed * 91 + y * 7) & 255;
      raw[i + 2] = (seed * 13 + x + y) & 255;
    }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function send(i) {
  if (ENDPOINT === "today") return todayTask(TG);
  if (ENDPOINT === "link") return linkStudent(HEMIS, TG);
  return sendCheckin({
    telegramId: TG,
    lat: LAT,
    lng: LNG,
    accuracy: ACC,
    sentAt: Math.floor(Date.now() / 1000),
    type: TYPE,
    photo: { buf: png(i), type: "png" },
    hemisPhoto: null,
  });
}

const color = process.stdout.isTTY ? (c, s) => `\x1b[${c}m${s}\x1b[0m` : (_c, s) => s;
const results = [];
let next = 0;
const width = String(N).length;
const started = Date.now();

async function worker() {
  while (next < N) {
    const i = ++next;
    const r = await send(i);
    results.push(r);
    const http = r.httpStatus ?? "---";
    const c = r.ok ? 32 : r.httpStatus && r.httpStatus < 500 ? 33 : 31;
    // Har bir javob to'liq (bitta qatorda)
    const body = r.body ? r.body.replace(/\s+/g, " ").trim() : r.error;
    console.log(`#${String(i).padStart(width)}  ${color(c, String(http).padEnd(3))}  ${String(r.ms).padStart(5)} ms  ${body}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const total = Date.now() - started;

const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))];
const groups = {};
for (const r of results) {
  const k = r.ok ? `${r.httpStatus} ${r.data?.status ?? "OK"}` : `${r.httpStatus ?? "ulanmadi"} ${r.error}`;
  groups[k] = (groups[k] ?? 0) + 1;
}

console.log("");
console.log("──────── Natija ────────");
console.log(`Jami: ${N} so'rov, ${(total / 1000).toFixed(1)} s (${(N / (total / 1000)).toFixed(1)} so'rov/s)`);
console.log(`Vaqt: min ${ms[0]} · o'rtacha ${Math.round(ms.reduce((a, b) => a + b, 0) / N)} · p50 ${pct(50)} · p95 ${pct(95)} · max ${ms[ms.length - 1]} ms`);
for (const [k, n] of Object.entries(groups).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(width)} × ${k}`);

await log({
  kind: "system",
  status: "load_test",
  message: `Yuklama testi: ${N} × ${ENDPOINT}${ENDPOINT === "checkin" ? ` ${TYPE}` : ""} — ${Object.entries(groups).map(([k, n]) => `${n}×${k}`).join(", ")}`,
  telegramId: TG,
  details: { endpoint: ENDPOINT, type: TYPE, n: N, concurrency: CONCURRENCY, totalMs: total, p50: pct(50), p95: pct(95), max: ms[ms.length - 1], groups },
});
await db.end();
