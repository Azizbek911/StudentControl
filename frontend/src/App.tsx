import { lazy, Suspense, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { tokens } from "./auth";
import { getDeviceId } from "./device";
import { isInTelegram, isMobilePlatform, openExternal, tg } from "./telegram";
import type { Student } from "./types";
import Home from "./pages/Home";
import Login from "./pages/Login";

// Loglar sahifasi faqat developer uchun yuklanadi
const DevApp = lazy(() => import("./dev/DevApp"));

// v2 da faqat 2 ta rol: talaba va developer
type State =
  | { kind: "loading" }
  | { kind: "blocked"; title: string; text: string; link?: { label: string; url: string } }
  | { kind: "developer"; name: string | null }
  | { kind: "login" }
  | { kind: "home"; student: Student };

/** GET /api/role. client — talaba qaysi Telegram ilovasida (ok=false: norasmiy, masalan Plus Messenger) */
interface RoleInfo {
  role: "developer" | "student";
  name: string | null;
  client?: { ok: boolean; app: string | null };
}

/** Norasmiy Telegram ilovasi (Plus Messenger, Nekogram ...) — ilova ishlamaydi */
const unofficial = (app: string | null): State => ({
  kind: "blocked",
  title: "Faqat rasmiy Telegram",
  text:
    (app ? `Siz norasmiy ilovadan (${app}) kirdingiz. ` : "") +
    "Ilova faqat rasmiy Telegram orqali ishlaydi. Rasmiy Telegram'ni o'rnating va botni o'sha yerda oching.",
  link: { label: "Rasmiy Telegram'ni yuklab olish", url: "https://telegram.org/apps" },
});

const Loading = () => (
  <main className="flex min-h-dvh items-center justify-center">
    <p className="text-tg-hint">Yuklanmoqda…</p>
  </main>
);

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    tg?.ready();
    tg?.expand();

    if (!isInTelegram()) {
      return setState({
        kind: "blocked",
        title: "Faqat Telegram orqali",
        text: "Bu ilova faqat bot ichidagi tugma orqali ochiladi. Botga /start yozing.",
      });
    }

    (async () => {
      // 1) Developer bo'lsa — loglar (kompyuterdan ham mumkin)
      let client: RoleInfo["client"];
      try {
        const r = await api<RoleInfo>("/role", {}, { auth: false });
        if (r.role === "developer") return setState({ kind: "developer", name: r.name });
        client = r.client;
      } catch {
        // tekshiruv ishlamasa — talaba sifatida davom etamiz (gateway talaba so'rovlarini baribir tekshiradi)
      }

      // 2) Talabalar — faqat telefonda
      if (!isMobilePlatform()) {
        return setState({
          kind: "blocked",
          title: "Faqat telefonda",
          text: "Ilova faqat Android va iPhone dagi Telegram orqali ishlaydi. Botni telefoningizdan oching.",
        });
      }

      // 3) Faqat rasmiy Telegram ilovasi (Plus Messenger va boshqalar — yo'q)
      if (client && !client.ok) return setState(unofficial(client.app));

      await getDeviceId();
      if (!tokens.get()) return setState({ kind: "login" });
      try {
        setState({ kind: "home", student: await api<Student>("/auth/me") });
      } catch (e) {
        if (e instanceof ApiError && e.code === "unofficial_client") return setState(unofficial(null));
        if (e instanceof ApiError && e.status === 401) tokens.clear();
        setState({ kind: "login" });
      }
    })();
  }, []);

  switch (state.kind) {
    case "loading":
      return <Loading />;
    case "blocked": {
      const { link } = state;
      return (
        <main className="flex min-h-dvh items-center justify-center p-6 text-center">
          <div className="max-w-sm rounded-2xl bg-tg-card p-6">
            <h2 className="text-xl font-semibold">{state.title}</h2>
            <p className="mt-3 text-sm text-tg-hint">{state.text}</p>
            {link && (
              <button
                onClick={() => openExternal(link.url)}
                className="mt-5 w-full rounded-xl bg-tg-button py-3 font-semibold text-tg-button-text"
              >
                {link.label}
              </button>
            )}
          </div>
        </main>
      );
    }
    case "developer":
      return (
        <Suspense fallback={<Loading />}>
          <DevApp name={state.name} />
        </Suspense>
      );
    case "login":
      return <Login onSuccess={(student) => setState({ kind: "home", student })} />;
    case "home":
      return (
        <Home
          student={state.student}
          onLogout={() => {
            tokens.clear();
            setState({ kind: "login" });
          }}
        />
      );
  }
}
