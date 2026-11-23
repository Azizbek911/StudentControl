import { db } from "./db.js";

/**
 * Developer ko'radigan log. Bazaga yoziladi va konsolga chiqadi.
 * Log yozilmasa ham (baza ishlamasa) asosiy ish to'xtamaydi.
 *
 * @param {{ level?: "info"|"warn"|"error", kind: string, status: string, message?: string,
 *           studentId?: number|null, studentName?: string|null, telegramId?: number|null, ip?: string|null, details?: object }} e
 */
export async function log(e) {
  const level = e.level ?? "info";
  const who = e.studentId ? ` [${e.studentId}]` : "";
  const line = `${level.toUpperCase()} ${e.kind}/${e.status}${who} ${e.message ?? ""}`;
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  try {
    const r = await db.query(
      `INSERT INTO logs (level, kind, status, message, student_id, student_name, telegram_id, ip, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        level,
        e.kind,
        e.status,
        e.message ?? null,
        e.studentId ?? null,
        e.studentName ?? null,
        e.telegramId ?? null,
        e.ip ?? null,
        e.details ? JSON.stringify(e.details) : null,
      ],
    );
    return r.rows[0].id;
  } catch (err) {
    console.error("Log bazaga yozilmadi:", err.message);
    return null;
  }
}
