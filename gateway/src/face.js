import { config } from "./config.js";
import { hemisPhoto } from "./hemis.js";

/**
 * Yuz tekshiruvi: selfi talabaning HEMIS rasmiga solishtiriladi.
 * face servisi (face/app.py, OpenCV YuNet + SFace) rasmdan 128 sonli yuz belgisini (embedding) beradi.
 * Ikki belgining skalyar ko'paytmasi = kosinus o'xshashlik; FACE_THRESHOLD dan past — boshqa odam.
 *
 * HEMIS rasmining belgisi faqat gateway xotirasida keshlanadi (rasm URL i bo'yicha): bazaga ham, diskka ham
 * yozilmaydi, gateway qayta ishga tushsa yo'qoladi. Selfi ham saqlanmaydi.
 */

const REF_CACHE_MAX = 5000;
const refCache = new Map(); // HEMIS rasm URL -> { status: "ok", embedding } | { status: "no_reference", reason }
const refPending = new Map(); // bir xil rasm uchun bir vaqtda bitta so'rov

export const faceEnabled = () => Boolean(config.faceUrl) && config.faceMode !== "off";

/** face servisi: POST /embed -> { status: "ok"|"no_face"|"bad_image", faces, embedding } */
async function embed(buf) {
  let res;
  try {
    res = await fetch(`${config.faceUrl}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: buf.toString("base64") }),
      signal: AbortSignal.timeout(config.faceTimeoutMs),
    });
  } catch (e) {
    throw new Error(
      e.name === "TimeoutError"
        ? `face servisi ${config.faceTimeoutMs / 1000} soniyada javob bermadi`
        : `face servisiga ulanib bo'lmadi: ${e.cause?.code ?? e.message}`,
    );
  }
  if (!res.ok) throw new Error(`face servisi HTTP ${res.status}`);
  return res.json();
}

/** HEMIS rasmidagi yuz belgisi (keshdan). Tarmoq xatosi bo'lsa — xato tashlanadi (keshlanmaydi) */
function referenceOf(imageUrl) {
  if (!imageUrl) return Promise.resolve({ status: "no_reference", reason: "HEMIS da rasm yo'q" });
  const hit = refCache.get(imageUrl);
  if (hit) return Promise.resolve(hit);
  let p = refPending.get(imageUrl);
  if (!p) {
    p = (async () => {
      let photo;
      try {
        photo = await hemisPhoto(imageUrl);
      } catch (e) {
        throw new Error(`HEMIS rasmi yuklanmadi: ${e.message}`);
      }
      const r = await embed(photo.buf);
      const v =
        r.status === "ok" && Array.isArray(r.embedding)
          ? { status: "ok", embedding: r.embedding }
          : { status: "no_reference", reason: r.status === "no_face" ? "HEMIS rasmida yuz topilmadi" : "HEMIS rasmi o'qilmadi" };
      if (refCache.size >= REF_CACHE_MAX) refCache.delete(refCache.keys().next().value);
      refCache.set(imageUrl, v);
      return v;
    })().finally(() => refPending.delete(imageUrl));
    refPending.set(imageUrl, p);
  }
  return p;
}

/** Kirishda oldindan tayyorlab qo'yish (birinchi davomat tezroq bo'lsin). Xatolar e'tiborsiz */
export function warmFace(imageUrl) {
  if (faceEnabled() && imageUrl) referenceOf(imageUrl).catch(() => {});
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

/**
 * Selfi va HEMIS rasmini solishtirish.
 * -> { status, similarity?, threshold, faces?, reason?, ms }
 *   match       — bir odam
 *   mismatch    — boshqa odam (o'xshashlik chegaradan past)
 *   no_face     — selfida yuz topilmadi
 *   no_reference — HEMIS rasmi yo'q / unda yuz yo'q (tekshirib bo'lmadi — davomat o'tkaziladi)
 *   error       — face servisi yoki HEMIS ishlamadi (davomat o'tkaziladi)
 *   off         — yuz tekshiruvi o'chiq
 */
export async function checkFace(imageUrl, selfie) {
  if (!faceEnabled()) return { status: "off" };
  const started = Date.now();
  const [ref, probe] = await Promise.allSettled([referenceOf(imageUrl), embed(selfie)]);
  const base = { threshold: config.faceThreshold };
  const done = (r) => ({ ...base, ...r, ms: Date.now() - started });

  if (probe.status === "rejected") return done({ status: "error", reason: probe.reason.message });
  const p = probe.value;
  if (p.status === "no_face") return done({ status: "no_face", faces: 0 });
  if (p.status !== "ok" || !Array.isArray(p.embedding)) return done({ status: "error", reason: `selfi o'qilmadi (${p.status})` });

  if (ref.status === "rejected") return done({ status: "error", faces: p.faces, reason: ref.reason.message });
  if (ref.value.status !== "ok") return done({ status: "no_reference", faces: p.faces, reason: ref.value.reason });

  const similarity = Math.round(dot(p.embedding, ref.value.embedding) * 10000) / 10000;
  return done({ status: similarity >= config.faceThreshold ? "match" : "mismatch", similarity, faces: p.faces });
}
