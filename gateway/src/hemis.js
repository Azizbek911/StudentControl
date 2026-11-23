import { config } from "./config.js";
import { HttpError } from "./http.js";
import { imageType } from "./security.js";

const TIMEOUT_MS = 15_000;

async function request(p, init) {
  let res;
  try {
    res = await fetch(`${config.hemisUrl}${p}`, {
      ...init,
      headers: { accept: "application/json", "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new HttpError(502, "HEMIS serveriga ulanib bo'lmadi. Keyinroq urinib ko'ring.", { cause: e.message });
  }
  try {
    return await res.json();
  } catch {
    throw new HttpError(502, `HEMIS noto'g'ri javob qaytardi (${res.status})`);
  }
}

/** HEMIS login -> token. Login/parol xato bo'lsa 401 */
export async function hemisLogin(login, password) {
  const r = await request("/auth/login", { method: "POST", body: JSON.stringify({ login, password }) });
  if (!r.success || !r.data?.token) throw new HttpError(401, r.error || "Login yoki parol xato");
  return r.data.token;
}

/** HEMIS /account/me */
export async function hemisMe(token) {
  const r = await request("/account/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!r.success || !r.data?.id) throw new HttpError(502, r.error || "HEMIS dan ma'lumot olib bo'lmadi");
  return r.data;
}

const nameOf = (v) => (v == null ? null : typeof v === "string" ? v || null : typeof v?.name === "string" ? v.name || null : null);
const str = (v) => (typeof v === "string" && v ? v : v == null ? null : String(v));

/** /account/me -> token ichidagi profil (bazada saqlanmaydi) */
export function profileFromHemis(me, login) {
  const image = str(me.image);
  return {
    id: me.id,
    number: str(me.student_id_number) ?? login,
    login,
    fullName: str(me.full_name),
    shortName: str(me.short_name),
    group: nameOf(me.group),
    specialty: nameOf(me.specialty),
    image: image ? new URL(image, config.hemisUrl).toString() : null,
  };
}

/** Talabaning HEMIS dagi rasmi (saqlanmaydi — faqat ADMIN_API_SEND_HEMIS_PHOTO=true bo'lsa yuklab, uzatiladi) */
export async function hemisPhoto(imageUrl) {
  if (!imageUrl) return null;
  const res = await fetch(new URL(imageUrl, config.hemisUrl), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = imageType(buf);
  if (!type) throw new Error("HEMIS rasmi emas");
  return { buf, type };
}
