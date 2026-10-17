// IP2TGT – Hauptanwendung: UI, Szenen-Setup, Kameras, Simulationsschleife.

import * as geo from "./geo.js?v=7";
import { TerrariumTerrainProvider, sampleTerrarium } from "./terrain.js?v=7";
import { getHelicopterDef } from "./models.js?v=7";
import { buildTrajectory, pathPoints, smoothGroundProfile } from "./flight.js?v=7";
import { VisualMode } from "./nvg.js?v=7";
import { Hud } from "./hud.js?v=7";
import { mountCockpit, moveCockpit } from "./cockpit.js?v=7";
import { loadOsmBuildings, obstacleHeights } from "./buildings.js?v=7";
import { loadObstacles } from "./obstacles.js?v=7";
import { openMapPicker, getCurrentPosition } from "./mappicker.js?v=7";

const Cesium = window.Cesium;
const { NM, FT, KT } = geo;
const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// ---------------------------------------------------------------------------
// Persistenz
// ---------------------------------------------------------------------------

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("ip2tgt." + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("ip2tgt." + k, JSON.stringify(v));
    } catch {
      /* privat / blockiert */
    }
  },
};

// Mobilgeräte: weniger GPU-Last (kein MSAA, kleinerer Kachel-Cache)
const isMobile =
  window.matchMedia?.("(pointer: coarse)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

const DEFAULTS = {
  tgt: "32U NB 20005 62607",
  ip: "32U NB 12937 56630",
  approachMode: "ip",
  course: 90,
  courseRef: "mag",
  dist: 5,
  distUnit: "nm",
  agl: 100,
  gs: 80,
  decel: 0.5,
  leadIn: 0.5,
  hoverH: 10,
  descRate: 2,
  obstacles: true,
  heli: "CH53",
  source: "standard",
  imagery: "esri",
  quality: isMobile ? "low" : "normal",
  buildings: true,
  shadows: true,
  routeShow: true,
  trees: true,
  obstShow: true,
  forestHeight: 22,
};
const cfg = Object.assign({}, DEFAULTS, store.get("cfg", {}));
const keys = { ion: store.get("ionToken", ""), google: store.get("googleKey", "") };

// Mission aus URL-Hash (teilbarer Link)
(function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const map = {
    tgt: "tgt",
    ip: "ip",
    crs: "course",
    dist: "dist",
    alt: "agl",
    gs: "gs",
    heli: "heli",
    mode: "approachMode",
    ref: "courseRef",
    unit: "distUnit",
    dec: "decel",
    lead: "leadIn",
  };
  let any = false;
  for (const [k, c] of Object.entries(map)) {
    if (h.has(k)) {
      const v = h.get(k);
      cfg[c] = typeof DEFAULTS[c] === "number" ? parseFloat(v) : v;
      any = true;
    }
  }
  if (any && !h.has("ip") && h.has("crs")) cfg.approachMode = "course";
})();

const saveCfg = () => store.set("cfg", cfg);

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

if (keys.ion) Cesium.Ion.defaultAccessToken = keys.ion;

const viewer = new Cesium.Viewer("cesium", {
  baseLayer: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  scene3DOnly: true,
  msaaSamples: isMobile ? 1 : 4,
  shadows: false,
});
const scene = viewer.scene;
const globe = scene.globe;
const camera = scene.camera;
globe.depthTestAgainstTerrain = true;
globe.tileCacheSize = isMobile ? 250 : 600;
globe.preloadSiblings = !isMobile;
globe.baseColor = Cesium.Color.fromCssColorString("#1b2229");
scene.fog.enabled = true;
scene.highDynamicRange = false;
camera.frustum.near = 0.2;
scene.screenSpaceCameraController.minimumZoomDistance = 3;
viewer.shadowMap.softShadows = true;
viewer.shadowMap.size = 2048;
viewer.shadowMap.maximumDistance = 1200;
viewer.clock.shouldAnimate = false;

const visual = new VisualMode(viewer);
const hud = new Hud($("hud"));

// ---------------------------------------------------------------------------
// UI-Hilfen
// ---------------------------------------------------------------------------

let toastTimer;
function toast(msg, err = false, ms = 4200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("err", err);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
function loading(title, text) {
  if (title === false) {
    $("loading").hidden = true;
    return;
  }
  $("loading").hidden = false;
  if (title) $("loadTitle").textContent = title;
  $("loadText").textContent = text || "";
}
function segInit(id, key, onChange) {
  const el = $(id);
  const set = (v) => {
    el.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  };
  set(String(cfg[key] ?? ""));
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    set(b.dataset.v);
    if (key) {
      cfg[key] = b.dataset.v;
      saveCfg();
    }
    onChange && onChange(b.dataset.v);
  });
  return set;
}

// ---------------------------------------------------------------------------
// Geodaten-Quellen
// ---------------------------------------------------------------------------

const QUALITY = {
  low: { sse: 3, sse3d: 24, res: 0.85, msaa: 1 },
  normal: { sse: 1.8, sse3d: 12, res: 1, msaa: isMobile ? 1 : 4 },
  high: { sse: 1.2, sse3d: 6, res: Math.min(window.devicePixelRatio || 1, 2), msaa: isMobile ? 2 : 4 },
};
const data = { source: null, tileset: null, osm: null, osmFootprints: [], geoidN: 0 };

function applyQuality() {
  const q = QUALITY[cfg.quality] || QUALITY.normal;
  globe.maximumScreenSpaceError = q.sse;
  viewer.resolutionScale = q.res;
  scene.msaaSamples = q.msaa;
  if (data.tileset) data.tileset.maximumScreenSpaceError = q.sse3d;
}

function esriProvider() {
  return new Cesium.UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: new Cesium.Credit("Luftbild: Esri, Maxar, Earthstar Geographics, GIS User Community"),
  });
}

async function addImagery() {
  viewer.imageryLayers.removeAll();
  let provider;
  if (cfg.imagery === "bing" && keys.ion) {
    try {
      provider = await Cesium.IonImageryProvider.fromAssetId(2);
    } catch (e) {
      toast("Bing-Luftbild nicht verfügbar – Esri wird verwendet.", true);
    }
  }
  viewer.imageryLayers.addImageryProvider(provider || esriProvider());
}

async function setupData() {
  if (data.tileset) {
    scene.primitives.remove(data.tileset);
    data.tileset = null;
  }
  globe.show = true;
  const src = cfg.source;
  try {
    if (src === "google") {
      if (!keys.google && !keys.ion)
        throw new Error("Für Google 3D Tiles wird ein Google-API-Key oder ein Cesium-ion-Token benötigt.");
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      await addImagery();
      data.tileset = await Cesium.createGooglePhotorealistic3DTileset(
        { key: keys.google || undefined, onlyUsingWithGoogleGeocoder: true },
        { maximumScreenSpaceError: QUALITY[cfg.quality].sse3d, shadows: Cesium.ShadowMode.RECEIVE_ONLY },
      );
      scene.primitives.add(data.tileset);
      globe.show = false;
    } else if (src === "ion") {
      if (!keys.ion) throw new Error("Für Cesium ion wird ein Access Token benötigt.");
      viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true });
      await addImagery();
      if (cfg.buildings) {
        data.tileset = await Cesium.createOsmBuildingsAsync();
        scene.primitives.add(data.tileset);
      }
    } else {
      viewer.terrainProvider = new TerrariumTerrainProvider();
      await addImagery();
    }
    data.source = src;
  } catch (e) {
    console.error(e);
    toast(`${e.message || e} – Standard-Geodaten werden verwendet.`, true, 7000);
    cfg.source = "standard";
    $("source").value = "standard";
    viewer.terrainProvider = new TerrariumTerrainProvider();
    await addImagery();
    data.source = "standard";
  }
  if (data.osm) data.osm.show = data.source === "standard" && cfg.buildings;
  applyQuality();
}

// ---------------------------------------------------------------------------
// Missionsberechnung
// ---------------------------------------------------------------------------

let mission = null;

function readNumber(id, def) {
  const v = parseFloat($(id).value);
  return isFinite(v) ? v : def;
}

function computeMission() {
  const res = { ok: false };
  const tgtStr = $("tgtInput").value.trim();
  let tgt;
  try {
    tgt = geo.parseCoordinate(tgtStr);
    $("tgtInput").classList.remove("err");
    $("tgtInput").classList.add("ok");
    $("tgtMeta").innerHTML = coordMeta(tgt);
  } catch (e) {
    $("tgtInput").classList.toggle("err", !!tgtStr);
    $("tgtInput").classList.remove("ok");
    $("tgtMeta").innerHTML = tgtStr ? `<span class="e">${e.message}</span>` : "";
    $("summary").innerHTML = "";
    res.error = "Landezone: " + e.message;
    return res;
  }
  const variation = geo.magneticDeclination(tgt.lat, tgt.lon);
  let ip, courseTrue, dist;
  if (cfg.approachMode === "ip") {
    const ipStr = $("ipInput").value.trim();
    try {
      ip = geo.parseCoordinate(ipStr, geo.toMgrs(tgt.lat, tgt.lon));
      $("ipInput").classList.remove("err");
      $("ipInput").classList.add("ok");
      $("ipMeta").innerHTML = coordMeta(ip);
    } catch (e) {
      $("ipInput").classList.toggle("err", !!ipStr);
      $("ipInput").classList.remove("ok");
      $("ipMeta").innerHTML = ipStr
        ? `<span class="e">${e.message}</span>`
        : `<span>Kein IP? → „Kurs &amp; Distanz“ wählen</span>`;
      $("summary").innerHTML = "";
      res.error = ipStr ? "IP: " + e.message : "Bitte IP eingeben oder Kurs & Distanz wählen.";
      return res;
    }
    const inv = geo.inverse(ip.lat, ip.lon, tgt.lat, tgt.lon);
    courseTrue = inv.course1;
    dist = inv.distance;
  } else {
    const c = readNumber("courseInput", 0);
    courseTrue = geo.norm360(cfg.courseRef === "mag" ? c + variation : c);
    const d = readNumber("distInput", 5);
    dist = d * (cfg.distUnit === "km" ? 1000 : NM);
    const p = geo.direct(tgt.lat, tgt.lon, courseTrue + 180, dist);
    ip = { lat: p.lat, lon: p.lon, type: "DERIVED" };
    $("ipDerived").innerHTML =
      `IP (berechnet): <b>${geo.toMgrs(ip.lat, ip.lon)}</b><br>${geo.formatDDM(ip.lat, ip.lon)}`;
  }
  if (dist < 300) {
    res.error = "IP und TGT liegen zu nah beieinander (< 300 m).";
    $("summary").innerHTML = `<span class="chip" style="color:var(--danger)">${res.error}</span>`;
    return res;
  }
  if (dist > 150000) {
    res.error = "Entfernung IP–TGT > 80 NM – bitte prüfen.";
    $("summary").innerHTML = `<span class="chip" style="color:var(--danger)">${res.error}</span>`;
    return res;
  }

  const leadIn = Math.max(0, readNumber("leadIn", 0.5)) * NM;
  const start = leadIn > 1 ? geo.direct(ip.lat, ip.lon, courseTrue + 180, leadIn) : { lat: ip.lat, lon: ip.lon };
  const inv2 = geo.inverse(start.lat, start.lon, tgt.lat, tgt.lon);
  const gs = readNumber("gsNum", 80) * KT;
  const decel = Math.min(readNumber("decel", 0.5) * NM, dist * 0.9);
  const ete = (dist - decel) / gs + (2 * decel) / gs;
  const courseMag = geo.norm360(courseTrue - variation);

  $("summary").innerHTML = [
    `<span class="chip"><label>KURS</label>${geo.fmtCourse(courseMag)}°M · ${geo.fmtCourse(courseTrue)}°T</span>`,
    `<span class="chip"><label>DIST</label>${(dist / NM).toFixed(2)} NM · ${(dist / 1000).toFixed(2)} km</span>`,
    `<span class="chip"><label>ETE</label>${geo.fmtTime(ete)}</span>`,
    `<span class="chip"><label>VAR</label>${Math.abs(variation).toFixed(1)}°${variation >= 0 ? "E" : "W"}</span>`,
    `<span class="chip" id="elevChip"><label>LZ ELEV</label>…</span>`,
  ].join("");
  updateElevation(tgt);

  Object.assign(res, {
    ok: true,
    tgt,
    ip,
    start,
    courseTrue,
    courseMag,
    variation,
    dist,
    leadIn,
    courseStart: inv2.course1,
    length: inv2.distance,
    gs,
    decel,
    agl: readNumber("aglNum", 100) * FT,
    hoverH: readNumber("hoverH", 10) * FT,
    descRate: readNumber("descRate", 2) * FT,
  });
  return res;
}

let elevSeq = 0;
async function updateElevation(tgt) {
  const seq = ++elevSeq;
  try {
    const [h] = await sampleTerrarium([tgt], 14);
    if (seq !== elevSeq) return;
    const el = $("elevChip");
    if (el) el.innerHTML = `<label>LZ ELEV</label>${Math.round(h / FT)} ft`;
  } catch {
    const el = $("elevChip");
    if (el) el.innerHTML = `<label>LZ ELEV</label>—`;
  }
}

function coordMeta(c) {
  const mg = geo.toMgrs(c.lat, c.lon);
  if (c.type === "MGRS") return `<b>${mg}</b> · ${geo.formatDDM(c.lat, c.lon)}`;
  return `<b>${geo.formatDDM(c.lat, c.lon)}</b> · ${mg}`;
}

// ---------------------------------------------------------------------------
// Route & Marker
// ---------------------------------------------------------------------------

const routeEntities = [];
function clearRoute() {
  routeEntities.forEach((e) => viewer.entities.remove(e));
  routeEntities.length = 0;
}

function drawRoute(m) {
  clearRoute();
  if (!m || !m.ok || !cfg.routeShow) return;
  const add = (e) => routeEntities.push(viewer.entities.add(e));
  const pos = (p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat);
  const labelStyle = (text, color) => ({
    text,
    font: '700 13px "JetBrains Mono", monospace',
    fillColor: color,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 4,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -14),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    showBackground: false,
  });
  const cTgt = Cesium.Color.fromCssColorString("#ff5c7a");
  const cIp = Cesium.Color.fromCssColorString("#ffb347");
  const cRoute = Cesium.Color.fromCssColorString("#42e3a0");
  add({
    polyline: {
      positions: [pos(m.start), pos(m.ip), pos(m.tgt)],
      clampToGround: true,
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({ color: cRoute.withAlpha(0.9), dashLength: 24 }),
    },
  });
  // LZ-Kreis (Radius 25 m)
  const ring = [];
  for (let a = 0; a <= 360; a += 10) {
    const p = geo.direct(m.tgt.lat, m.tgt.lon, a, 25);
    ring.push(pos(p));
  }
  add({ polyline: { positions: ring, clampToGround: true, width: 3, material: cTgt } });
  add({
    name: "marker",
    position: pos(m.tgt),
    point: {
      pixelSize: 9,
      color: cTgt,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: labelStyle("LZ", cTgt),
  });
  add({
    name: "marker",
    position: pos(m.ip),
    point: {
      pixelSize: 9,
      color: cIp,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: labelStyle("IP", cIp),
  });
}

function flyToOverview(m, duration = 1.6) {
  if (!m || !m.ok) return;
  // Mittelpunkt der Route, Radius = halbe Länge; Panel links berücksichtigen
  const mid = geo.direct(m.start.lat, m.start.lon, m.courseStart, m.length / 2);
  const radius = Math.max(m.length / 2, 600);
  const center = Cesium.Cartesian3.fromDegrees(mid.lon, mid.lat, 300);
  const w = scene.canvas.clientWidth || 1,
    h = scene.canvas.clientHeight || 1;
  const fovx = camera.frustum.fov;
  const fovy = w >= h ? 2 * Math.atan(Math.tan(fovx / 2) * (h / w)) : fovx;
  const panelW = $("panel").classList.contains("closed") || w < 860 ? 0 : 430;
  const usableFovX = 2 * Math.atan(Math.tan(fovx / 2) * ((w - panelW) / w));
  const pitch = -42 * DEG;
  const range = (radius / Math.sin(Math.min(usableFovX, fovy / Math.max(Math.sin(-pitch), 0.5)) / 2)) * 1.05;
  camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, radius), {
    duration,
    offset: new Cesium.HeadingPitchRange(m.courseTrue * DEG, pitch, range),
    complete: () => {
      if (panelW) {
        const visW = 2 * range * Math.tan(fovx / 2);
        camera.moveLeft((panelW / 2 / w) * visW);
      }
    },
  });
}

let missionTimer;
function onMissionInput() {
  clearTimeout(missionTimer);
  missionTimer = setTimeout(() => {
    mission = computeMission();
    if (!sim.traj) drawRoute(mission);
    saveInputs();
  }, 250);
}

function saveInputs() {
  cfg.tgt = $("tgtInput").value;
  cfg.ip = $("ipInput").value;
  cfg.course = readNumber("courseInput", cfg.course);
  cfg.dist = readNumber("distInput", cfg.dist);
  cfg.agl = readNumber("aglNum", cfg.agl);
  cfg.gs = readNumber("gsNum", cfg.gs);
  cfg.decel = readNumber("decel", cfg.decel);
  cfg.leadIn = readNumber("leadIn", cfg.leadIn);
  cfg.hoverH = readNumber("hoverH", cfg.hoverH);
  cfg.descRate = readNumber("descRate", cfg.descRate);
  cfg.obstacles = $("obstacles").checked;
  cfg.forestHeight = readNumber("forestHeight", cfg.forestHeight);
  saveCfg();
}

// ---------------------------------------------------------------------------
// Hubschrauber (3 Modelle: Rumpf + Rotoren)
// ---------------------------------------------------------------------------

let heli = null;
let heliLoading = null;

function ensureHeli(type) {
  if (heli && heli.type === type) return Promise.resolve(heli);
  if (heliLoading && heliLoading.type === type) return heliLoading.promise;
  const promise = loadHeli(type).finally(() => {
    if (heliLoading && heliLoading.promise === promise) heliLoading = null;
  });
  heliLoading = { type, promise };
  return promise;
}

async function loadHeli(type) {
  if (heliLoading && heliLoading.type !== type) await heliLoading.promise.catch(() => {});
  if (heli) {
    heli.models.forEach((m) => scene.primitives.remove(m));
    heli = null;
  }
  const def = getHelicopterDef(type);
  const load = (glb, shadows = Cesium.ShadowMode.ENABLED) =>
    Cesium.Model.fromGltfAsync({
      url: URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" })),
      upAxis: Cesium.Axis.Z,
      forwardAxis: Cesium.Axis.X,
      shadows,
      show: false,
    });
  const body = await load(def.body);
  // Rotoren werfen keinen Schatten (die transparente Rotorscheibe würde sonst eine volle Scheibe abbilden)
  const rotors = await Promise.all(def.rotors.map((r) => load(r.glb, Cesium.ShadowMode.DISABLED)));
  [body, ...rotors].forEach((m) => scene.primitives.add(m));
  heli = { type, def, body, rotors, models: [body, ...rotors] };
  mountCockpit($("cockpit"), def.cockpitStyle);
  return heli;
}

const scratch = {
  enu: new Cesium.Matrix4(),
  rot: new Cesium.Matrix3(),
  m3: new Cesium.Matrix3(),
  m4: new Cesium.Matrix4(),
  body: new Cesium.Matrix4(),
  c3: new Cesium.Cartesian3(),
};

function bodyRotation(headingDeg, pitchDeg, rollDeg) {
  // Rz(90° - Kurs) · Ry(-Nick) · Rx(Roll) im ENU-System (x vorne, y links, z oben)
  const Rz = Cesium.Matrix3.fromRotationZ((90 - headingDeg) * DEG);
  const Ry = Cesium.Matrix3.fromRotationY(-pitchDeg * DEG);
  const Rx = Cesium.Matrix3.fromRotationX(rollDeg * DEG);
  const r = Cesium.Matrix3.multiply(Rz, Ry, new Cesium.Matrix3());
  return Cesium.Matrix3.multiply(r, Rx, r);
}

function updateHeliMatrices(st, simT) {
  const pos = Cesium.Cartesian3.fromDegrees(st.lon, st.lat, st.alt);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos, undefined, scratch.enu);
  const R = bodyRotation(st.heading, st.pitch, st.roll);
  const body = Cesium.Matrix4.multiply(
    enu,
    Cesium.Matrix4.fromRotationTranslation(R, Cesium.Cartesian3.ZERO),
    scratch.body,
  );
  if (!heli) return { pos, body };
  heli.body.modelMatrix = body;
  heli.def.rotors.forEach((r, i) => {
    const omega = (r.rpm / 60) * 2 * Math.PI * r.dir;
    let local = Cesium.Matrix3.IDENTITY;
    if (r.axis === "z") {
      local = Cesium.Matrix3.multiply(
        Cesium.Matrix3.fromRotationY((r.tiltDeg || 0) * DEG),
        Cesium.Matrix3.fromRotationZ(omega * simT + (r.phase || 0)),
        new Cesium.Matrix3(),
      );
    } else {
      local = Cesium.Matrix3.multiply(
        Cesium.Matrix3.fromRotationX(-(r.cantDeg || 0) * DEG),
        Cesium.Matrix3.fromRotationY(omega * simT),
        new Cesium.Matrix3(),
      );
    }
    const hubM = Cesium.Matrix4.fromRotationTranslation(local, Cesium.Cartesian3.fromArray(r.hub));
    heli.rotors[i].modelMatrix = Cesium.Matrix4.multiply(body, hubM, new Cesium.Matrix4());
  });
  return { pos, body };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
const sim = {
  traj: null,
  t: 0,
  playing: false,
  speedIdx: 2,
  last: performance.now(),
  view: "cockpit",
  hudOn: true,
  tube: false,
  head: { yaw: 0, pitch: -6, fov: 75 },
  orbit: { yaw: 25, pitch: 14, range: 70 },
  lzFov: 55,
  gTGT: 0,
  ralt: 0,
  raltT: 0,
  prevAlt: null,
  prevT: 0,
  vs: 0,
  frame: 0,
  lastSt: null,
  geoidN: 0,
};

function excludes() {
  return heli ? heli.models : [];
}

async function sampleGroundForMission(m, pts, onStatus) {
  // Bodenhöhen im Höhensystem der Szene + Hindernisse
  onStatus("Gelände-Höhenprofil (AWS Terrain Tiles) …");
  const terr = await sampleTerrarium(pts, 14);
  let ground = terr.slice();
  let obstacles = new Array(pts.length).fill(-Infinity);
  let N = 0;
  const cartos = () => pts.map((p) => Cesium.Cartographic.fromDegrees(p.lon, p.lat));

  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Zeitüberschreitung")), ms))]);

  if (data.source === "ion") {
    onStatus("Cesium World Terrain – Höhenprofil …");
    const cs = cartos();
    await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cs);
    ground = cs.map((c, i) => (isFinite(c.height) ? c.height : terr[i]));
    const diffs = ground.map((g, i) => g - terr[i]).sort((a, b) => a - b);
    N = diffs[Math.floor(diffs.length / 2)];
    if (cfg.obstacles && data.tileset) {
      onStatus("OSM Buildings – Hindernisse entlang der Route …");
      try {
        const step = Math.max(1, Math.round(pts.length / 600));
        const sub = cartos().filter((_, i) => i % step === 0);
        const res = await withTimeout(scene.sampleHeightMostDetailed(sub, excludes()), 45000);
        res.forEach((c, k) => {
          if (c && isFinite(c.height)) {
            for (let j = k * step; j < Math.min((k + 1) * step, pts.length); j++)
              obstacles[j] = Math.max(obstacles[j], c.height);
          }
        });
      } catch (e) {
        console.warn("Hindernisabfrage", e);
      }
    }
  } else if (data.source === "google") {
    onStatus("Google 3D Tiles – Oberfläche entlang der Route (kann etwas dauern) …");
    try {
      const step = Math.max(1, Math.round(pts.length / 500));
      const idx = pts.map((_, i) => i).filter((i) => i % step === 0 || i === pts.length - 1);
      const sub = idx.map((i) => Cesium.Cartographic.fromDegrees(pts[i].lon, pts[i].lat));
      const res = await withTimeout(scene.sampleHeightMostDetailed(sub, excludes()), 90000);
      const diffs = [];
      res.forEach((c, k) => {
        if (c && isFinite(c.height)) diffs.push(c.height - terr[idx[k]]);
      });
      diffs.sort((a, b) => a - b);
      N = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
      ground = terr.map((t) => t + N);
      res.forEach((c, k) => {
        if (!c || !isFinite(c.height)) return;
        for (let j = idx[k]; j < Math.min(idx[k] + step, pts.length); j++) {
          if (cfg.obstacles) obstacles[j] = Math.max(obstacles[j], c.height);
          else ground[j] = Math.min(ground[j], c.height);
        }
      });
      // LZ selbst: tatsächliche Oberfläche
      const last = res[res.length - 1];
      if (last && isFinite(last.height)) ground[pts.length - 1] = last.height;
    } catch (e) {
      console.warn("Google-Höhen", e);
      toast("3D-Tiles-Höhen nicht vollständig verfügbar – Geländemodell wird verwendet.", true);
    }
  } else if (cfg.buildings || cfg.obstacles) {
    // Standard: OSM-Gebäude via Overpass
    try {
      await loadStandardBuildings(m, onStatus);
      if (cfg.obstacles && data.osmFootprints.length) {
        obstacles = obstacleHeights(pts, data.osmFootprints);
      }
    } catch (e) {
      console.warn("Overpass", e);
      toast("OSM-Gebäude konnten nicht geladen werden (Overpass). Flug ohne Gebäude.", true, 6000);
    }
  }
  // Leitungen, Masten, Windräder und Bäume (OSM) – in allen Datenquellen
  const wantTrees = cfg.trees && data.source !== "google"; // Google 3D Tiles enthalten Bewuchs bereits
  if (cfg.obstShow || wantTrees) {
    try {
      await loadMissionObstacles(m, N, wantTrees, onStatus);
      if (cfg.obstacles && data.obst) {
        const oh = data.obst.profile(pts);
        obstacles = obstacles.map((x, i) => Math.max(x, oh[i]));
      }
    } catch (e) {
      console.warn("Hindernisse", e);
      toast("Hindernisse/Bäume konnten nicht geladen werden (Overpass). Flug ohne diese Daten.", true, 6000);
    }
  }
  return { ground, obstacles, N };
}

let obstKey = null;
async function loadMissionObstacles(m, N, trees, onStatus) {
  const key = [m.start.lat, m.start.lon, m.tgt.lat, m.tgt.lon, trees, cfg.obstShow, cfg.forestHeight, data.source]
    .map(String)
    .join(",");
  if (obstKey === key && data.obst) return;
  if (data.obst) {
    data.obst.destroy();
    data.obst = null;
  }
  data.obst = await loadObstacles(scene, m, {
    trees,
    obstacles: cfg.obstShow,
    forestHeight: cfg.forestHeight,
    mobile: isMobile,
    shadows: cfg.shadows && !isMobile,
    sampleGround: (p) => sampleTerrarium(p, 14).then((h) => h.map((x) => x + N)),
    onStatus,
  });
  obstKey = key;
  const c = data.obst.counts;
  console.info(`Hindernisse: ${c.obstacles} Masten/Objekte, ${c.spans} Spannfelder, ${c.trees} Bäume`);
}

let osmKey = null;
async function loadStandardBuildings(m, onStatus) {
  const key = `${m.start.lat.toFixed(5)},${m.start.lon.toFixed(5)},${m.tgt.lat.toFixed(5)},${m.tgt.lon.toFixed(5)}`;
  if (osmKey === key && data.osm) {
    data.osm.show = cfg.buildings;
    return;
  }
  if (data.osm) {
    scene.primitives.remove(data.osm);
    data.osm = null;
    data.osmFootprints = [];
  }
  // Korridor: ±300 m entlang der Route, 900 m um die LZ
  const c = m.courseStart;
  const L = m.length;
  const tgtSide = Math.max(L - 1100, 0);
  const at = (s, off, side) => {
    const p = geo.direct(m.start.lat, m.start.lon, c, s);
    return off ? geo.direct(p.lat, p.lon, c + side * 90, off) : p;
  };
  const sFrom = Math.max(0, L - 20000);
  const poly = [];
  poly.push(at(sFrom, 300, -1), at(tgtSide, 300, -1), at(Math.max(L - 700, 0), 900, -1));
  for (let a = -90; a <= 90; a += 15) {
    const p = geo.direct(m.tgt.lat, m.tgt.lon, c + a, 900);
    poly.push(p);
  }
  poly.push(at(Math.max(L - 700, 0), 900, 1), at(tgtSide, 300, 1), at(sFrom, 300, 1));
  const res = await loadOsmBuildings(
    poly.map((p) => [p.lat, p.lon]),
    (pts) => sampleTerrarium(pts, 14),
    onStatus,
  );
  data.osmFootprints = res.footprints;
  if (res.primitive) {
    data.osm = scene.primitives.add(res.primitive);
    data.osm.show = cfg.buildings;
  }
  osmKey = key;
}

async function startMission() {
  saveInputs();
  mission = computeMission();
  if (!mission.ok) {
    toast(mission.error || "Eingaben prüfen", true);
    return;
  }
  const m = mission;
  $("startBtn").disabled = true;
  setPlaying(false);
  try {
    loading("Mission wird vorbereitet", "Geodaten werden initialisiert …");
    if (data.source !== cfg.source) await setupData();
    await ensureHeli(cfg.heli);
    heli.models.forEach((x) => (x.show = false));

    const ds = clamp(m.length / 1500, 15, 60);
    const pts = pathPoints(m.start, m.courseStart, m.length, ds);
    const { ground, obstacles, N } = await sampleGroundForMission(m, pts, (t) => loading(null, t));
    sim.geoidN = N;
    loading(null, "Flugbahn wird berechnet …");
    const raw = Float64Array.from(ground.map((g, i) => Math.max(g, obstacles[i])));
    // Die LZ selbst gilt als hindernisfrei
    const G = smoothGroundProfile(raw, ds, m.gs);
    sim.gTGT = sim.gTGT0 = ground[ground.length - 1];
    sim.traj = buildTrajectory({
      start: m.start,
      courseStart: m.courseStart,
      length: m.length,
      sIP: m.leadIn,
      gs: m.gs,
      agl: m.agl,
      decelDist: m.decel,
      hoverH: m.hoverH,
      hoverTime: 3,
      descentRate: m.descRate,
      profile: { ds, ground: raw, G },
      gTGT: sim.gTGT,
    });
    sim.mission = m;
    sim.tgtCarto = Cesium.Cartographic.fromDegrees(m.tgt.lon, m.tgt.lat);
    sim.t = 0;
    sim.prevAlt = null;
    sim.lift = 0;
    sim.ralt = m.agl;
    drawRoute(m);
    setSunForLocation(m.tgt);
    buildTimelineMarks();
    document.body.classList.add("sim");
    $("controls").hidden = false;
    $("telemetry").hidden = false;
    heli.models.forEach((x) => (x.show = true));
    setView(sim.view);
    // Kacheln für den Startpunkt laden lassen
    loading("Geodaten werden geladen", "Luftbilder und Gelände am Startpunkt …");
    await waitForTiles(20000, Cesium.Cartographic.fromDegrees(m.start.lon, m.start.lat), ground[0]);
    loading(false);
    closePanel();
    setPlaying(true);
    toast(
      `${heli.def.name}: Anflug ${geo.fmtCourse(m.courseMag)}°M, ${(m.dist / NM).toFixed(1)} NM, ${Math.round(m.agl / FT)} ft AGL, ${Math.round(m.gs / KT)} kt`,
    );
  } catch (e) {
    console.error(e);
    loading(false);
    toast("Fehler: " + (e.message || e), true, 8000);
  } finally {
    $("startBtn").disabled = false;
  }
}

// Wartet, bis die Kacheln am Startpunkt geladen sind und das gerenderte Gelände
// dem Höhenprofil entspricht (sonst würde der Flug in einer groben Kachel „stecken“).
function waitForTiles(maxMs, carto, expected) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let calm = 0;
    const check = () => {
      const loaded = globe.show ? globe.tilesLoaded : data.tileset ? data.tileset.tilesLoaded : true;
      let near = true;
      if (globe.show && carto && isFinite(expected)) {
        const h = globe.getHeight(carto);
        near = isFinite(h) && Math.abs(h - expected) < 15;
      }
      calm = loaded && near ? calm + 1 : 0;
      if (calm > 8 || performance.now() - t0 > maxMs) resolve();
      else requestAnimationFrame(check);
    };
    setTimeout(check, 400);
  });
}

function setSunForLocation(p) {
  const now = new Date();
  // ca. 10:30 Uhr Ortszeit (Sonnenzeit) für gut sichtbare Schatten
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + (10.5 - p.lon / 15) * 3600e3;
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(ms));
}

function buildTimelineMarks() {
  const tr = sim.traj;
  const el = $("marks");
  const mk = (t, l, cls = "") =>
    `<i class="${cls}" style="left:${((t / tr.total) * 100).toFixed(2)}%" data-l="${l}"></i>`;
  el.innerHTML =
    (tr.times.ip > 0.5 ? mk(tr.times.ip, "IP") : "") +
    mk(tr.times.decel, "DEC", "dec") +
    mk(tr.times.hover, "HOV", "dec");
  $("totalLbl").textContent = geo.fmtTime(tr.total);
}

function setPlaying(p) {
  sim.playing = p && !!sim.traj;
  if (sim.playing && sim.traj && sim.t >= sim.traj.total - 0.01) sim.t = 0;
  $("playBtn").textContent = sim.playing ? "❚❚" : "▶";
  sim.last = performance.now();
}

function setSpeed(idx) {
  sim.speedIdx = clamp(idx, 0, SPEEDS.length - 1);
  $("speedLbl").textContent = `${SPEEDS[sim.speedIdx]}×`;
}

// ---------------------------------------------------------------------------
// Kameras
// ---------------------------------------------------------------------------

let setViewSeg;
function setView(v) {
  sim.view = v;
  setViewSeg && setViewSeg(v);
  document.body.classList.remove("view-cockpit", "view-chase", "view-lz", "view-free");
  document.body.classList.add("view-" + v);
  scene.screenSpaceCameraController.enableInputs = v === "free" || !sim.traj;
  if (v !== "free") camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  updateTube();
  updateRouteVisibility();
}

function updateRouteVisibility() {
  // Im Cockpit zeigt das HUD die Marker – Beschriftungen am Boden ausblenden
  routeEntities.forEach((e) => {
    if (e.label) e.label.show = !(sim.view === "cockpit" && sim.hudOn);
  });
}

function setCameraFov(deg) {
  camera.frustum.fov = clamp(deg, 15, 110) * DEG;
}

function pxPerDegree() {
  const c = scene.canvas;
  const w = c.clientWidth,
    h = c.clientHeight;
  const fr = camera.frustum;
  const fovy = fr.fovy ?? fr.fov;
  const f = h / 2 / Math.tan(fovy / 2);
  return { f, w, h, ppd: f * Math.tan(DEG) };
}

function project(world) {
  const { f, w, h } = pxPerDegree();
  const v = Cesium.Cartesian3.subtract(world, camera.positionWC, new Cesium.Cartesian3());
  const x = Cesium.Cartesian3.dot(v, camera.rightWC);
  const y = Cesium.Cartesian3.dot(v, camera.upWC);
  const z = Cesium.Cartesian3.dot(v, camera.directionWC);
  if (z <= 0.5) return { x: w / 2 + x * 1000, y: h / 2 - y * 1000, visible: false };
  return { x: w / 2 + (f * x) / z, y: h / 2 - (f * y) / z, visible: true };
}

function updateCamera(st, mats) {
  const v = sim.view;
  if (v === "free") return;
  if (v === "cockpit") {
    setCameraFov(sim.head.fov);
    const eye = Cesium.Matrix4.multiplyByPoint(
      mats.body,
      Cesium.Cartesian3.fromArray(heli.def.eye),
      new Cesium.Cartesian3(),
    );
    const look = Cesium.Matrix3.multiply(
      Cesium.Matrix3.fromRotationZ(-sim.head.yaw * DEG),
      Cesium.Matrix3.fromRotationY(-sim.head.pitch * DEG),
      new Cesium.Matrix3(),
    );
    const dirB = Cesium.Matrix3.multiplyByVector(look, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
    const upB = Cesium.Matrix3.multiplyByVector(look, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    const direction = Cesium.Matrix4.multiplyByPointAsVector(mats.body, dirB, new Cesium.Cartesian3());
    const up = Cesium.Matrix4.multiplyByPointAsVector(mats.body, upB, new Cesium.Cartesian3());
    camera.setView({ destination: eye, orientation: { direction, up } });
    return;
  }
  let camPos, target;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(mats.pos);
  if (v === "chase") {
    setCameraFov(60);
    const az = (st.heading + 180 + sim.orbit.yaw) * DEG;
    const el = sim.orbit.pitch * DEG;
    const r = sim.orbit.range;
    const off = new Cesium.Cartesian3(
      r * Math.cos(el) * Math.sin(az),
      r * Math.cos(el) * Math.cos(az),
      r * Math.sin(el) + 3,
    );
    camPos = Cesium.Matrix4.multiplyByPoint(enu, off, new Cesium.Cartesian3());
    target = Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(0, 0, 3), new Cesium.Cartesian3());
  } else {
    // LZ-Beobachter: 45 m links der Anflugachse, 15 m vor der LZ
    setCameraFov(sim.lzFov);
    const m = sim.mission;
    const p0 = geo.direct(m.tgt.lat, m.tgt.lon, m.courseTrue + 180, 15);
    const p = geo.direct(p0.lat, p0.lon, m.courseTrue - 90, 45);
    sim.lzEyeCarto = Cesium.Cartographic.fromDegrees(p.lon, p.lat);
    let gh = globe.show ? globe.getHeight(sim.lzEyeCarto) : sim.lzEyeH;
    if (!isFinite(gh)) gh = sim.gTGT;
    camPos = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, gh + 1.8);
    target = Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(0, 0, 3), new Cesium.Cartesian3());
  }
  // Kamera nicht unter die Oberfläche
  const cc = Cesium.Cartographic.fromCartesian(camPos);
  const gh = globe.show ? globe.getHeight(cc) : undefined;
  if (isFinite(gh) && cc.height < gh + 2) {
    cc.height = gh + 2;
    camPos = Cesium.Cartographic.toCartesian(cc);
  }
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(target, camPos, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const upW = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(camPos, new Cesium.Cartesian3());
  const right = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(direction, upW, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
  camera.setView({ destination: camPos, orientation: { direction, up } });
}

// ---------------------------------------------------------------------------
// Frame-Update
// ---------------------------------------------------------------------------

scene.preUpdate.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min((now - sim.last) / 1000, 0.25);
  sim.last = now;
  if (!sim.traj || !heli) return;
  if (sim.playing) {
    sim.t += dt * SPEEDS[sim.speedIdx];
    if (sim.t >= sim.traj.total) {
      sim.t = sim.traj.total;
      setPlaying(false);
    }
  }
  sim.frame++;
  const st = sim.traj.sample(sim.t, sim.gTGT);
  // Sicherheitsnetz: liegt das gerenderte Gelände (z. B. noch grobe Kachel) über der
  // geplanten Flughöhe, wird die Darstellung sanft angehoben statt „unter die Erde“ zu fliegen.
  let lift = 0;
  if (globe.show && st.phaseIndex < 3) {
    const gr = globe.getHeight(Cesium.Cartographic.fromDegrees(st.lon, st.lat));
    if (isFinite(gr)) lift = Math.max(0, gr + Math.max(3, 0.5 * st.agl) - st.alt);
  }
  sim.lift = (sim.lift || 0) + (lift - (sim.lift || 0)) * Math.min(1, dt * (lift > sim.lift ? 6 : 1.5));
  if (sim.lift > 0.05) st.alt += sim.lift;
  sim.lastSt = st;
  const mats = updateHeliMatrices(st, sim.t);

  const inCockpit = sim.view === "cockpit";
  heli.body.show = !inCockpit;
  heli.rotors.forEach((r) => (r.show = !inCockpit));
  updateCamera(st, mats);

  // Steig-/Sinkrate (gefiltert)
  if (sim.prevAlt != null && sim.t !== sim.prevT) {
    const vs = (((st.alt - sim.prevAlt) / (sim.t - sim.prevT)) * 60) / FT;
    if (isFinite(vs)) sim.vs += (vs - sim.vs) * 0.1;
  }
  sim.prevAlt = st.alt;
  sim.prevT = sim.t;
});

// Höhenabfragen außerhalb des Render-Durchlaufs (10 Hz):
// Radarhöhe, Bodenhöhe der LZ (endgültige Kachelauflösung) und LZ-Beobachter.
function safeSampleHeight(carto) {
  try {
    return scene.sampleHeightSupported ? scene.sampleHeight(carto, excludes()) : undefined;
  } catch {
    return undefined;
  }
}
setInterval(() => {
  const st = sim.lastSt;
  if (!sim.traj || !st) return;
  const carto = Cesium.Cartographic.fromDegrees(st.lon, st.lat);
  let g = safeSampleHeight(carto);
  if (!isFinite(g) && globe.show) g = globe.getHeight(carto);
  const r = isFinite(g) ? st.alt - g : NaN;
  // unplausible Messung (Loch/fehlende Kachel) -> geplante Höhe über Grund
  sim.ralt = isFinite(r) && r > -5 && r < 1500 ? Math.max(0, r) : Math.max(0, st.alt - st.groundRef);

  if (st.distToGo < 1500) {
    let h = globe.show ? globe.getHeight(sim.tgtCarto) : safeSampleHeight(sim.tgtCarto);
    if (globe.show && data.osm && data.osm.show) {
      // Gebäudegrundfläche direkt an der LZ? Dann nicht auf das Dach setzen.
      const hs = safeSampleHeight(sim.tgtCarto);
      if (isFinite(hs) && isFinite(h) && Math.abs(hs - h) < 1.5) h = hs;
    }
    // Nur kleine Korrekturen gegenüber dem geplanten Wert zulassen (Schutz vor fehlerhaften Kacheln)
    if (isFinite(h) && Math.abs(h - sim.gTGT0) < 15) sim.gTGT += (h - sim.gTGT) * (sim.playing ? 0.35 : 1);
  }
  if (sim.view === "lz" && !globe.show && sim.lzEyeCarto) {
    const h = safeSampleHeight(sim.lzEyeCarto);
    if (isFinite(h)) sim.lzEyeH = h;
  }
}, 100);

scene.postRender.addEventListener(() => {
  if (!sim.traj || !sim.lastSt) {
    hud.clear();
    return;
  }
  const st = sim.lastSt;
  const m = sim.mission;
  const tr = sim.traj;
  const { ppd, w, h } = pxPerDegree();

  if (sim.view === "cockpit") {
    const vb = Math.max(w / 1600, h / 900);
    moveCockpit($("cockpit"), sim.head.yaw, sim.head.pitch, ppd / vb);
  }

  const showHud = sim.hudOn && (sim.view === "cockpit" || sim.view === "chase");
  if (sim.frame % 5 === 0) updateTelemetry(st);
  $("timeline").value = String(Math.round((sim.t / tr.total) * 1000));
  $("timeLbl").textContent = geo.fmtTime(sim.t);
  if (!showHud) {
    hud.clear();
    return;
  }
  const tgtW = Cesium.Cartesian3.fromDegrees(m.tgt.lon, m.tgt.lat, sim.gTGT + 1);
  const ipW = Cesium.Cartesian3.fromDegrees(m.ip.lon, m.ip.lat, st.groundRef);
  const fut = tr.sample(Math.min(sim.t + 2.5, tr.total), sim.gTGT);
  const fpvW = Cesium.Cartesian3.fromDegrees(fut.lon, fut.lat, fut.alt + (heli.def.eye[2] - 0));
  const brg = geo.inverse(st.lat, st.lon, m.tgt.lat, m.tgt.lon).course1;
  let message = null;
  if (tr.times.ip > 0.5 && sim.t > tr.times.ip && sim.t < tr.times.ip + 4) message = "IP – KURS HALTEN";
  else if (sim.t > tr.times.decel && sim.t < tr.times.decel + 3) message = "VERZÖGERN";
  else if (sim.t > tr.times.landed && sim.t < tr.times.landed + 5) message = "TOUCHDOWN";
  // Hindernisse voraus (Warnung + Symbole im HUD)
  let hazard = null;
  const hazardMarks = [];
  if (data.obst && cfg.obstShow) {
    for (const hz of data.obst.hazards) {
      const ahead = hz.s - st.s;
      if (ahead < -30) continue;
      if (ahead > 4000) break;
      // Leitungskreuzungen und Objekte direkt auf der Route; Masten neben der Route nur als Symbol
      const close = hz.kind === "wire" || Math.abs(hz.v || 0) < (hz.kind === "tower" ? 60 : 150);
      if (!hazard && close && ahead > 80 && ahead < 2800)
        hazard = { ...hz, dist: ahead, aglFt: (hz.top - hz.ground) / FT };
      if (hazardMarks.length < 8 && ahead > 0 && ahead < 2500)
        hazardMarks.push({
          screen: project(Cesium.Cartesian3.fromDegrees(hz.lon, hz.lat, hz.top)),
          label: hz.label,
          aglFt: (hz.top - hz.ground) / FT,
          est: hz.est,
        });
    }
  }
  hud.draw({
    hazard,
    hazardMarks,
    st: { ...st, heading: st.heading - m.variation },
    full: sim.view === "cockpit",
    nvg: visual.mode === "nvg",
    ralt: sim.ralt,
    altMsl: st.alt - sim.geoidN,
    vs: sim.vs,
    ete: Math.max(0, tr.times.hover - sim.t),
    bearingTgt: brg - m.variation,
    pxPerDeg: ppd,
    headYaw: sim.view === "cockpit" ? sim.head.yaw : 0,
    headPitch: sim.view === "cockpit" ? sim.head.pitch : 0,
    aglCmdFt: st.agl / FT,
    tgtScreen: project(tgtW),
    ipScreen: project(ipW),
    fpvScreen: sim.view === "cockpit" ? project(fpvW) : null,
    message,
  });
});

function updateTelemetry(st) {
  const m = sim.mission;
  $("tPhase").textContent = st.phase;
  $("tGs").textContent = Math.round(st.gs / KT);
  $("tRalt").textContent = Math.round(sim.ralt / FT);
  $("tAlt").textContent = Math.round((st.alt - sim.geoidN) / FT);
  $("tHdg").textContent = geo.fmtCourse(st.heading - m.variation);
  $("tDist").textContent = (st.distToGo / NM).toFixed(2);
  $("tEte").textContent = geo.fmtTime(Math.max(0, sim.traj.times.hover - sim.t));
}

function updateTube() {
  const on = sim.tube && visual.mode === "nvg" && sim.view === "cockpit";
  document.body.classList.toggle("tube", on);
  if (on) {
    const { f } = pxPerDegree();
    document.body.style.setProperty("--tube-r", `${Math.round(f * Math.tan(20 * DEG))}px`);
  }
  $("tubeBtn").classList.toggle("on", sim.tube);
}

// ---------------------------------------------------------------------------
// Maus / Touch / Tastatur
// ---------------------------------------------------------------------------

const canvas = viewer.canvas;
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (sim.view === "free" || !sim.traj) return;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (sim.view === "cockpit") {
    const k = sim.head.fov / Math.max(canvas.clientWidth, 1);
    sim.head.yaw = clamp(sim.head.yaw - dx * k, -160, 160);
    sim.head.pitch = clamp(sim.head.pitch + dy * k, -70, 60);
  } else if (sim.view === "chase") {
    sim.orbit.yaw = (sim.orbit.yaw - dx * 0.3) % 360;
    sim.orbit.pitch = clamp(sim.orbit.pitch + dy * 0.25, -5, 85);
  }
});
const endDrag = () => (drag = null);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener(
  "wheel",
  (e) => {
    if (sim.view === "free" || !sim.traj) return;
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.001);
    if (sim.view === "cockpit") {
      sim.head.fov = clamp(sim.head.fov * k, 20, 110);
      updateTube();
    } else if (sim.view === "chase") sim.orbit.range = clamp(sim.orbit.range * k, 18, 1500);
    else sim.lzFov = clamp(sim.lzFov * k, 8, 90);
  },
  { passive: false },
);
canvas.addEventListener("dblclick", () => resetLook());

function resetLook() {
  if (sim.view === "cockpit") Object.assign(sim.head, { yaw: 0, pitch: -6, fov: 75 });
  if (sim.view === "chase") Object.assign(sim.orbit, { yaw: 25, pitch: 14, range: 70 });
  if (sim.view === "lz") sim.lzFov = 55;
  updateTube();
}

window.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, select, textarea, dialog")) return;
  const k = e.key;
  if (k === " ") {
    e.preventDefault();
    setPlaying(!sim.playing);
  } else if (k === "1") setView("cockpit");
  else if (k === "2") setView("chase");
  else if (k === "3") setView("lz");
  else if (k === "4") setView("free");
  else if (k === "n" || k === "N") setMode(visual.mode === "nvg" ? "day" : "nvg");
  else if (k === "h" || k === "H") toggleHud();
  else if (k === "t" || k === "T") toggleTube();
  else if (k === "r" || k === "R") resetLook();
  else if (k === "f" || k === "F") toggleFullscreen();
  else if (k === "p" || k === "P") togglePanel();
  else if (k === "+" || k === "=") setSpeed(sim.speedIdx + 1);
  else if (k === "-") setSpeed(sim.speedIdx - 1);
  else if (k === "Home") {
    sim.t = 0;
    setPlaying(true);
  } else if (sim.view === "cockpit" && k.startsWith("Arrow")) {
    e.preventDefault();
    if (k === "ArrowLeft") sim.head.yaw -= 10;
    if (k === "ArrowRight") sim.head.yaw += 10;
    if (k === "ArrowUp") sim.head.pitch += 5;
    if (k === "ArrowDown") sim.head.pitch -= 5;
  }
});

// ---------------------------------------------------------------------------
// Koordinatenwahl: 2D-Karte und eigene Position (GPS)
// ---------------------------------------------------------------------------

function tryParse(str, ref) {
  try {
    const c = geo.parseCoordinate(str, ref && geo.toMgrs(ref.lat, ref.lon));
    return { lat: c.lat, lon: c.lon };
  } catch {
    return null;
  }
}

// Im Modus „Kurs & Distanz“ wird der IP aus dem TGT abgeleitet
function deriveIpFn() {
  if (cfg.approachMode !== "course") return null;
  return (tgt) => {
    const c = readNumber("courseInput", 0);
    const crs = cfg.courseRef === "mag" ? c + geo.magneticDeclination(tgt.lat, tgt.lon) : c;
    const d = readNumber("distInput", 5) * (cfg.distUnit === "km" ? 1000 : NM);
    const p = geo.direct(tgt.lat, tgt.lon, crs + 180, d);
    return { lat: p.lat, lon: p.lon };
  };
}

async function pickOnMap(which, gps = false) {
  if (sim.traj) exitSim();
  const tgt = tryParse($("tgtInput").value);
  const ip = cfg.approachMode === "ip" ? tryParse($("ipInput").value, tgt) : null;
  let res;
  try {
    res = await openMapPicker({ tgt, ip, active: which, deriveIp: deriveIpFn(), gps });
  } catch (e) {
    toast(e.message, true);
    return;
  }
  if (!res) return;
  if (res.tgt) $("tgtInput").value = geo.toMgrs(res.tgt.lat, res.tgt.lon);
  if (res.ip) {
    $("ipInput").value = geo.toMgrs(res.ip.lat, res.ip.lon);
    if (cfg.approachMode !== "ip") {
      cfg.approachMode = "ip";
      setApproachSeg("ip");
      showApproachMode("ip");
    }
  }
  saveInputs();
  mission = computeMission();
  drawRoute(mission);
  flyToOverview(mission);
}

async function useGpsFor(which, btn) {
  btn.disabled = true;
  try {
    const p = await getCurrentPosition();
    $(which === "tgt" ? "tgtInput" : "ipInput").value = geo.toMgrs(p.lat, p.lon);
    if (sim.traj) exitSim();
    saveInputs();
    mission = computeMission();
    drawRoute(mission);
    if (mission.ok) flyToOverview(mission);
    toast(`Aktuelle Position als ${which === "tgt" ? "TGT" : "IP"} übernommen (±${Math.round(p.accuracy)} m)`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

function exitSim() {
  setPlaying(false);
  sim.traj = null;
  sim.lastSt = null;
  if (heli) heli.models.forEach((m) => (m.show = false));
  document.body.classList.remove("sim", "tube", "view-cockpit", "view-chase", "view-lz");
  $("controls").hidden = true;
  $("telemetry").hidden = true;
  scene.screenSpaceCameraController.enableInputs = true;
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  hud.clear();
  drawRoute(mission);
}

// ---------------------------------------------------------------------------
// Steuerelemente
// ---------------------------------------------------------------------------

function setMode(mode) {
  visual.set(mode);
  setModeSeg(mode);
  viewer.shadows = cfg.shadows && mode === "day";
  updateTube();
}
function toggleHud() {
  sim.hudOn = !sim.hudOn;
  document.body.classList.toggle("hud-on", sim.hudOn);
  $("hudBtn").classList.toggle("on", sim.hudOn);
  updateRouteVisibility();
}
function toggleTube() {
  sim.tube = !sim.tube;
  if (sim.tube && visual.mode !== "nvg") setMode("nvg");
  updateTube();
}
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}
function closePanel() {
  $("panel").classList.add("closed");
  $("panelOpen").hidden = false;
}
function openPanel() {
  $("panel").classList.remove("closed");
  $("panelOpen").hidden = true;
}
function togglePanel() {
  $("panel").classList.contains("closed") ? openPanel() : closePanel();
}

// Eingaben initialisieren
$("tgtInput").value = cfg.tgt;
$("ipInput").value = cfg.ip;
$("courseInput").value = cfg.course;
$("distInput").value = cfg.dist;
$("decel").value = cfg.decel;
$("leadIn").value = cfg.leadIn;
$("hoverH").value = cfg.hoverH;
$("descRate").value = cfg.descRate;
$("obstacles").checked = cfg.obstacles;
$("source").value = cfg.source;
$("imagery").value = cfg.imagery;
$("quality").value = cfg.quality;
$("buildings").checked = cfg.buildings;
$("shadows").checked = cfg.shadows;
$("routeShow").checked = cfg.routeShow;
$("trees").checked = cfg.trees;
$("obstShow").checked = cfg.obstShow;
$("forestHeight").value = cfg.forestHeight;

function bindSlider(rangeId, numId, key) {
  const r = $(rangeId),
    n = $(numId);
  r.value = n.value = cfg[key];
  r.addEventListener("input", () => {
    n.value = r.value;
    onMissionInput();
  });
  n.addEventListener("input", () => {
    if (isFinite(parseFloat(n.value))) r.value = n.value;
    onMissionInput();
  });
}
bindSlider("agl", "aglNum", "agl");
bindSlider("gs", "gsNum", "gs");

const showApproachMode = (v) => {
  $("ipBlock").hidden = v !== "ip";
  $("courseBlock").hidden = v !== "course";
  onMissionInput();
};
const setApproachSeg = segInit("approachMode", "approachMode", showApproachMode);
showApproachMode(cfg.approachMode);
segInit("courseRef", "courseRef", onMissionInput);
segInit("distUnit", "distUnit", onMissionInput);
segInit("heliType", "heli");
setViewSeg = segInit("viewSel", null, (v) => setView(v));
const setModeSeg = segInit("modeSel", null, (v) => setMode(v));
setViewSeg("cockpit");
setModeSeg("day");

[
  "tgtInput",
  "ipInput",
  "courseInput",
  "distInput",
  "decel",
  "leadIn",
  "hoverH",
  "descRate",
  "obstacles",
  "forestHeight",
].forEach((id) => $(id).addEventListener("input", onMissionInput));
document.querySelectorAll(".pick").forEach((b) => b.addEventListener("click", () => pickOnMap(b.dataset.pick)));
document.querySelectorAll(".gps").forEach((b) => b.addEventListener("click", () => useGpsFor(b.dataset.gps, b)));

$("source").addEventListener("change", async (e) => {
  cfg.source = e.target.value;
  saveCfg();
  if ((cfg.source === "ion" && !keys.ion) || (cfg.source === "google" && !keys.ion && !keys.google)) {
    $("keysDlg").showModal();
    return;
  }
  if (sim.traj) exitSim();
  loading("Geodaten werden umgeschaltet", "");
  await setupData();
  loading(false);
});
$("imagery").addEventListener("change", async (e) => {
  cfg.imagery = e.target.value;
  saveCfg();
  if (cfg.imagery === "bing" && !keys.ion) {
    toast("Bing-Luftbild benötigt einen Cesium-ion-Token.", true);
    $("keysDlg").showModal();
    return;
  }
  await addImagery();
});
$("quality").addEventListener("change", (e) => {
  cfg.quality = e.target.value;
  saveCfg();
  applyQuality();
});
$("buildings").addEventListener("change", (e) => {
  cfg.buildings = e.target.checked;
  saveCfg();
  if (data.osm) data.osm.show = cfg.buildings;
  if (data.source === "ion") {
    if (data.tileset && !cfg.buildings) {
      scene.primitives.remove(data.tileset);
      data.tileset = null;
    } else if (!data.tileset && cfg.buildings) {
      Cesium.createOsmBuildingsAsync().then((t) => (data.tileset = scene.primitives.add(t)));
    }
  }
});
$("shadows").addEventListener("change", (e) => {
  cfg.shadows = e.target.checked;
  saveCfg();
  viewer.shadows = cfg.shadows && visual.mode === "day";
});
for (const [id, key, group] of [
  ["trees", "trees", "trees"],
  ["obstShow", "obstShow", "obstacles"],
]) {
  $(id).addEventListener("change", (e) => {
    cfg[key] = e.target.checked;
    saveCfg();
    const loaded = data.obst && data.obst.groups[group].length;
    if (loaded) data.obst.setShow(group, cfg[key]);
    else if (cfg[key]) toast("Wird beim nächsten Anflugstart geladen.");
  });
}
$("routeShow").addEventListener("change", (e) => {
  cfg.routeShow = e.target.checked;
  saveCfg();
  drawRoute(mission);
  updateRouteVisibility();
});

$("startBtn").addEventListener("click", startMission);
$("previewBtn").addEventListener("click", () => {
  mission = computeMission();
  if (!mission.ok) return toast(mission.error, true);
  if (sim.traj) exitSim();
  drawRoute(mission);
  flyToOverview(mission);
});
$("shareBtn").addEventListener("click", async () => {
  saveInputs();
  const p = new URLSearchParams();
  p.set("tgt", cfg.tgt);
  if (cfg.approachMode === "ip") p.set("ip", cfg.ip);
  else {
    p.set("crs", cfg.course);
    p.set("ref", cfg.courseRef);
    p.set("dist", cfg.dist);
    p.set("unit", cfg.distUnit);
  }
  p.set("alt", cfg.agl);
  p.set("gs", cfg.gs);
  p.set("heli", cfg.heli);
  const url = `${location.origin}${location.pathname}#${p.toString()}`;
  history.replaceState(null, "", url);
  try {
    await navigator.clipboard.writeText(url);
    toast("Missions-Link in die Zwischenablage kopiert.");
  } catch {
    toast("Link in der Adresszeile aktualisiert.");
  }
});
$("keysBtn").addEventListener("click", () => {
  $("ionToken").value = keys.ion;
  $("googleKey").value = keys.google;
  $("keysDlg").showModal();
});
$("keysSave").addEventListener("click", () => {
  store.set("ionToken", $("ionToken").value.trim());
  store.set("googleKey", $("googleKey").value.trim());
  setTimeout(() => location.reload(), 50);
});

$("playBtn").addEventListener("click", () => setPlaying(!sim.playing));
$("restartBtn").addEventListener("click", () => {
  sim.t = 0;
  setPlaying(true);
});
$("slowerBtn").addEventListener("click", () => setSpeed(sim.speedIdx - 1));
$("fasterBtn").addEventListener("click", () => setSpeed(sim.speedIdx + 1));
$("timeline").addEventListener("input", (e) => {
  if (!sim.traj) return;
  sim.t = (parseFloat(e.target.value) / 1000) * sim.traj.total;
  sim.prevAlt = null;
});
$("hudBtn").addEventListener("click", toggleHud);
$("tubeBtn").addEventListener("click", toggleTube);
$("fsBtn").addEventListener("click", toggleFullscreen);
$("panelClose").addEventListener("click", closePanel);
$("panelOpen").addEventListener("click", openPanel);
window.addEventListener("resize", updateTube);

document.body.classList.add("hud-on");
setSpeed(2);
setMode("day");

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

(async function init() {
  loading("IP2TGT wird gestartet", "Geodaten werden initialisiert …");
  await setupData();
  loading(false);
  mission = computeMission();
  drawRoute(mission);
  if (mission.ok) flyToOverview(mission, 0);
  else camera.setView({ destination: Cesium.Cartesian3.fromDegrees(10.4, 51.1, 1200000) });
  // Modelle im Hintergrund vorbereiten
  ensureHeli(cfg.heli).catch((e) => console.error(e));
})();

// Für Tests/Debugging
window.ip2tgt = { viewer, sim, cfg, data, startMission, setView, setMode, geo };
