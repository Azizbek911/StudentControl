import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "./icons";

const MAX_SIDE = 1280;
const QUALITY = 0.85;

export interface Photo {
  blob: Blob;
  url: string;
}

/** Rasmni JPEG ga (uzun tomoni ko'pi bilan 1280 px) */
function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Rasm olinmadi"))), "image/jpeg", QUALITY),
  );
}

/**
 * Jonli kamera (getUserMedia): rasm faqat shu yerda, shu paytda olinadi — galereyadan tanlab bo'lmaydi.
 * Kamera ochilmasa (eski Telegram) — telefonning kamera ilovasi (input capture) ishlatiladi.
 */
export default function Camera({
  facing,
  onCapture,
}: {
  facing: "user" | "environment";
  onCapture: (photo: Photo) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia yo'q");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch (e) {
        console.warn("Kamera ochilmadi:", e);
        setFallback(true);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    try {
      const blob = await toJpeg(v, v.videoWidth, v.videoHeight);
      onCapture({ blob, url: URL.createObjectURL(blob) });
    } finally {
      setBusy(false);
    }
  }

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const blob = await toJpeg(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      onCapture({ blob, url: URL.createObjectURL(blob) });
    } finally {
      setBusy(false);
    }
  }

  if (fallback) {
    return (
      <label className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-tg-hint/40 bg-tg-card p-6 text-center">
        <CameraIcon className="size-12 text-tg-hint" strokeWidth={1.75} />
        <span className="font-semibold">{busy ? "Tayyorlanmoqda…" : "Kamerani ochish"}</span>
        <span className="text-xs text-tg-hint">Ilova ichida kamera ochilmadi — telefon kamerasi bilan suratga oling</span>
        <input
          type="file"
          accept="image/*"
          capture={facing}
          className="hidden"
          onChange={(e) => fromFile(e.target.files?.[0])}
        />
      </label>
    );
  }

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
      />
      {facing === "user" && ready && (
        // Yuzni joylashtirish uchun oval
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[62%] w-[62%] rounded-[50%] border-4 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Kamera ochilmoqda…</div>
      )}
      <button
        type="button"
        onClick={capture}
        disabled={!ready || busy}
        aria-label="Suratga olish"
        className="absolute bottom-5 left-1/2 h-18 w-18 -translate-x-1/2 rounded-full border-4 border-white bg-white/30 backdrop-blur transition active:scale-90 disabled:opacity-40"
      />
    </div>
  );
}
