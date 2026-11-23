import { tokens } from "./auth";
import { currentDeviceId } from "./device";
import { tg } from "./telegram";
import type { Tokens } from "./types";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  /** code — gateway bergan xato kodi (masalan "unofficial_client": norasmiy Telegram ilovasi) */
  constructor(message: string, public status: number, public code: string | null = null) {
    super(message);
  }
}

/**
 * Har bir so'rovga:
 *  - X-Tg-Init-Data / X-Tg-Platform — Telegram imzosi va platforma (desktop bloklanadi)
 *  - X-Device-Id — telefon ID si (bitta telefon = bitta profil)
 *  - Authorization: Bearer <accessToken> — kirgan bo'lsa
 */
function send(path: string, init: RequestInit, withAuth: boolean) {
  const headers: Record<string, string> = {
    // FormData (rasmlar) uchun Content-Type ni brauzer o'zi qo'yadi (boundary bilan)
    ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    "X-Tg-Init-Data": tg?.initData ?? "",
    "X-Tg-Platform": tg?.platform ?? "",
    "X-Device-Id": currentDeviceId() ?? "",
  };
  const access = withAuth ? tokens.get()?.accessToken : undefined;
  if (access) headers.Authorization = `Bearer ${access}`;
  return fetch(`${API_URL}/api${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
}

// Bir vaqtda bir nechta so'rov 401 olsa ham refresh bir marta bajariladi
let refreshing: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.get()?.refreshToken;
  if (!refreshToken) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const res = await send("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }, false);
      if (!res.ok) {
        tokens.clear(); // refresh ham yaroqsiz — qayta kirish kerak
        return false;
      }
      tokens.set((await res.json()) as Tokens);
      return true;
    } catch {
      return false; // tarmoq xatosi: tokenlarni o'chirmaymiz
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function errorMessage(data: { message?: unknown }): string {
  const m = data?.message;
  if (Array.isArray(m)) return m.join(", ");
  return typeof m === "string" && m ? m : "Server xatosi";
}

/** API so'rovi. Access token muddati o'tgan bo'lsa (401) — refresh qilib, bir marta qayta urinadi */
export async function api<T>(path: string, init: RequestInit = {}, opts: { auth?: boolean } = {}): Promise<T> {
  const withAuth = opts.auth ?? true;
  let res: Response;
  try {
    res = await send(path, init, withAuth);
    if (res.status === 401 && withAuth && tokens.get() && (await refreshTokens())) {
      res = await send(path, init, withAuth);
    }
  } catch {
    throw new ApiError("Server bilan bog'lanib bo'lmadi", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(errorMessage(data), res.status, typeof data?.code === "string" ? data.code : null);
  return data as T;
}

/** Fayl (rasm) yuklash — imzo header'lari bilan; <img src> header yubora olmaydi, shuning uchun blob orqali */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await send(path, {}, true);
  if (!res.ok) throw new ApiError("Rasm topilmadi", res.status);
  return res.blob();
}
