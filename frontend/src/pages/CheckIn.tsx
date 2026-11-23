import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import Camera, { type Photo } from "../components/Camera";
import { ArrowLeftIcon, MapPinIcon } from "../components/icons";
import { getLocation, LocationError, openLocationSettings, POOR_ACCURACY, type Position } from "../location";
import { tg } from "../telegram";
import { STATUS, TYPE_LABEL } from "../status";
import type { CheckResult, CheckType, Task } from "../types";
import MyMap from "./MyMap";

type Step = "location" | "selfie" | "send" | "result";

/** Admin sayt joylashuv aniqlanganidan 120 soniyadan keyin kelsa "shubhali" qiladi — yuborishda yangilanadi */
type Located = Position & { at: number };

/**
 * 1) Joylashuv (xaritada ko'rinadi)  2) Old kamera rasmi  3) Yuborish
 * Gateway Telegram ID ni (imzolangan initData dan) qo'shib admin sayt API siga uzatadi.
 */
export default function CheckIn({
  type,
  task,
  onDone,
  onCancel,
}: {
  type: CheckType;
  task: Task | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("location");
  const [position, setPosition] = useState<Located | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<LocationError | null>(null);
  const [selfie, setSelfie] = useState<Photo | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => () => {
    if (selfie) URL.revokeObjectURL(selfie.url);
  }, [selfie]);

  async function locate() {
    setLocating(true);
    setLocError(null);
    try {
      setPosition({ ...(await getLocation()), at: Date.now() });
    } catch (e) {
      setPosition(null);
      setLocError(e instanceof LocationError ? e : new LocationError("Joylashuvni aniqlab bo'lmadi"));
    } finally {
      setLocating(false);
    }
  }

  // Sahifa ochilganda joylashuvni darhol aniqlaymiz
  useEffect(() => {
    locate();
  }, []);

  async function send() {
    if (!selfie || !position) return;
    setStep("send");
    setSendError(null);
    try {
      // Joylashuv eskirgan bo'lsa (selfi uzoq davom etgan) — yuborishdan oldin yangilaymiz
      let pos = position;
      if (Date.now() - pos.at > 60_000) {
        pos = await getLocation()
          .then((p) => ({ ...p, at: Date.now() }))
          .catch(() => position);
      }
      const form = new FormData();
      form.append("type", type);
      form.append("latitude", String(pos.latitude));
      form.append("longitude", String(pos.longitude));
      form.append("accuracy", String(pos.accuracy));
      form.append("locatedAt", String(pos.at));
      form.append("selfie", selfie.blob, "selfie.jpg");
      const r = await api<CheckResult>("/check", { method: "POST", body: form });
      setResult(r);
      tg?.HapticFeedback?.notificationOccurred(r.inside ? "success" : r.inside === false ? "error" : "warning");
      setStep("result");
    } catch (e) {
      tg?.HapticFeedback?.notificationOccurred("error");
      setSendError(e instanceof Error ? e.message : "Xatolik yuz berdi");
      if (e instanceof ApiError && e.status === 401) onCancel();
    }
  }

  function again() {
    setResult(null);
    setSelfie(null);
    setPosition(null);
    setStep("location");
    locate();
  }

  if (step === "result" && result) {
    const ok = result.status === "present" || result.status === "late";
    const title =
      result.status === "present"
        ? "Siz joyidasiz"
        : result.status === "late"
          ? "Qayd etildi — kechikdingiz"
          : result.status === "out_of_range"
            ? "Amaliyot joyidan uzoqdasiz"
            : result.status === "suspicious"
              ? "Qayd etildi, tekshiruvga yuborildi"
              : result.status === "rejected"
                ? "Rad etildi"
                : STATUS[result.status].text;
    const color = ok
      ? "bg-emerald-500/15 text-emerald-600"
      : result.status === "suspicious"
        ? "bg-amber-500/15 text-amber-600"
        : "bg-red-500/12 text-red-500";
    const StatusIcon = STATUS[result.status].icon;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className={`flex h-24 w-24 items-center justify-center rounded-full ${color}`}>
          <StatusIcon className="size-12" strokeWidth={2.5} />
        </div>
        <h1 className="mt-6 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-tg-hint">
          {TYPE_LABEL[result.type]} · {result.time}
          {result.location && ` · ${result.location}`}
        </p>
        {result.distanceM != null && (
          <p className="mt-1 text-sm text-tg-hint">
            Joygacha {result.distanceM} m{result.radiusM != null && ` (ruxsat: ${result.radiusM} m)`}
          </p>
        )}
        {result.notes.length > 0 && (
          <ul className="mt-4 w-full max-w-sm space-y-1 rounded-2xl bg-tg-card p-4 text-left text-sm">
            {result.notes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-current opacity-50" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-10 w-full max-w-sm space-y-3">
          {result.status === "out_of_range" && (
            <button onClick={again} className="w-full rounded-xl bg-tg-button py-3.5 font-semibold text-tg-button-text">
              Qayta urinish
            </button>
          )}
          <button
            onClick={onDone}
            className={`w-full rounded-xl py-3.5 font-semibold ${result.status === "out_of_range" ? "border border-tg-hint/25" : "bg-tg-button text-tg-button-text"}`}
          >
            Bosh sahifaga
          </button>
        </div>
      </main>
    );
  }

  const index = step === "location" ? 0 : 1;

  return (
    <main className="min-h-dvh px-5 pt-5 pb-10">
      <button
        onClick={onCancel}
        className="flex items-center gap-1 py-2 text-sm font-medium text-tg-button"
        disabled={step === "send" && !sendError}
      >
        <ArrowLeftIcon className="size-4" />
        Orqaga
      </button>

      <ol className="mt-3 grid grid-cols-2 gap-2">
        {["Joylashuv", "Selfi"].map((label, i) => (
          <li key={label} className="text-center">
            <div className={`h-1.5 rounded-full ${i <= index ? "bg-tg-button" : "bg-tg-hint/25"}`} />
            <span className={`mt-1.5 block text-xs ${i === index ? "font-semibold" : "text-tg-hint"}`}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {step === "location" && (
        <section className="mt-6">
          <h1 className="text-xl font-bold">{TYPE_LABEL[type]}: joylashuvingiz</h1>
          {task && (
            <p className="mt-1 text-sm">
              {task.location} <span className="text-tg-hint">· radius {task.radiusM} m</span>
            </p>
          )}
          <p className="mt-1 text-sm text-tg-hint">Xaritadagi ko'k nuqta — siz turgan joy. Shu joy admin saytga yuboriladi.</p>

          <div className="mt-4">
            <MyMap me={position} />
          </div>

          {position && (
            <p
              className={`mt-3 flex items-start gap-1.5 text-sm ${position.accuracy > POOR_ACCURACY ? "text-amber-600" : "text-tg-hint"}`}
            >
              <MapPinIcon className="mt-0.5 size-4" />
              <span>
                {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)} · aniqlik ±{Math.round(position.accuracy)} m
                {position.accuracy > POOR_ACCURACY && " — GPS past, ochiq joyga chiqib qayta aniqlang"}
              </span>
            </p>
          )}

          {locError && (
            <div className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600">
              {locError.message}
              {locError.canOpenSettings && (
                <button onClick={openLocationSettings} className="mt-3 block font-semibold underline">
                  Sozlamalarni ochish
                </button>
              )}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {position && (
              <button onClick={() => setStep("selfie")} className="w-full rounded-xl bg-tg-button py-3.5 font-semibold text-tg-button-text">
                Davom etish
              </button>
            )}
            <button
              onClick={locate}
              disabled={locating}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold disabled:opacity-60 ${
                position ? "border border-tg-hint/25 text-tg-button" : "bg-tg-button text-tg-button-text"
              }`}
            >
              {!locating && !position && <MapPinIcon />}
              {locating ? "Aniqlanmoqda…" : position ? "Qayta aniqlash" : "Joylashuvni aniqlash"}
            </button>
          </div>
        </section>
      )}

      {step === "selfie" && (
        <section className="mt-6">
          <h1 className="text-xl font-bold">O'zingizni suratga oling</h1>
          <p className="mt-1 text-sm text-tg-hint">
            Old kamera bilan, yuzingiz ovalga to'liq tushadigan qilib, yorug' joyda. Ko'zoynak va niqobsiz.
          </p>
          <div className="mt-5">
            {selfie ? (
              <img src={selfie.url} alt="" className="aspect-[3/4] w-full rounded-2xl object-cover" />
            ) : (
              <Camera facing="user" onCapture={setSelfie} />
            )}
          </div>
          {selfie && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={() => setSelfie(null)} className="rounded-xl border border-tg-hint/25 py-3.5 font-medium">
                Qayta olish
              </button>
              <button onClick={send} className="rounded-xl bg-tg-button py-3.5 font-semibold text-tg-button-text">
                Yuborish
              </button>
            </div>
          )}
          <button
            onClick={() => setStep("location")}
            className="mt-3 flex w-full items-center justify-center gap-1 py-2 text-sm text-tg-hint"
          >
            <ArrowLeftIcon className="size-4" />
            Joylashuvga qaytish
          </button>
        </section>
      )}

      {step === "send" && (
        <section className="mt-16 text-center">
          {sendError ? (
            <>
              <div className="rounded-2xl bg-red-500/10 p-4 text-sm text-red-600">{sendError}</div>
              <div className="mt-6 space-y-3">
                <button onClick={send} className="w-full rounded-xl bg-tg-button py-3.5 font-semibold text-tg-button-text">
                  Qayta yuborish
                </button>
                <button onClick={again} className="w-full rounded-xl border border-tg-hint/25 py-3.5 font-medium">
                  Boshidan boshlash
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-tg-hint/25 border-t-tg-button" />
              <p className="mt-5 text-tg-hint">Tekshirilmoqda…</p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
