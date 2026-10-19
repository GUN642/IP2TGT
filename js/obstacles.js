// Luftfahrthindernisse und Vegetation aus OpenStreetMap (Overpass):
// Freileitungen (Masten + Leiterseile mit Durchhang), Sendemasten, Türme, Schornsteine,
// Windkraftanlagen, Wald/Gehölz sowie Einzelbäume und Baumreihen.
// Höhen: OSM-Tag "height" wo erfasst, sonst typische Werte (als "geschätzt" markiert).

import { overpassQuery, parseNum } from "./buildings.js?v=13";
import { treeChunkGlb } from "./models.js?v=13";

const Cesium = window.Cesium;
const DEG = Math.PI / 180;
const R_EARTH = 6371008.8;

// ---------------------------------------------------------------------------
// Lokales Routen-Koordinatensystem: u = entlang der Route ab Startpunkt, v = quer (links positiv)
// ---------------------------------------------------------------------------

function makeFrame(m) {
  const lat0 = (m.start.lat + m.tgt.lat) / 2;
  const lon0 = (m.start.lon + m.tgt.lon) / 2;
  const kx = Math.cos(lat0 * DEG) * R_EARTH * DEG;
  const ky = R_EARTH * DEG;
  const toXY = (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
  const fromXY = (x, y) => ({ lat: lat0 + y / ky, lon: lon0 + x / kx });
  const [sx, sy] = toXY(m.start.lat, m.start.lon);
  const [tx, ty] = toXY(m.tgt.lat, m.tgt.lon);
  const L = Math.hypot(tx - sx, ty - sy);
  const dx = (tx - sx) / L,
    dy = (ty - sy) / L;
  const toUV = (lat, lon) => {
    const [x, y] = toXY(lat, lon);
    return [(x - sx) * dx + (y - sy) * dy, -(x - sx) * dy + (y - sy) * dx];
  };
  const fromUV = (u, v) => fromXY(sx + u * dx - v * dy, sy + u * dy + v * dx);
  return { toUV, fromUV, L };
}

function corridorPolygon(f, W, R) {
  const pts = [];
  const uEnd = Math.max(f.L - R * 0.6, 0);
  pts.push(f.fromUV(-300, W), f.fromUV(uEnd, W));
  for (let a = 90; a >= -90; a -= 15) {
    pts.push(f.fromUV(f.L + R * Math.cos(a * DEG), R * Math.sin(a * DEG)));
  }
  pts.push(f.fromUV(uEnd, -W), f.fromUV(-300, -W));
  return pts.map((p) => `${p.lat.toFixed(6)} ${p.lon.toFixed(6)}`).join(" ");
}

// deterministische Pseudozufallszahlen
function hash01(a, b, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// OSM-Höhenangabe nur übernehmen, wenn plausibel (Tippfehler, falsche Einheiten)
const okHeight = (h) => (isFinite(h) && h > 1 && h < 360 ? h : NaN);

// ---------------------------------------------------------------------------
// Typische Höhen (falls kein height-Tag)
// ---------------------------------------------------------------------------

function maxVoltage(tags) {
  const v = String(tags.voltage || "")
    .split(/[;,]/)
    .map((x) => parseFloat(x))
    .filter(isFinite);
  return v.length ? Math.max(...v) : NaN;
}

function towerDefaultHeight(voltage, minor) {
  if (voltage >= 380000) return 60;
  if (voltage >= 220000) return 50;
  if (voltage >= 110000) return 38;
  if (voltage >= 30000) return 22;
  if (voltage >= 10000) return 15;
  return minor ? 9 : 25;
}

function pointObstacleSpec(tags) {
  const h = okHeight(parseNum(tags.height));
  const est = !isFinite(h);
  if (tags["generator:source"] === "wind" || tags["generator:method"] === "wind_turbine") {
    const hub = est ? 120 : h;
    const d = parseNum(tags["rotor:diameter"]);
    const rotorR = (isFinite(d) ? d : 115) / 2;
    return { kind: "wind", label: "WINDRAD", hub, top: hub + rotorR, rotorR, est };
  }
  if (tags.aerialway === "pylon") return { kind: "mast", label: "SEILBAHN", top: est ? 15 : h, est };
  const mm = tags.man_made;
  if (mm === "chimney") return { kind: "chimney", label: "SCHORNSTEIN", top: est ? 50 : h, est };
  if (mm === "water_tower") return { kind: "tower", label: "WASSERTURM", top: est ? 30 : h, est };
  if (mm === "mast") return { kind: "mast", label: "MAST", top: est ? 60 : h, est };
  if (mm === "communications_tower" || tags["tower:type"] === "communication")
    return { kind: "tower", label: "FUNKTURM", top: est ? 100 : h, est };
  if (mm === "tower") {
    const t = tags["tower:type"];
    if (t === "observation" || t === "lighting" || t === "cooling")
      return { kind: "tower", label: t === "cooling" ? "KÜHLTURM" : "TURM", top: est ? 30 : h, est };
    return { kind: "tower", label: "TURM", top: est ? 30 : h, est };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Geometrie
// ---------------------------------------------------------------------------

const COL = {
  steel: new Cesium.Color(0.55, 0.57, 0.6, 1),
  pole: new Cesium.Color(0.42, 0.36, 0.3, 1),
  white: new Cesium.Color(0.9, 0.9, 0.9, 1),
  red: new Cesium.Color(0.85, 0.15, 0.12, 1),
  concrete: new Cesium.Color(0.72, 0.7, 0.66, 1),
  brick: new Cesium.Color(0.55, 0.38, 0.3, 1),
  wire: new Cesium.Color(0.12, 0.12, 0.13, 0.95),
};

function enuMatrix(lat, lon, h, headingRad = 0) {
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(lon, lat, h));
  if (!headingRad) return enu;
  const rot = Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationZ(-headingRad));
  return Cesium.Matrix4.multiply(enu, rot, new Cesium.Matrix4());
}

function placed(frameM, tx, ty, tz, rot3) {
  const local = Cesium.Matrix4.fromRotationTranslation(
    rot3 || Cesium.Matrix3.IDENTITY,
    new Cesium.Cartesian3(tx, ty, tz),
  );
  return Cesium.Matrix4.multiply(frameM, local, new Cesium.Matrix4());
}

const VF = () => Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
const cyl = (len, rBottom, rTop, slices = 10) =>
  new Cesium.CylinderGeometry({ length: len, bottomRadius: rBottom, topRadius: rTop, slices, vertexFormat: VF() });
const box = (x, y, z) =>
  Cesium.BoxGeometry.fromDimensions({ dimensions: new Cesium.Cartesian3(x, y, z), vertexFormat: VF() });
const inst = (geometry, modelMatrix, color) =>
  new Cesium.GeometryInstance({
    geometry,
    modelMatrix,
    attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
  });

/** Freileitungsmast; Rahmen: x quer zur Leitung, y entlang, z oben */
function pylonInstances(out, lat, lon, base, h, minor, headingRad) {
  const M = enuMatrix(lat, lon, base, headingRad);
  if (minor || h < 16) {
    out.push(inst(cyl(h, 0.18, 0.13, 8), placed(M, 0, 0, h / 2), COL.pole));
    out.push(inst(box(2.2, 0.15, 0.15), placed(M, 0, 0, h * 0.93), COL.pole));
    return;
  }
  const baseHalf = Math.max(2.5, h * 0.09);
  const rot45 = Cesium.Matrix3.fromRotationZ(Math.PI / 4);
  out.push(inst(cyl(h, baseHalf * 1.41, 0.7, 4), placed(M, 0, 0, h / 2, rot45), COL.steel));
  const arm = Math.max(5, h * 0.17);
  out.push(inst(box(arm * 2, 1.2, 0.9), placed(M, 0, 0, h * 0.78), COL.steel));
  out.push(inst(box(arm * 1.5, 1.0, 0.8), placed(M, 0, 0, h * 0.9), COL.steel));
}

function pointInstances(out, lat, lon, base, spec) {
  const M = enuMatrix(lat, lon, base);
  const h = spec.top;
  if (spec.kind === "wind") {
    out.push(inst(cyl(spec.hub, 2.4, 1.5, 14), placed(M, 0, 0, spec.hub / 2), COL.white));
    // Rotor blickt nach Westen (typischer Westwind); Rotorebene = Nord-Süd/oben
    out.push(inst(box(10, 4, 4), placed(M, 2, 0, spec.hub), COL.white));
    const phase = hash01(Math.round(lat * 1e5), Math.round(lon * 1e5)) * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const a = phase + (k * 2 * Math.PI) / 3;
      const rot = Cesium.Matrix3.fromRotationX(a);
      const r = spec.rotorR;
      const off = Cesium.Matrix3.multiplyByVector(rot, new Cesium.Cartesian3(0, r / 2, 0), new Cesium.Cartesian3());
      out.push(inst(box(0.6, r, 2.6), placed(M, -3.5 + off.x, off.y, spec.hub + off.z, rot), COL.white));
    }
    return;
  }
  if (spec.kind === "mast") {
    const seg = 7;
    for (let i = 0; i < seg; i++) {
      const l = h / seg;
      const r0 = 0.9 - (0.5 * i) / seg;
      out.push(inst(cyl(l, r0, r0 - 0.5 / seg, 8), placed(M, 0, 0, l * (i + 0.5)), i % 2 ? COL.white : COL.red));
    }
    return;
  }
  if (spec.kind === "chimney") {
    out.push(inst(cyl(h, 3, 1.8, 16), placed(M, 0, 0, h / 2), COL.brick));
    return;
  }
  out.push(inst(cyl(h, 3.5, 2.5, 16), placed(M, 0, 0, h / 2), COL.concrete));
}

function catenary(f, a, b, offset, sag, n = 12) {
  // a, b: {u, v, h}; offset quer zur Spannrichtung
  const du = b.u - a.u,
    dv = b.v - a.v;
  const len = Math.hypot(du, dv) || 1;
  const pu = -dv / len,
    pv = du / len;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = a.u + du * t + pu * offset;
    const v = a.v + dv * t + pv * offset;
    const h = a.h + (b.h - a.h) * t - 4 * sag * t * (1 - t);
    const p = f.fromUV(u, v);
    pts.push(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, h));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Wald: Scanline-Füllung (Even-Odd über alle Ringe, Löcher automatisch)
// ---------------------------------------------------------------------------

function featureEdges(f, rings) {
  const e = [];
  let minU = Infinity,
    maxU = -Infinity,
    minV = Infinity,
    maxV = -Infinity;
  for (const ring of rings) {
    let prev = null;
    for (const p of ring) {
      if (!p) {
        prev = null;
        continue;
      }
      const uv = f.toUV(p.lat, p.lon);
      minU = Math.min(minU, uv[0]);
      maxU = Math.max(maxU, uv[0]);
      minV = Math.min(minV, uv[1]);
      maxV = Math.max(maxV, uv[1]);
      if (prev) e.push(prev[0], prev[1], uv[0], uv[1]);
      prev = uv;
    }
    // Ring schließen, falls offen (einzelne Way-Ringe)
    if (ring.length > 2 && ring[0] && ring[ring.length - 1]) {
      const a = f.toUV(ring[ring.length - 1].lat, ring[ring.length - 1].lon);
      const b = f.toUV(ring[0].lat, ring[0].lon);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.01) e.push(a[0], a[1], b[0], b[1]);
    }
  }
  return { edges: new Float64Array(e), minU, maxU, minV, maxV };
}

function leafKind(tags) {
  const t = tags.leaf_type;
  if (t === "needleleaved") return 1;
  if (t === "broadleaved") return 0;
  return 0.55; // Mischwald (Anteil Nadelbäume)
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * @param m Mission {start, tgt, length}
 * @param o {trees, obstacles, forestHeight, mobile, shadows, sampleGround(points)->Promise<number[]>, onStatus}
 */
export async function loadObstacles(scene, m, o) {
  const f = makeFrame(m);
  const L = f.L;
  const W_OBS = 1200,
    R_OBS = 1800; // Hindernisse
  const W_TREE = o.mobile ? 180 : 260,
    R_TREE = o.mobile ? 450 : 650; // Bäume
  const polyObs = corridorPolygon(f, W_OBS, R_OBS);
  const polyTree = corridorPolygon(f, W_TREE, R_TREE);

  const parts = [];
  if (o.obstacles) {
    parts.push(
      `way["power"~"^(line|minor_line)$"](poly:"${polyObs}")->.lines;`,
      `.lines out geom;`,
      `node(w.lines)["power"]->.twr;`,
      `.twr out body;`,
      `(node["man_made"~"^(mast|tower|chimney|water_tower|communications_tower)$"](poly:"${polyObs}");` +
        `way["man_made"~"^(tower|chimney|water_tower)$"](poly:"${polyObs}");` +
        `node["generator:source"="wind"](poly:"${polyObs}");` +
        `node["aerialway"="pylon"](poly:"${polyObs}"););`,
      `out center;`,
    );
  }
  if (o.trees) {
    parts.push(
      `(way["landuse"="forest"](poly:"${polyTree}");way["natural"="wood"](poly:"${polyTree}");` +
        `relation["landuse"="forest"](poly:"${polyTree}");relation["natural"="wood"](poly:"${polyTree}");` +
        `way["natural"="tree_row"](poly:"${polyTree}");node["natural"="tree"](poly:"${polyTree}"););`,
      `out geom;`,
    );
  }
  const result = {
    primitives: [],
    groups: { obstacles: [], trees: [] },
    hazards: [],
    profile: () => null,
    counts: { trees: 0, obstacles: 0, spans: 0 },
  };
  const add = (group, prim) => {
    scene.primitives.add(prim);
    result.primitives.push(prim);
    result.groups[group].push(prim);
  };
  if (!parts.length) return result;
  const q = `[out:json][timeout:90];` + parts.join("");
  const data = await overpassQuery(q, (host) => o.onStatus(`Hindernisse & Vegetation (OSM, ${host}) …`), 95000);
  const els = data.elements || [];

  // --------------------------- Freileitungen ---------------------------
  const towers = new Map();
  const lines = [];
  const points = [];
  const forests = [];
  const singleTrees = [];
  for (const el of els) {
    const t = el.tags || {};
    if (el.type === "way" && (t.power === "line" || t.power === "minor_line") && el.geometry) lines.push(el);
    else if (el.type === "node" && t.power && !t["generator:source"]) towers.set(el.id, el);
    else if ((el.type === "node" || el.type === "way") && (t.man_made || t["generator:source"] || t.aerialway)) {
      const spec = pointObstacleSpec(t);
      const c = el.type === "node" ? el : el.center;
      if (spec && c) points.push({ lat: c.lat, lon: c.lon, spec, name: t.name });
    } else if (t.natural === "tree" && el.type === "node") singleTrees.push(el);
    else if (t.natural === "tree_row" && el.geometry) singleTrees.push(el);
    else if ((t.landuse === "forest" || t.natural === "wood") && (el.geometry || el.members)) forests.push(el);
  }

  o.onStatus("Hindernisse werden aufgebaut …");
  const inRegion = (u, v, W, R) => (u >= -400 && u <= L && Math.abs(v) <= W) || Math.hypot(u - L, v) <= R;

  // Spannfelder sammeln
  const spans = [];
  const towerUse = new Map(); // node id -> {lat, lon, h, est, minor, heading}
  for (const ln of lines) {
    const tags = ln.tags;
    const minor = tags.power === "minor_line";
    const volt = maxVoltage(tags);
    const g = ln.geometry;
    const ids = ln.nodes || [];
    for (let i = 0; i < g.length - 1; i++) {
      const a = g[i],
        b = g[i + 1];
      if (!a || !b) continue;
      const ua = f.toUV(a.lat, a.lon),
        ub = f.toUV(b.lat, b.lon);
      const mid = [(ua[0] + ub[0]) / 2, (ua[1] + ub[1]) / 2];
      if (!inRegion(mid[0], mid[1], W_OBS + 300, R_OBS + 300)) continue;
      const heading = Math.atan2((b.lon - a.lon) * Math.cos(a.lat * DEG), b.lat - a.lat);
      const reg = (k, p, uv) => {
        const id = ids[k] ?? `${p.lat},${p.lon}`;
        if (!towerUse.has(id)) {
          const tw = towers.get(id);
          const th = okHeight(parseNum(tw?.tags?.height));
          const isPole = tw?.tags?.power === "pole" || minor;
          towerUse.set(id, {
            id,
            lat: p.lat,
            lon: p.lon,
            uv,
            h: isFinite(th) ? th : towerDefaultHeight(volt, isPole),
            est: !isFinite(th),
            minor: isPole && !(volt >= 30000),
            heading,
          });
        }
        return towerUse.get(id);
      };
      spans.push({ a: reg(i, a, ua), b: reg(i + 1, b, ub), volt, minor });
    }
  }

  const pts = points
    .map((p) => ({ ...p, uv: f.toUV(p.lat, p.lon) }))
    .filter((p) => inRegion(p.uv[0], p.uv[1], W_OBS, R_OBS));

  // Bodenhöhen für Masten und Punkthindernisse
  const towerList = [...towerUse.values()];
  const gAll = await o.sampleGround([...towerList, ...pts]);
  towerList.forEach((t, i) => {
    t.base = gAll[i];
    t.top = t.base + t.h;
  });
  pts.forEach((p, i) => {
    p.base = gAll[towerList.length + i];
    p.top = p.base + p.spec.top;
  });

  const instances = [];
  for (const t of towerList) pylonInstances(instances, t.lat, t.lon, t.base - 1, t.h + 1, t.minor, t.heading);
  for (const p of pts)
    pointInstances(instances, p.lat, p.lon, p.base - 1, { ...p.spec, top: p.spec.top + 1, hub: (p.spec.hub || 0) + 1 });

  // Leiterseile
  const wires = new Cesium.PolylineCollection();
  const wireCross = [];
  for (const sp of spans) {
    const len = Math.hypot(sp.b.uv[0] - sp.a.uv[0], sp.b.uv[1] - sp.a.uv[1]);
    const sag = Math.min(len * (sp.minor ? 0.015 : 0.025), 14);
    const A = { u: sp.a.uv[0], v: sp.a.uv[1] },
      B = { u: sp.b.uv[0], v: sp.b.uv[1] };
    const conductors = [];
    if (sp.a.minor && sp.b.minor) conductors.push([-0.9, 0.95], [0.9, 0.95]);
    else {
      const arm = Math.max(5, Math.min(sp.a.h, sp.b.h) * 0.17);
      conductors.push([-arm * 0.9, 0.78], [arm * 0.9, 0.78], [-arm * 0.65, 0.9], [arm * 0.65, 0.9], [0, 1.0]);
    }
    for (const [off, rel] of conductors) {
      const a = { ...A, h: sp.a.base + sp.a.h * rel },
        b = { ...B, h: sp.b.base + sp.b.h * rel };
      wires.add({
        positions: catenary(f, a, b, off, sag),
        width: 1.6,
        material: Cesium.Material.fromType("Color", { color: COL.wire }),
      });
    }
    // Kreuzung mit der Flugroute (v = 0)
    const va = A.v,
      vb = B.v;
    if (va > 0 !== vb > 0) {
      const t = va / (va - vb);
      const u = A.u + (B.u - A.u) * t;
      if (u >= -50 && u <= L + 50) {
        const top = sp.a.base + sp.a.h + (sp.b.base + sp.b.h - sp.a.base - sp.a.h) * t - 4 * sag * t * (1 - t);
        const p = f.fromUV(u, 0);
        const ground = sp.a.base + (sp.b.base - sp.a.base) * t;
        wireCross.push({
          s: u,
          top,
          ground,
          lat: p.lat,
          lon: p.lon,
          kind: "wire",
          label: "LEITUNG",
          est: sp.a.est || sp.b.est,
        });
      }
    }
  }
  result.counts.spans = spans.length;
  result.counts.obstacles = towerList.length + pts.length;

  if (instances.length) {
    add(
      "obstacles",
      new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
        asynchronous: true,
        shadows: o.shadows ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED,
      }),
    );
  }
  if (spans.length) add("obstacles", wires);

  // --------------------------- Bäume ---------------------------
  const trees = []; // {u, v, h, kind}
  if (o.trees) {
    const maxTrees = o.mobile ? 10000 : 30000;
    const gen = (spacing) => {
      const list = [];
      const taken = new Set();
      const vMax = Math.max(W_TREE, R_TREE);
      const rows = Math.ceil((2 * vMax) / spacing);
      const feats = forests.map((el) => {
        const rings =
          el.type === "way"
            ? [el.geometry]
            : el.members.filter((mb) => mb.type === "way" && mb.geometry).map((mb) => mb.geometry);
        return { ...featureEdges(f, rings), tags: el.tags || {} };
      });
      for (const ft of feats) {
        const conif = leafKind(ft.tags);
        const E = ft.edges;
        for (let r = 0; r <= rows; r++) {
          const v = -vMax + r * spacing;
          if (v < ft.minV || v > ft.maxV) continue;
          const xs = [];
          for (let k = 0; k < E.length; k += 4) {
            const v1 = E[k + 1],
              v2 = E[k + 3];
            if (v1 > v !== v2 > v) xs.push(E[k] + ((v - v1) * (E[k + 2] - E[k])) / (v2 - v1));
          }
          xs.sort((a, b) => a - b);
          for (let k = 0; k + 1 < xs.length; k += 2) {
            const a = Math.max(xs[k], -400),
              b = Math.min(xs[k + 1], L + R_TREE);
            for (let c = Math.ceil(a / spacing); c * spacing <= b; c++) {
              const key = r * 100003 + c;
              if (taken.has(key)) continue;
              const ju = (hash01(r, c, 1) - 0.5) * spacing * 0.8;
              const jv = (hash01(r, c, 2) - 0.5) * spacing * 0.8;
              const u = c * spacing + ju,
                vv = v + jv;
              if (!inRegion(u, vv, W_TREE, R_TREE)) continue;
              taken.add(key);
              const hRand = 0.8 + hash01(r, c, 3) * 0.35;
              list.push({ u, v: vv, h: o.forestHeight * hRand, conifer: hash01(r, c, 4) < conif });
            }
          }
        }
      }
      return list;
    };
    let spacing = o.mobile ? 13 : 9;
    let list = gen(spacing);
    if (list.length > maxTrees) {
      spacing *= Math.sqrt(list.length / maxTrees) * 1.02;
      list = gen(spacing);
    }
    // Einzelbäume und Baumreihen
    for (const el of singleTrees) {
      const t = el.tags || {};
      const th = okHeight(parseNum(t.height));
      const h = isFinite(th) ? th : t.natural === "tree_row" ? 11 : 12;
      const conifer = t.leaf_type === "needleleaved";
      if (el.type === "node") {
        const [u, v] = f.toUV(el.lat, el.lon);
        if (inRegion(u, v, W_TREE, R_TREE)) list.push({ u, v, h, conifer });
      } else {
        const g = el.geometry.filter(Boolean);
        for (let i = 0; i < g.length - 1; i++) {
          const a = f.toUV(g[i].lat, g[i].lon),
            b = f.toUV(g[i + 1].lat, g[i + 1].lon);
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let d = 0; d < len; d += 9) {
            const u = a[0] + ((b[0] - a[0]) * d) / len,
              v = a[1] + ((b[1] - a[1]) * d) / len;
            if (inRegion(u, v, W_TREE, R_TREE)) list.push({ u, v, h: h * (0.85 + hash01(i, d, 5) * 0.3), conifer });
          }
        }
      }
    }
    trees.push(...list);
    if (trees.length) {
      o.onStatus(`${trees.length.toLocaleString("de-DE")} Bäume werden platziert …`);
      const ll = trees.map((t) => f.fromUV(t.u, t.v));
      const g = await o.sampleGround(ll);
      trees.forEach((t, i) => {
        t.lat = ll[i].lat;
        t.lon = ll[i].lon;
        t.base = g[i];
      });
      // In Abschnitte (1,5 km) aufteilen -> bessere Sichtbarkeitsprüfung
      const chunks = new Map();
      for (const t of trees) {
        const key = Math.floor(t.u / 1500);
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(t);
      }
      const shadows = o.shadows ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;
      for (const list2 of chunks.values()) {
        const c = list2[Math.floor(list2.length / 2)];
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.base));
        const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
        const tmp = new Cesium.Cartesian3();
        const local = list2.map((t) => {
          Cesium.Cartesian3.fromDegrees(t.lon, t.lat, t.base - 0.8, undefined, tmp);
          Cesium.Matrix4.multiplyByPoint(inv, tmp, tmp);
          return { x: tmp.x, y: tmp.y, z: tmp.z, w: t.h * (t.conifer ? 0.36 : 0.6), h: t.h + 0.8, conifer: t.conifer };
        });
        const model = await Cesium.Model.fromGltfAsync({
          url: URL.createObjectURL(new Blob([treeChunkGlb(local)], { type: "model/gltf-binary" })),
          upAxis: Cesium.Axis.Z,
          forwardAxis: Cesium.Axis.X,
          modelMatrix: enu,
          shadows,
        });
        add("trees", model);
      }
    }
  }
  result.counts.trees = trees.length;

  // --------------------------- Gefahrenliste (HUD) ---------------------------
  for (const w of wireCross) result.hazards.push(w);
  for (const t of towerList) {
    if (Math.abs(t.uv[1]) < 250 && t.uv[0] > -100 && t.uv[0] < L + 100)
      result.hazards.push({
        s: t.uv[0],
        v: t.uv[1],
        top: t.top,
        ground: t.base,
        lat: t.lat,
        lon: t.lon,
        kind: "tower",
        label: "MAST",
        est: t.est,
      });
  }
  for (const p of pts) {
    const lim = 300 + (p.spec.rotorR || 0);
    if (Math.abs(p.uv[1]) < lim && p.uv[0] > -100 && p.uv[0] < L + 100)
      result.hazards.push({
        s: p.uv[0],
        v: p.uv[1],
        top: p.top,
        ground: p.base,
        lat: p.lat,
        lon: p.lon,
        kind: p.spec.kind,
        label: p.spec.label,
        est: p.spec.est,
      });
  }
  result.hazards.sort((a, b) => a.s - b.s);

  // Daten für die Approach Plate (Zeichnung + Abstandsmaße an der LZ)
  result.plate = {
    towers: towerList.map((t) => ({ lat: t.lat, lon: t.lon, h: t.h, est: t.est })),
    points: pts.map((p) => ({ lat: p.lat, lon: p.lon, h: p.spec.top, est: p.spec.est, label: p.spec.label })),
    spans: spans.map((sp) => ({ a: { lat: sp.a.lat, lon: sp.a.lon }, b: { lat: sp.b.lat, lon: sp.b.lon } })),
    wires: wireCross.map((w) => ({ lat: w.lat, lon: w.lon, agl: w.top - w.ground, est: w.est })),
    lzTrees: trees
      .filter((t) => Math.hypot(t.u - L, t.v) < 300 && t.lat != null)
      .map((t) => ({ lat: t.lat, lon: t.lon, h: t.h, conifer: t.conifer })),
  };

  // --------------------------- Höhenprofil ---------------------------
  // Raster der Baumkronen (10 m Zellen)
  const grid = new Map();
  for (const t of trees) {
    const k = `${Math.floor(t.u / 10)}:${Math.floor(t.v / 10)}`;
    const top = t.base + t.h;
    const r = t.h * (t.conifer ? 0.18 : 0.3);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([t.u, t.v, top, r]);
  }
  result.profile = (pathPts) =>
    pathPts.map((p) => {
      const [u, v] = f.toUV(p.lat, p.lon);
      let h = -Infinity;
      const cu = Math.floor(u / 10),
        cv = Math.floor(v / 10);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const cell = grid.get(`${cu + a}:${cv + b}`);
          if (!cell) continue;
          for (const [tu, tv, top, r] of cell) if (Math.hypot(tu - u, tv - v) <= r + 4) h = Math.max(h, top);
        }
      for (const t of towerList) if (Math.hypot(t.uv[0] - u, t.uv[1] - v) < 18) h = Math.max(h, t.top);
      for (const q of pts) {
        const r = (q.spec.rotorR || 0) + 15;
        if (Math.hypot(q.uv[0] - u, q.uv[1] - v) < r) h = Math.max(h, q.top);
      }
      for (const w of wireCross) if (Math.abs(w.s - u) < 30) h = Math.max(h, w.top + 3);
      return h;
    });

  result.setShow = (group, show) => result.groups[group].forEach((p) => (p.show = show));
  result.destroy = () => {
    result.primitives.forEach((p) => scene.primitives.remove(p));
    result.primitives = [];
  };
  return result;
}
