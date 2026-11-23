import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import type { LogItem, LogList } from "../types";

/** Status nomlari (developer uchun qisqa izoh) */
const STATUS_LABEL: Record<string, string> = {
  present: "PRESENT — joyida",
  late: "LATE — kechikdi",
  out_of_range: "OUT_OF_RANGE — uzoq",
  suspicious: "SUSPICIOUS — shubhali",
  rejected: "REJECTED",
  refused: "API rad etdi",
  unknown: "Noma'lum status",
  api_error: "API xatosi",
  not_linked: "Bog'lanmagan",
  already: "Oldin bog'langan",
  not_found: "HEMIS ID topilmadi",
  conflict: "Boshqa akkaunt",
  bad_request: "Noto'g'ri so'rov",
  no_hemis_photo: "HEMIS rasmi yo'q",
  too_often: "Juda tez-tez",
  ok: "Kirdi",
  wrong_password: "Parol xato",
  device_taken: "Boshqa telefon",
  hemis_down: "HEMIS ishlamadi",
  hemis_sync_failed: "HEMIS sinxron xatosi",
  not_mobile: "Telefon emas",
  not_telegram: "Telegram emas",
  unofficial_client: "Norasmiy Telegram",
  started: "Ishga tushdi",
  error: "Server xatosi",
};

const LEVEL_CLS: Record<LogItem["level"], string> = {
  info: "border-l-emerald-500",
  warn: "border-l-amber-500",
  error: "border-l-red-500",
};

const STATUS_CLS = (status: string, level: LogItem["level"]) =>
  status === "present" || (status === "ok" && level === "info")
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : status === "out_of_range" || status === "rejected"
      ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
      : level === "error"
        ? "bg-red-500/15 text-red-600"
        : level === "warn"
          ? "bg-amber-500/15 text-amber-700"
          : "bg-tg-hint/15 text-tg-hint";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

const PAGE = 50;

/** Developer: faqat loglarni ko'radi (hamma statuslar). Hech narsani o'zgartirmaydi */
export default function DevApp({ name }: { name: string | null }) {
  const [data, setData] = useState<LogList | null>(null);
  const [more, setMore] = useState<LogItem[]>([]);
  const [noMore, setNoMore] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [level, setLevel] = useState<"" | LogItem["level"]>("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (statuses.length) p.set("status", statuses.join(","));
    if (level) p.set("level", level);
    if (query) p.set("q", query);
    return p;
  }, [statuses, level, query]);

  const load = useCallback(() => {
    api<LogList>(`/dev/logs?${params}&limit=${PAGE}`, {}, { auth: false })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [params]);

  // Filtr o'zgarsa — boshidan
  useEffect(() => {
    setMore([]);
    setNoMore(false);
    load();
  }, [load]);

  // Har 10 soniyada yangilash (faqat birinchi sahifa)
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => loadRef.current(), 10_000);
    return () => clearInterval(t);
  }, [auto]);

  const items = useMemo(() => {
    const first = data?.items ?? [];
    const seen = new Set(first.map((i) => i.id));
    return [...first, ...more.filter((i) => !seen.has(i.id))];
  }, [data, more]);

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    const p = new URLSearchParams(params);
    p.set("before", String(last.id));
    p.set("limit", String(PAGE));
    const d = await api<LogList>(`/dev/logs?${p}`, {}, { auth: false });
    setMore((m) => [...m, ...d.items]);
    if (d.items.length < PAGE) setNoMore(true);
  }

  // 24 soatlik statuslar (chiplar)
  const chips = useMemo(() => {
    const map = new Map<string, { n: number; level: LogItem["level"] }>();
    for (const c of data?.counts ?? []) {
      const prev = map.get(c.status);
      const worst = prev && (prev.level === "error" || (prev.level === "warn" && c.level === "info")) ? prev.level : c.level;
      map.set(c.status, { n: (prev?.n ?? 0) + c.n, level: worst });
    }
    for (const s of statuses) if (!map.has(s)) map.set(s, { n: 0, level: "info" });
    return [...map.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [data, statuses]);

  const toggle = (s: string) => setStatuses((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]));

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pt-5 pb-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Loglar</h1>
          <p className="text-xs text-tg-hint">
            Developer{name ? ` · ${name}` : ""} · API: {data?.api ?? "…"}
            {data && ` · talabalar: ${data.totals.students} · 24 soatda tekshiruv: ${data.totals.checks24h}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-tg-hint">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Avto-yangilash
        </label>
      </header>

      {/* Statuslar (oxirgi 24 soat). Bosilsa — filtr */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setStatuses([])}
          className={`rounded-full px-3 py-1 text-xs font-medium ${statuses.length ? "bg-tg-card" : "bg-tg-button text-tg-button-text"}`}
        >
          Hammasi
        </button>
        {chips.map(([s, c]) => (
          <button
            key={s}
            onClick={() => toggle(s)}
            title={STATUS_LABEL[s] ?? s}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              statuses.includes(s) ? "ring-2 ring-tg-button" : ""
            } ${STATUS_CLS(s, c.level)}`}
          >
            {STATUS_LABEL[s] ?? s} · {c.n}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-tg-hint">Sonlar — oxirgi 24 soat</p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="HEMIS ID, login, ism, xabar…"
          className="min-w-0 flex-1 rounded-xl border border-tg-hint/25 bg-tg-card px-3 py-2 text-sm outline-none focus:border-tg-button"
        />
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as typeof level)}
          className="rounded-xl border border-tg-hint/25 bg-tg-card px-2 py-2 text-sm"
        >
          <option value="">Daraja: hammasi</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </form>

      {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}

      <ul className="mt-4 space-y-2">
        {items.map((l) => (
          <li key={l.id}>
            <button
              onClick={() => setOpenId(l.id)}
              className={`w-full rounded-xl border-l-4 bg-tg-card px-3 py-2.5 text-left ${LEVEL_CLS[l.level]}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-tg-hint tabular-nums">{fmt(l.createdAt)}</span>
                <span className="rounded bg-tg-hint/15 px-1.5 py-0.5 text-[11px] uppercase text-tg-hint">{l.kind}</span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS(l.status, l.level)}`}>
                  {STATUS_LABEL[l.status] ?? l.status}
                </span>
                <span className="ml-auto text-[11px] text-tg-hint">#{l.id}</span>
              </div>
              <div className="mt-1 text-sm">
                {l.studentId && (
                  <span className="font-medium">
                    {l.studentName ?? "?"} <span className="text-tg-hint">({l.studentId})</span> —{" "}
                  </span>
                )}
                <span className="break-words">{l.message}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {data && items.length === 0 && <p className="mt-6 text-center text-sm text-tg-hint">Log yo'q</p>}
      {items.length >= PAGE && !noMore && (
        <button onClick={loadMore} className="mt-4 w-full rounded-xl border border-tg-hint/25 py-2.5 text-sm">
          Yana yuklash
        </button>
      )}

      {openId !== null && <LogModal id={openId} onClose={() => setOpenId(null)} />}
    </main>
  );
}

function LogModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [d, setD] = useState<LogItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<LogItem>(`/dev/logs/${id}`, {}, { auth: false }).then(setD, (e: Error) => setError(e.message));
  }, [id]);

  const x = (d?.details ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const lat = num(x.latitude);
  const lng = num(x.longitude);
  const notes = Array.isArray(x.notes) ? (x.notes as unknown[]).map(String) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-tg-bg p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Log #{id}</h2>
          <button onClick={onClose} className="px-2 text-2xl leading-none text-tg-hint" aria-label="Yopish">
            ×
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        {!d && !error && <p className="mt-3 text-sm text-tg-hint">Yuklanmoqda…</p>}
        {d && (
          <div className="mt-3 space-y-4 text-sm">
            <Rows
              rows={[
                ["Vaqt", fmt(d.createdAt)],
                ["Daraja", d.level],
                ["Tur / status", `${d.kind} / ${d.status} — ${STATUS_LABEL[d.status] ?? ""}`],
                ["Xabar", d.message],
                ["Talaba", d.studentName && `${d.studentName} (HEMIS ${d.studentId})`],
                ["Telegram ID", d.telegramId],
                ["IP", d.ip],
                ["Davomat turi", x.type as string],
                [
                  "Joylashuv",
                  lat != null && lng != null ? (
                    <a
                      key="map"
                      className="text-tg-button underline"
                      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {lat.toFixed(6)}, {lng.toFixed(6)}
                      {num(x.accuracy) != null && ` (±${Math.round(num(x.accuracy)!)} m)`}
                    </a>
                  ) : null,
                ],
                ["API status", x.apiStatus as string],
                ["Joy", x.location as string],
                ["Masofa", num(x.distanceM) != null ? `${x.distanceM} m${num(x.radiusM) != null ? ` / radius ${x.radiusM} m` : ""}` : null],
                ["Izohlar", notes.length ? notes.join("; ") : null],
                ["API HTTP", num(x.httpStatus)],
                ["API vaqti", num(x.ms) != null ? `${x.ms} ms` : null],
              ]}
            />
            {d.details && (
              <section>
                <h3 className="font-semibold">Tafsilotlar (JSON)</h3>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-tg-card p-2 text-xs">{JSON.stringify(d.details, null, 2)}</pre>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {rows
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-tg-hint">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
