// Gemeinsame Luftbild-Helfer für Plate und Kartenauswahl:
// Bing Maps Aerial über Cesium ion, Erkennung leerer Ersatzkacheln (z. B. von Proxys).

const Cesium = window.Cesium;

let bingProv = null;
let bingDown = 0; // Zeitpunkt, bis zu dem Bing als nicht erreichbar gilt

/** Bing-Luftbildkachel (Web Mercator x/y/z) als Canvas oder null */
export async function bingTile(x, y, z, onErr = () => {}) {
  if (Date.now() < bingDown) return null;
  let p;
  try {
    if (!bingProv) bingProv = Cesium.IonImageryProvider.fromAssetId(2);
    p = await bingProv;
  } catch (e) {
    // ion nicht erreichbar: 60 s nicht erneut versuchen (sonst hunderte Wartezeiten)
    bingProv = null;
    bingDown = Date.now() + 60000;
    onErr(e?.message || String(e));
    return null;
  }
  try {
    const im = await p.requestImage(x, y, z);
    return im ? toCanvas(im) : null;
  } catch (e) {
    onErr(e?.message || String(e));
    return null;
  }
}

/** Cesium liefert ImageBitmaps für WebGL vertikal gespiegelt (flipY) -> als Canvas zurückspiegeln */
export function toCanvas(im) {
  if (typeof ImageBitmap !== "undefined" && im instanceof ImageBitmap) {
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const g = c.getContext("2d");
    g.translate(0, c.height);
    g.scale(1, -1);
    g.drawImage(im, 0, 0);
    return c;
  }
  return im;
}

const probe = document.createElement("canvas");
probe.width = probe.height = 16;
const pctx = probe.getContext("2d", { willReadFrequently: true });

/** true, wenn die Kachel praktisch einfarbig ist (Sperr-/Platzhalterbild statt Luftbild) */
export function isBlankImage(im) {
  try {
    pctx.clearRect(0, 0, 16, 16);
    pctx.drawImage(im, 0, 0, 16, 16);
    const d = pctx.getImageData(0, 0, 16, 16).data;
    let s = 0,
      s2 = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      s += l;
      s2 += l * l;
    }
    return s2 / n - (s / n) ** 2 < 4;
  } catch {
    return false;
  }
}
