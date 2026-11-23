import { useState, type FormEvent } from "react";
import { api } from "../api";
import { tokens } from "../auth";
import { tg } from "../telegram";
import type { LoginResponse, Student } from "../types";

const LOGO = `${import.meta.env.BASE_URL}logo.webp`;

export default function Login({ onSuccess }: { onSuccess: (s: Student) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!login.trim() || !password) return setError("Login va parolni kiriting");

    setLoading(true);
    setError("");
    try {
      const res = await api<LoginResponse>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ login: login.trim(), password }) },
        { auth: false },
      );
      tokens.set(res);
      tg?.HapticFeedback?.notificationOccurred("success");
      onSuccess(res.student);
    } catch (err) {
      tg?.HapticFeedback?.notificationOccurred("error");
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-xl border border-tg-hint/25 bg-tg-card px-4 py-3 text-base text-tg-text outline-none " +
    "placeholder:text-tg-hint/70 focus:border-tg-button focus:ring-2 focus:ring-tg-button/30";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <img src={LOGO} alt="Jizzax politexnika instituti" className="h-32 w-32 rounded-full shadow-lg" />
      <h1 className="mt-5 text-center text-xl font-bold">Amaliyot nazorati</h1>
      <p className="mt-1 text-center text-sm text-tg-hint">HEMIS login va parolingiz bilan kiring</p>

      <form onSubmit={submit} className="mt-8 w-full max-w-sm space-y-4" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Login (talaba ID)</span>
          <input
            className={input}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            inputMode="numeric"
            autoComplete="username"
            placeholder="Masalan: 399211100001"
            disabled={loading}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Parol</span>
          <div className="relative">
            <input
              className={`${input} pr-20`}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="HEMIS paroli"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-4 text-sm font-medium text-tg-button"
            >
              {showPassword ? "Yashirish" : "Ko'rsatish"}
            </button>
          </div>
        </label>

        {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-tg-button py-3.5 text-base font-semibold text-tg-button-text transition active:scale-[.98] disabled:opacity-60"
        >
          {loading ? "Tekshirilmoqda…" : "Kirish"}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-tg-hint">Jizzax politexnika instituti</p>
    </main>
  );
}
