// 2D-Kartenauswahl für TGT und IP (Leaflet): Klicken, Marker ziehen, Ortssuche, eigene GPS-Position.

import * as geo from "./geo.js?v=12";

const LEAFLET = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/";
const $ = (id) => document.getElementById(id);

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET + "leaflet.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = LEAFLET + "leaflet.js";
      s.onload = () => resolve(window.L);
      s.onerror = () => {
        leafletPromise = null;
        reject(new Error("Kartenbibliothek (Leaflet) konnte nicht geladen werden"));
      };
      document.head.appendChild(s);
    });
  }
  return leafletPromise;
}

/** Aktuelle Geräteposition (GPS/WLAN) als {lat, lon, accuracy}. */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject(new Error("Standort nur über HTTPS verfügbar"));
    if (!navigator.geolocation) return reject(new Error("Standortbestimmung wird nicht unterstützt"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "Standortzugriff verweigert (Browser-Berechtigung prüfen)"
              : e.code === 3
                ? "Zeitüberschreitung bei der Standortbestimmung"
                : "Standort nicht verfügbar",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}

function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem("ip2tgt.map." + k);
    localStorage.setItem("ip2tgt.map." + k, v);
  } catch {
    return null;
  }
}

let map = null;
let L = null;
const st = {
  active: "tgt",
  tgt: null,
  ip: null,
  ipSet: false,
  deriveIp: null,
  markers: {},
  line: null,
  lzCircle: null,
  gps: null,
  resolve: null,
};

let msgTimer;
function msg(text, err = false) {
  const el = $("mapMsg");
  el.textContent = text;
  el.classList.toggle("err", err);
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (el.textContent = ""), 6000);
}

function icon(kind) {
  return L.divIcon({
    className: "map-pin " + kind,
    html: `<div class="pin"><span>${kind === "tgt" ? "LZ" : "IP"}</span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
}

function initMap() {
  map = L.map("map", { zoomControl: true, attributionControl: true, worldCopyJump: true });
  const esri = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 20, maxNativeZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" },
  );
  const labels = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 20, maxNativeZoom: 19 },
  );
  const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    subdomains: "abc",
    attribution: "© OpenStreetMap-Mitwirkende, SRTM | © OpenTopoMap (CC-BY-SA)",
  });
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap-Mitwirkende",
  });
  const bases = {
    Luftbild: L.layerGroup([esri, labels]),
    Topografisch: topo,
    OpenStreetMap: osm,
  };
  (bases[store("layer")] || bases.Luftbild).addTo(map);
  L.control.layers(bases, null, { position: "topright" }).addTo(map);
  map.on("baselayerchange", (e) => store("layer", e.name));
  L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

  st.line = L.polyline([], { color: "#42e3a0", weight: 3, dashArray: "10 8", opacity: 0.95 }).addTo(map);
  st.lzCircle = L.circle([0, 0], { radius: 25, color: "#ff5c7a", weight: 2, fill: false }).addTo(map);

  map.on("click", (e) => setPoint(st.active, { lat: e.latlng.lat, lon: e.latlng.lng }));
  map.on("mousemove", (e) => {
    $("mapCursor").textContent = `Cursor: ${geo.toMgrs(e.latlng.lat, e.latlng.lng)}`;
  });
  map.on("mouseout", () => ($("mapCursor").textContent = ""));
}

function setActive(which) {
  st.active = which;
  document.querySelectorAll("#mapActive button").forEach((b) => b.classList.toggle("on", b.dataset.v === which));
  $("mapHint").textContent =
    which === "tgt"
      ? "Klick in die Karte setzt die Landezone (TGT). Marker lassen sich verschieben."
      : "Klick in die Karte setzt den IP. Marker lassen sich verschieben.";
}

function setPoint(which, p) {
  if (which === "tgt") st.tgt = p;
  else {
    st.ip = p;
    st.ipSet = true;
  }
  render();
}

function render() {
  if (!st.ipSet && st.deriveIp && st.tgt) st.ip = st.deriveIp(st.tgt);
  for (const kind of ["tgt", "ip"]) {
    const p = st[kind];
    let m = st.markers[kind];
    if (!p) {
      if (m) {
        map.removeLayer(m);
        delete st.markers[kind];
      }
      continue;
    }
    if (!m) {
      m = L.marker([p.lat, p.lon], {
        icon: icon(kind),
        draggable: true,
        autoPan: true,
        zIndexOffset: kind === "tgt" ? 1000 : 0,
      });
      m.on("drag", (e) => {
        const ll = e.target.getLatLng();
        if (kind === "tgt") st.tgt = { lat: ll.lat, lon: ll.lng };
        else {
          st.ip = { lat: ll.lat, lon: ll.lng };
          st.ipSet = true;
        }
        render();
      });
      m.addTo(map);
      st.markers[kind] = m;
    } else {
      const cur = m.getLatLng();
      if (Math.abs(cur.lat - p.lat) > 1e-9 || Math.abs(cur.lng - p.lon) > 1e-9) m.setLatLng([p.lat, p.lon]);
    }
    m.getElement()?.classList.toggle("derived", kind === "ip" && !st.ipSet);
  }
  if (st.tgt) st.lzCircle.setLatLng([st.tgt.lat, st.tgt.lon]);
  st.lzCircle.setStyle({ opacity: st.tgt ? 1 : 0 });
  st.line.setLatLngs(
    st.tgt && st.ip
      ? [
          [st.ip.lat, st.ip.lon],
          [st.tgt.lat, st.tgt.lon],
        ]
      : [],
  );

  $("mapTgt").textContent = st.tgt ? geo.toMgrs(st.tgt.lat, st.tgt.lon) : "— nicht gesetzt —";
  $("mapIp").textContent = st.ip
    ? geo.toMgrs(st.ip.lat, st.ip.lon) + (st.ipSet ? "" : " (berechnet)")
    : "— nicht gesetzt —";
  if (st.tgt && st.ip) {
    const inv = geo.inverse(st.ip.lat, st.ip.lon, st.tgt.lat, st.tgt.lon);
    const v = geo.magneticDeclination(st.tgt.lat, st.tgt.lon);
    $("mapLeg").textContent = `IP→TGT ${geo.fmtCourse(inv.course1 - v)}°M · ${(inv.distance / geo.NM).toFixed(2)} NM`;
  } else $("mapLeg").textContent = "";
  $("mapApply").disabled = !st.tgt;
}

function fitView() {
  const pts = [st.tgt, st.ip].filter(Boolean).map((p) => [p.lat, p.lon]);
  if (pts.length === 2) map.fitBounds(pts, { padding: [60, 60], maxZoom: 15 });
  else if (pts.length === 1) map.setView(pts[0], 14);
  else map.setView([51.1, 10.4], 6);
}

async function useGps() {
  const btn = $("mapGps");
  btn.disabled = true;
  try {
    const p = await getCurrentPosition();
    if (st.gps) st.gps.remove();
    st.gps = L.layerGroup([
      L.circle([p.lat, p.lon], { radius: p.accuracy, color: "#4aa8ff", weight: 1, fillOpacity: 0.12 }),
      L.circleMarker([p.lat, p.lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#4aa8ff", fillOpacity: 1 }),
    ]).addTo(map);
    setPoint(st.active, { lat: p.lat, lon: p.lon });
    map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15));
    msg(`Aktuelle Position als ${st.active === "tgt" ? "TGT" : "IP"} gesetzt (±${Math.round(p.accuracy)} m)`);
  } catch (e) {
    msg(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function search(q) {
  q = q.trim();
  if (!q) return;
  // Koordinate? Dann direkt setzen
  try {
    const ref = st.tgt ? geo.toMgrs(st.tgt.lat, st.tgt.lon) : undefined;
    const c = geo.parseCoordinate(q, ref);
    setPoint(st.active, { lat: c.lat, lon: c.lon });
    map.setView([c.lat, c.lon], Math.max(map.getZoom(), 14));
    return;
  } catch {
    /* kein Koordinatenformat -> Ortssuche */
  }
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&q=${encodeURIComponent(q)}`,
    );
    const res = await r.json();
    if (!res.length) return msg(`„${q}“ nicht gefunden`, true);
    const b = res[0].boundingbox.map(Number);
    map.fitBounds(
      [
        [b[0], b[2]],
        [b[1], b[3]],
      ],
      { maxZoom: 15 },
    );
  } catch {
    msg("Ortssuche nicht erreichbar", true);
  }
}

let bound = false;
function bindUi() {
  if (bound) return;
  bound = true;
  $("mapActive").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) setActive(b.dataset.v);
  });
  $("mapGps").addEventListener("click", useGps);
  $("mapSearch").addEventListener("submit", (e) => {
    e.preventDefault();
    search($("mapSearchInput").value);
  });
  const close = (result) => {
    $("mapDlg").close();
    const r = st.resolve;
    st.resolve = null;
    r && r(result);
  };
  $("mapCancel").addEventListener("click", () => close(null));
  $("mapClose").addEventListener("click", () => close(null));
  $("mapDlg").addEventListener("cancel", (e) => {
    e.preventDefault();
    close(null);
  });
  $("mapApply").addEventListener("click", () => close({ tgt: st.tgt, ip: st.ipSet ? st.ip : null }));
}

/**
 * Öffnet die Kartenauswahl.
 * opts: {tgt, ip, active: "tgt"|"ip", deriveIp(tgt) (Kurs-&-Distanz-Modus), gps: true = sofort eigene Position}
 * Ergebnis: Promise<{tgt, ip|null}> oder null bei Abbruch.
 */
export async function openMapPicker(opts) {
  L = await loadLeaflet();
  bindUi();
  st.tgt = opts.tgt || null;
  st.ip = opts.ip || null;
  st.ipSet = !!opts.ip && !opts.deriveIp;
  st.deriveIp = opts.deriveIp || null;
  $("mapSearchInput").value = "";
  $("mapMsg").textContent = "";
  $("mapDlg").showModal();
  if (!map) initMap();
  setActive(opts.active || "tgt");
  map.invalidateSize();
  render();
  fitView();
  if (opts.gps) useGps();
  return new Promise((resolve) => (st.resolve = resolve));
}
