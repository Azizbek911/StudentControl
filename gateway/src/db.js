import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";

// bigint (hemis_id, telegram_id, id) -> Number (qiymatlar 2^53 dan kichik)
pg.types.setTypeParser(20, (v) => Number(v));

export const db = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

/** SQL so'rovi -> qatorlar */
export async function q(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

export async function one(sql, params = []) {
  return (await q(sql, params))[0] ?? null;
}

/** db/schema.sql ni bajarish (takroriy ishga tushirishga xavfsiz). Baza tayyor bo'lguncha kutadi */
export async function migrate() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.SCHEMA_FILE, path.join(here, "../db/schema.sql"), path.join(here, "../../db/schema.sql")];
  let sql = null;
  for (const f of candidates.filter(Boolean)) {
    sql = await fs.readFile(f, "utf8").catch(() => null);
    if (sql) break;
  }
  if (!sql) throw new Error("db/schema.sql topilmadi");

  for (let i = 1; ; i++) {
    try {
      await db.query(sql);
      return;
    } catch (e) {
      if (i >= 30) throw e;
      console.warn(`Baza tayyor emas (${e.message}) — qayta urinish ${i}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
