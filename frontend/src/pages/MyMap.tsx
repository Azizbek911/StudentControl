import { useEffect, useRef, useState } from "react";
import { loadLeaflet, DEFAULT_CENTER, type Leaflet } from "../leaflet";
import type { Position } from "../location";

/** Talaba qayerni belgilayotganini ko'radi: ko'k nuqta + GPS aniqligi doirasi. Faqat ko'rish uchun */
export default function MyMap({ me }: { me: Position | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet>(null);
  const layer = useRef<Leaflet>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !el.current) return;
        const m = L.map(el.current, { zoomControl: false, attributionControl: false }).setView(DEFAULT_CENTER, 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m);
        layer.current = L.layerGroup().addTo(m);
        map.current = m;
        setReady(true);
        setTimeout(() => m.invalidateSize(), 150);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const L = (window as unknown as { L?: Leaflet }).L;
    const m = map.current;
    if (!ready || !L || !m || !me) return;
    layer.current.clearLayers();
    const acc = L.circle([me.latitude, me.longitude], { radius: me.accuracy, color: "#2563eb", weight: 1, fillOpacity: 0.12 }).addTo(
      layer.current,
    );
    L.circleMarker([me.latitude, me.longitude], { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 })
      .bindTooltip("Siz", { permanent: true, direction: "top", offset: [0, -8] })
      .addTo(layer.current);
    m.fitBounds(acc.getBounds(), { padding: [40, 40], maxZoom: 17 });
  }, [ready, me?.latitude, me?.longitude, me?.accuracy]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative overflow-hidden rounded-2xl border border-tg-hint/20">
      <div ref={el} className="h-56 w-full bg-tg-card" />
      {error && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-tg-hint">{error}</div>}
      {!me && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-tg-hint">
          Joylashuv aniqlangach shu yerda ko'rinadi
        </div>
      )}
    </div>
  );
}
