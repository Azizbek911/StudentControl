import { useCallback, useEffect, useRef, useState } from "react";
import { api, isRetryable, retryDelay } from "../api";
import { CheckIcon, ClockIcon, FlagIcon, GraduationCapIcon, MapPinIcon } from "../components/icons";
import Loader from "../components/Loader";
import { STATUS, TYPE_LABEL } from "../status";
import { confirmDialog } from "../telegram";
import type { CheckType, Student, TodayInfo } from "../types";
import CheckIn from "./CheckIn";

export default function Home({ student, onLogout }: { student: Student; onLogout: () => void }) {
  const [checking, setChecking] = useState<CheckType | null>(null);
  const [info, setInfo] = useState<TodayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Admin sayt (yoki server) javob bermayapti — xato o'rniga "Yuklanmoqda", o'zi qayta so'raydi
  const [waiting, setWaiting] = useState(false);
  const attempt = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(function run() {
    window.clearTimeout(timer.current);
    const again = () => {
      setWaiting(true);
      timer.current = window.setTimeout(run, retryDelay(attempt.current++));
    };
    api<TodayInfo>("/today")
      .then((d) => {
        setInfo(d);
        setError(null);
        if (d.retry) return again();
        attempt.current = 0;
        setWaiting(false);
      })
      .catch((e: unknown) => {
        if (isRetryable(e)) return again();
        setWaiting(false);
        setError(e instanceof Error ? e.message : "Xatolik yuz berdi");
      });
  }, []);

  useEffect(() => {
    load();
    return () => window.clearTimeout(timer.current);
  }, [load]);

  if (checking) {
    const close = () => {
      setChecking(null);
      load();
    };
    return <CheckIn type={checking} task={info?.task ?? null} onCancel={close} onDone={close} />;
  }

  const task = info?.task;
  const checks = info?.checks ?? [];
  // Kelish belgilangan bo'lsa (joyida/kechikdi/tekshiruvda) — endi "Ketish" tugmasi asosiy
  const cameIn = checks.some((c) => c.type === "CHECK_IN" && ["present", "late", "suspicious"].includes(c.status));
  const leftOut = checks.some((c) => c.type === "CHECK_OUT" && ["present", "late", "suspicious"].includes(c.status));

  return (
    <main className="min-h-dvh px-5 pt-6 pb-10">
      <header className="flex items-center gap-4">
        {student.image ? (
          <img src={student.image} alt="" className="h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tg-card text-tg-button">
            <GraduationCapIcon className="size-8" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{student.shortName ?? student.fullName ?? student.login}</h1>
          <p className="truncate text-sm text-tg-hint">{[student.group, student.specialty].filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-tg-hint">ID: {student.number}</p>
        </div>
      </header>

      {error && <p className="mt-6 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
      {!error && (!info || waiting) && (
        <section className="mt-6 flex justify-center rounded-2xl bg-tg-card px-5 py-10">
          <Loader />
        </section>
      )}

      {info && !waiting && (
        <section className="mt-6 rounded-2xl bg-tg-card p-5">
          <h2 className="text-sm font-semibold text-tg-hint">BUGUNGI AMALIYOT JOYI</h2>
          {task ? (
            <>
              <p className="mt-2 text-lg font-semibold">{task.location}</p>
              {task.address && (
                <p className="flex items-start gap-1.5 text-sm text-tg-hint">
                  <MapPinIcon className="mt-0.5 size-4" />
                  <span>{task.address}</span>
                </p>
              )}
              <p className="mt-1 flex items-start gap-1.5 text-sm text-tg-hint">
                <ClockIcon className="mt-0.5 size-4" />
                <span>
                  {task.workStart} – {task.workEnd} · radius {task.radiusM} m
                </span>
              </p>
              <div className="mt-4 space-y-3">
                {!cameIn && (
                  <button
                    onClick={() => setChecking("CHECK_IN")}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-tg-button py-3.5 font-semibold text-tg-button-text transition active:scale-[.98]"
                  >
                    <MapPinIcon />
                    Kelishni belgilash
                  </button>
                )}
                {cameIn && !leftOut && (
                  <button
                    onClick={() => setChecking("CHECK_OUT")}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-tg-button py-3.5 font-semibold text-tg-button-text transition active:scale-[.98]"
                  >
                    <FlagIcon />
                    Ketishni belgilash
                  </button>
                )}
                {cameIn && leftOut && (
                  <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                    <CheckIcon className="size-4" />
                    Bugungi davomat tugadi
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm">{info.message ?? "Bugun uchun vazifa yo'q"}</p>
          )}
        </section>
      )}

      {checks.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-tg-hint">BUGUN</h2>
          <ul className="mt-2 space-y-2">
            {checks.map((c) => (
              <li key={c.id} className="rounded-xl bg-tg-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {c.time} · {TYPE_LABEL[c.type]}
                  </span>
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${STATUS[c.status].cls}`}>{STATUS[c.status].text}</span>
                </div>
                {c.notes.length > 0 && <p className="mt-1 text-xs text-tg-hint">{c.notes.join(" · ")}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        onClick={async () => (await confirmDialog("Profildan chiqasizmi?")) && onLogout()}
        className="mt-10 w-full py-2 text-sm text-tg-hint"
      >
        Chiqish
      </button>
    </main>
  );
}
