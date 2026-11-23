// Leaflet (xarita) CDN dan, faqat admin panelida kerak bo'lganda yuklanadi — npm paket o'rnatish shart emas.
// integrity — fayl o'zgartirilmaganini brauzer tekshiradi (sha384, leaflet@1.9.4).

const BASE = "https://unpkg.com/leaflet@1.9.4/dist";
const JS_SRI = "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH";
const CSS_SRI = "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H";

// Leaflet API dan faqat ishlatiladigan qismi uchun soddalashtirilgan tip
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Leaflet = any;

let loading: Promise<Leaflet> | null = null;

export function loadLeaflet(): Promise<Leaflet> {
  const w = window as unknown as { L?: Leaflet };
  if (w.L) return Promise.resolve(w.L);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${BASE}/leaflet.css`;
    css.integrity = CSS_SRI;
    css.crossOrigin = "";
    document.head.appendChild(css);

    const js = document.createElement("script");
    js.src = `${BASE}/leaflet.js`;
    js.integrity = JS_SRI;
    js.crossOrigin = "";
    js.onload = () => {
      w.L.Icon.Default.imagePath = `${BASE}/images/`;
      resolve(w.L);
    };
    js.onerror = () => {
      loading = null;
      reject(new Error("Xarita yuklanmadi. Internet aloqasini tekshiring."));
    };
    document.head.appendChild(js);
  });
  return loading;
}

/** Jizzax shahri markazi — standart ko'rinish */
export const DEFAULT_CENTER: [number, number] = [40.1158, 67.8422];
