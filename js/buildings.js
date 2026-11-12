// 3D-Gebäude ohne API-Schlüssel: OpenStreetMap-Grundrisse via Overpass API, extrudiert.

const Cesium = window.Cesium;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const DEFAULT_HEIGHT = {
  house: 7,
  detached: 7,
  residential: 9,
  apartments: 14,
  terrace: 8,
  garage: 3,
  garages: 3,
  shed: 3,
  hut: 3,
  cabin: 4,
  roof: 4,
  carport: 3,
  industrial: 10,
  warehouse: 10,
  commercial: 12,
  retail: 8,
  office: 15,
  church: 18,
  cathedral: 30,
  chapel: 9,
  school: 11,
  hospital: 18,
  hangar: 14,
  farm: 8,
  farm_auxiliary: 7,
  barn: 8,
  greenhouse: 4,
  stable: 6,
  service: 4,
  transformer_tower: 6,
  silo: 18,
  tower: 25,
  water_tower: 25,
  bunker: 4,
};

/** Zahl aus OSM-Tag (z. B. "12 m", "40'", "3,5") in Metern */
export function parseNum(v) {
  if (v == null) return NaN;
  const m = String(v)
    .replace(",", ".")
    .match(/[\d.]+/);
  if (!m) return NaN;
  let x = parseFloat(m[0]);
  if (/ft|'/.test(v)) x *= 0.3048;
  return x;
}

function parseHeight(tags) {
  const num = parseNum;
  let h = num(tags.height);
  if (!isFinite(h)) {
    const lv = num(tags["building:levels"]);
    if (isFinite(lv)) h = lv * 3.0 + (isFinite(num(tags["roof:levels"])) ? num(tags["roof:levels"]) * 2 : 1.5);
  }
  if (!isFinite(h)) h = DEFAULT_HEIGHT[tags.building] ?? 8;
  return Math.min(Math.max(h, 2.5), 400);
}

export function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0],
      xi = ring[i][1],
      yj = ring[j][0],
      xj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Overpass-Abfrage mit Ausweich-Servern. onTry(host) meldet den aktuellen Server. */
// ---------------------------------------------------------------------------
// Overpass mit Zwischenspeicher und gestaffelten Parallelanfragen
// ---------------------------------------------------------------------------

const memCache = new Map(); // Abfrage -> Promise (auch laufende Anfragen werden geteilt)
const CACHE_NAME = "ip2tgt-osm-v1";
const CACHE_TTL = 14 * 864e5; // OSM-Daten 14 Tage wiederverwenden
const STAGGER_MS = 8000; // so lange auf einen Server warten, bevor zusätzlich der nächste gefragt wird

function hashStr(s) {
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}

async function cacheGet(q) {
  try {
    if (!window.caches) return null;
    const c = await caches.open(CACHE_NAME);
    const r = await c.match(`https://cache.ip2tgt/overpass/${hashStr(q)}`);
    if (!r) return null;
    if (Date.now() - Number(r.headers.get("x-saved") || 0) > CACHE_TTL) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function cachePut(q, data) {
  try {
    if (!window.caches) return;
    const c = await caches.open(CACHE_NAME);
    await c.put(
      `https://cache.ip2tgt/overpass/${hashStr(q)}`,
      new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json", "x-saved": String(Date.now()) },
      }),
    );
  } catch {
    /* Speicher voll oder nicht verfügbar – dann eben ohne */
  }
}

/** Eine Runde: Server gestaffelt starten; die erste gültige Antwort gewinnt, die übrigen werden abgebrochen */
function overpassRound(q, onTry, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ctrls = [];
    let next = 0,
      failed = 0,
      done = false,
      lastErr = null,
      stagger = null;
    const launch = () => {
      if (done || next >= ENDPOINTS.length) return;
      const ep = ENDPOINTS[next++];
      clearTimeout(stagger);
      stagger = setTimeout(launch, STAGGER_MS);
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      onTry(new URL(ep).host);
      fetch(ep, {
        method: "POST",
        body: "data=" + encodeURIComponent(q),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: ctrl.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          if (data.remark && /error|timed out|out of memory/i.test(data.remark)) throw new Error(data.remark);
          return data;
        })
        .then((data) => {
          clearTimeout(timer);
          if (done) return;
          done = true;
          clearTimeout(stagger);
          ctrls.forEach((c) => c !== ctrl && c.abort());
          resolve(data);
        })
        .catch((e) => {
          clearTimeout(timer);
          if (done) return;
          lastErr = e;
          if (++failed >= ENDPOINTS.length) {
            done = true;
            clearTimeout(stagger);
            reject(lastErr);
          } else launch(); // Fehler -> sofort den nächsten Server fragen
        });
    };
    launch();
  });
}

export function overpassQuery(q, onTry = () => {}, timeoutMs = 60000) {
  if (!memCache.has(q)) {
    const p = (async () => {
      const cached = await cacheGet(q);
      if (cached) return cached;
      let data;
      try {
        data = await overpassRound(q, onTry, timeoutMs);
      } catch {
        // Overpass begrenzt Anfragen pro Nutzer (HTTP 429): kurz warten, ein zweites Mal
        await new Promise((r) => setTimeout(r, 3000));
        data = await overpassRound(q, onTry, timeoutMs);
      }
      cachePut(q, data);
      return data;
    })();
    memCache.set(q, p);
    p.catch(() => memCache.delete(q));
  }
  return memCache.get(q);
}

/** Overpass-Abfrage für Gebäude im Polygon (Array [lat, lon]) */
export function buildingQuery(polygon) {
  const poly = polygon.map(([la, lo]) => `${la.toFixed(6)} ${lo.toFixed(6)}`).join(" ");
  return `[out:json][timeout:40];(way["building"](poly:"${poly}");relation["building"]["type"="multipolygon"](poly:"${poly}"););out geom qt 20000;`;
}

/**
 * Lädt Gebäude innerhalb des Polygons (Array [lat, lon]).
 * sampleGround(points[{lat,lon}]) -> Promise<number[]> liefert Bodenhöhen (Szenen-Höhensystem).
 * opts.build3d = false: nur Grundrisse (ohne 3D-Körper), z. B. für die Approach Plate;
 * ohne sampleGround auch ohne Bodenhöhen.
 */
export async function loadOsmBuildings(polygon, sampleGround, onStatus = () => {}, opts = {}) {
  const data = await overpassQuery(buildingQuery(polygon), (host) => onStatus(`OSM-Gebäude werden geladen (${host}) …`));

  const footprints = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    let rings = [];
    if (el.type === "way" && el.geometry) rings = [el.geometry];
    else if (el.type === "relation" && el.members)
      rings = el.members.filter((m) => m.role === "outer" && m.geometry).map((m) => m.geometry);
    for (const g of rings) {
      const ring = g.map((p) => [p.lat, p.lon]);
      if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
        ring.pop();
      if (ring.length < 3) continue;
      let la = 0,
        lo = 0;
      let minLa = 90,
        maxLa = -90,
        minLo = 180,
        maxLo = -180;
      for (const [a, b] of ring) {
        la += a;
        lo += b;
        minLa = Math.min(minLa, a);
        maxLa = Math.max(maxLa, a);
        minLo = Math.min(minLo, b);
        maxLo = Math.max(maxLo, b);
      }
      footprints.push({
        ring,
        centroid: { lat: la / ring.length, lon: lo / ring.length },
        bbox: [minLa, minLo, maxLa, maxLo],
        height: parseHeight(tags),
      });
    }
  }
  if (!footprints.length) return { primitive: null, footprints };

  if (sampleGround) {
    onStatus(`${footprints.length} Gebäude – Bodenhöhen werden bestimmt …`);
    const grounds = await sampleGround(footprints.map((f) => f.centroid));
    footprints.forEach((f, i) => {
      f.base = grounds[i] ?? 0;
      f.top = f.base + f.height;
    });
  }
  if (opts.build3d === false) return { primitive: null, footprints };

  const instances = [];
  footprints.forEach((f, i) => {
    const flat = [];
    for (const [a, b] of f.ring) flat.push(b, a);
    const shade = 0.72 + (((i * 2654435761) % 1000) / 1000) * 0.18;
    try {
      instances.push(
        new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
            height: f.base - 3,
            extrudedHeight: f.top,
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(
              new Cesium.Color(shade, shade * 0.97, shade * 0.93, 1),
            ),
          },
        }),
      );
    } catch {
      /* defekte Geometrie überspringen */
    }
  });
  const primitive = new Cesium.Primitive({
    geometryInstances: instances,
    appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
    asynchronous: true,
    shadows: Cesium.ShadowMode.ENABLED,
  });
  return { primitive, footprints };
}

/** Höchster Gebäudepunkt an den Profilpunkten (oder -Infinity) */
export function obstacleHeights(points, footprints) {
  return points.map((p) => {
    let h = -Infinity;
    for (const f of footprints) {
      const b = f.bbox;
      if (p.lat < b[0] || p.lat > b[2] || p.lon < b[1] || p.lon > b[3]) continue;
      if (pointInRing(p.lat, p.lon, f.ring)) h = Math.max(h, f.top);
    }
    return h;
  });
}
