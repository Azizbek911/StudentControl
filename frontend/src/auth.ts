import type { Tokens } from "./types";

// Access + refresh tokenlar. localStorage ishlamasa (masalan bloklangan bo'lsa) — xotirada
const KEY = "sc_tokens";
let memory: Tokens | null = null;

export const tokens = {
  get(): Tokens | null {
    if (memory) return memory;
    try {
      const raw = localStorage.getItem(KEY);
      memory = raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      memory = null;
    }
    return memory;
  },

  set(t: Tokens) {
    memory = { accessToken: t.accessToken, refreshToken: t.refreshToken };
    try {
      localStorage.setItem(KEY, JSON.stringify(memory));
    } catch {
      // faqat xotirada qoladi
    }
  },

  clear() {
    memory = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // e'tiborsiz
    }
  },
};
