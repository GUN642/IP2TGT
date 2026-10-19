// Target Approach Plate: Kopfzeile, links Strecke IP -> TGT (Kurs oben), rechts LZ-Detail
// mit LZ-Kreis, An-/Abflug und Abstandsmaßen zu Hindernissen. Zeichnung auf Canvas.

import * as geo from "./geo.js?v=15";
import { isBlankImage } from "./imagery.js?v=15";

const DEG = Math.PI / 180;
const R_EARTH = 6371008.8;
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const PLATE_W = 2000;
export const PLATE_H = 1400;

// ---------------------------------------------------------------------------
// Kacheln
// ---------------------------------------------------------------------------

const imgCache = new Map();
function loadImg(url) {
  if (!imgCache.has(url)) {
    imgCache.set(
      url,
      new Promise((resolve) => {
        const im = new Image();
        im.crossOrigin = "anonymous";
        const t = setTimeout(() => resolve(null), 20000);
        im.onload = () => {
          clearTimeout(t);
          resolve(im);
        };
        im.onerror = () => {
          clearTimeout(t);
          imgCache.delete(url);
          resolve(null);
        };
        im.src = url;
      }),
    );
  }
  return imgCache.get(url);
}

const mercX = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const mercY = (lat, z) => {
  const r = lat * DEG;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z;
};

/**
 * Zeichnet Luftbild in rect, Mittelpunkt center, Kurs `courseDeg` zeigt nach oben,
 * Maßstab mpp (Meter pro Plate-Pixel). Liefert project(lat, lon) -> {x, y}.
 */
async function drawMap(ctx, rect, center, courseDeg, mpp, tiles) {
  const cos = Math.cos(center.lat * DEG);
  let z = Math.min(tiles.maxZoom, Math.max(1, Math.ceil(Math.log2((156543.03392 * cos) / mpp))));
  let tileMpp = (156543.03392 * cos) / 2 ** z;
  let s = tileMpp / mpp; // Plate-Pixel je Kachelpixel
  let off = Math.ceil(Math.hypot(rect.w, rect.h) / s) + 4;
  while (off > 4096 && z > 1) {
    z--;
    tileMpp *= 2;
    s = tileMpp / mpp;
    off = Math.ceil(Math.hypot(rect.w, rect.h) / s) + 4;
  }
  const cx = mercX(center.lon, z),
    cy = mercY(center.lat, z);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = off;
  const oc = canvas.getContext("2d");
  oc.fillStyle = "#6b705c";
  oc.fillRect(0, 0, off, off);
  const x0 = Math.floor((cx - off / 2) / 256),
    x1 = Math.floor((cx + off / 2) / 256);
  const y0 = Math.floor((cy - off / 2) / 256),
    y1 = Math.floor((cy + off / 2) / 256);
  const jobs = [];
  for (let tx = x0; tx <= x1; tx++)
    for (let ty = y0; ty <= y1; ty++) {
      const n = 2 ** z;
      const xx = ((tx % n) + n) % n;
      const url = ESRI.replace("{z}", z).replace("{x}", xx).replace("{y}", ty);
      jobs.push(
        // zuerst über die Luftbildquelle des 3D-Globus (funktioniert dort nachweislich), sonst Esri direkt
        (tiles.source ? tiles.source(xx, ty, z, tiles.diag) : Promise.resolve(null))
          .then((im) => {
            if (im) return im;
            return loadImg(url).then((e) => {
              const ok = e && !isBlankImage(e) ? e : null;
              if (e && !ok && !tiles.diag.errors.includes("Esri: leere Kacheln"))
                tiles.diag.errors.push("Esri: leere Kacheln");
              tiles.diag.esri[ok ? "ok" : "fail"]++;
              return ok;
            });
          })
          .then((im) => {
            if (im) {
              oc.drawImage(im, tx * 256 - (cx - off / 2), ty * 256 - (cy - off / 2), 256, 256);
              tiles.ok++;
            } else tiles.fail++;
          }),
      );
    }
  const okBefore = tiles.ok,
    failBefore = tiles.fail;
  await Promise.all(jobs);
  const okHere = tiles.ok - okBefore,
    failHere = tiles.fail - failBefore;

  const a = -courseDeg * DEG;
  const mx = rect.x + rect.w / 2,
    my = rect.y + rect.h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  // Ersatz: Kacheln nicht ladbar -> Aufnahme senkrecht von oben aus dem 3D-Globus (bereits kursoben)
  let captured = null;
  if (tiles.capture && okHere < (okHere + failHere) * 0.6) {
    captured = await tiles.capture(center, courseDeg, rect.w * mpp, rect.h * mpp).catch((e) => {
      tiles.diag.errors.push(`Globus-Aufnahme: ${e?.message || e}`);
      return null;
    });
  }
  if (captured) {
    const k = captured.mpp / mpp;
    const cw = captured.canvas.width * k,
      ch = captured.canvas.height * k;
    ctx.drawImage(captured.canvas, mx - cw / 2, my - ch / 2, cw, ch);
    tiles.diag.capture = (tiles.diag.capture || 0) + 1;
  } else {
    ctx.translate(mx, my);
    ctx.rotate(a);
    ctx.scale(s, s);
    ctx.drawImage(canvas, -off / 2, -off / 2);
  }
  ctx.restore();

  const ca = Math.cos(a),
    sa = Math.sin(a);
  return (lat, lon) => {
    const dx = (mercX(lon, z) - cx) * s,
      dy = (mercY(lat, z) - cy) * s;
    return { x: mx + dx * ca - dy * sa, y: my + dx * sa + dy * ca };
  };
}

// ---------------------------------------------------------------------------
// Zeichenhelfer
// ---------------------------------------------------------------------------

// bereits platzierte Beschriftungen (Überlappungen vermeiden)
let placed = [];
const overlaps = (r) =>
  placed.some((p) => r.x < p.x + p.w + 4 && r.x + r.w + 4 > p.x && r.y < p.y + p.h + 4 && r.y + r.h + 4 > p.y);

const FONT = (px, w = 700) => `${w} ${px}px Arial, "Helvetica Neue", sans-serif`;

function labelBox(ctx, text, x, y, opt = {}) {
  const lines = String(text).split("\n");
  const fs = opt.size || 22;
  ctx.font = FONT(fs);
  const padX = 7,
    padY = 4,
    lh = fs * 1.15;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
  const h = lines.length * lh + padY * 2;
  let bx = x,
    by = y;
  if (opt.anchor === "center") {
    bx -= w / 2;
    by -= h / 2;
  } else if (opt.anchor === "right") {
    bx -= w;
    by -= h / 2;
  } else by -= h / 2;
  for (let i = 0; i < 12 && overlaps({ x: bx, y: by, w, h }); i++) by += h * 0.55;
  placed.push({ x: bx, y: by, w, h });
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = opt.bg || "#ffff00";
  ctx.fillRect(bx, by, w, h);
  ctx.restore();
  ctx.strokeStyle = opt.border || "#000";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(bx, by, w, h);
  ctx.fillStyle = opt.fg || "#000";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.font = FONT(fs, i === 0 && lines.length > 1 ? 800 : 700);
    ctx.fillText(l, bx + padX, by + padY + lh * (i + 0.5));
  });
  return { x: bx, y: by, w, h };
}

function arrowHead(ctx, x, y, ang, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.45);
  ctx.lineTo(-size, size * 0.45);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function line(ctx, a, b, color, width, head = false, tail = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  if (head) arrowHead(ctx, b.x, b.y, ang, width * 5, color);
  if (tail) arrowHead(ctx, a.x, a.y, ang + Math.PI, width * 5, color);
}

function northIndicator(ctx, x, y, r, courseDeg) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(160,160,160,0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-courseDeg * DEG);
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.12);
  ctx.lineTo(-r * 0.22, -r * 0.8);
  ctx.lineTo(r * 0.22, -r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = FONT(r * 0.85, 900);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 0, r * 0.04);
  ctx.restore();
}

// lokale Meter um einen Bezugspunkt
function localFrame(ref) {
  const kx = Math.cos(ref.lat * DEG) * R_EARTH * DEG,
    ky = R_EARTH * DEG;
  return {
    to: (p) => [(p.lon - ref.lon) * kx, (p.lat - ref.lat) * ky],
    from: (x, y) => ({ lat: ref.lat + y / ky, lon: ref.lon + x / kx }),
  };
}

function nearestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return [ax + t * dx, ay + t * dy];
}

/** Hindernisse nahe der LZ: nächster Punkt je Objekt, Abstand ab LZ-Rand */
function lzClearances(P, R) {
  const f = localFrame(P.tgt);
  const cands = [];
  const add = (x, y, label) => {
    const d = Math.hypot(x, y);
    const clr = d - R;
    if (clr > 2 && clr < 150) cands.push({ x, y, d, clr, ang: Math.atan2(y, x), label });
  };
  for (const b of P.obstacles.buildings || []) {
    const ring = b.ring.map(([la, lo]) => f.to({ lat: la, lon: lo }));
    let best = null;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        c = ring[(i + 1) % ring.length];
      const q = nearestOnSegment(0, 0, a[0], a[1], c[0], c[1]);
      const d = Math.hypot(q[0], q[1]);
      if (!best || d < best.d) best = { d, q };
    }
    if (best) add(best.q[0], best.q[1], `Gebäude ${Math.round(b.height)} m`);
  }
  for (const t of P.obstacles.lzTrees || []) {
    const [x, y] = f.to(t);
    const d = Math.hypot(x, y) || 1;
    const r = t.h * (t.conifer ? 0.18 : 0.3);
    add((x * (d - r)) / d, (y * (d - r)) / d, `Baum ~${Math.round(t.h)} m`);
  }
  for (const t of [...(P.obstacles.towers || []), ...(P.obstacles.points || [])]) {
    const [x, y] = f.to(t);
    add(x, y, `${t.label || "Mast"} ${t.est ? "~" : ""}${Math.round(t.h)} m`);
  }
  for (const sp of P.obstacles.spans || []) {
    const a = f.to(sp.a),
      b = f.to(sp.b);
    const q = nearestOnSegment(0, 0, a[0], a[1], b[0], b[1]);
    add(q[0], q[1], "Leitung");
  }
  cands.sort((a, b) => a.clr - b.clr);
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= 4) break;
    if (chosen.every((o) => Math.abs(((c.ang - o.ang + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) > 50 * DEG))
      chosen.push(c);
  }
  return chosen.map((c) => ({ ...c, edge: f.from((c.x / c.d) * R, (c.y / c.d) * R), obj: f.from(c.x, c.y) }));
}

// ---------------------------------------------------------------------------
// Plate
// ---------------------------------------------------------------------------

/**
 * P: { header:{callsign, sequence, alternate, lz, grid, elev, remarks}, tgt, ip, courseTrue, courseMag,
 *      depTrue, depMag, eteSec, unit:{f,lbl}, lzDiameter, obstacles:{buildings, lzTrees, towers, points, spans} }
 */
export async function renderPlate(canvas, P, onStatus = () => {}) {
  placed = [];
  const tiles = {
    source: P.tileSource || null,
    capture: P.capture || null,
    maxZoom: Math.min(19, P.maxZoom || 19),
    ok: 0,
    fail: 0,
    diag: { globe: { ok: 0, fail: 0 }, bing: { ok: 0, fail: 0 }, esri: { ok: 0, fail: 0 }, errors: [] },
  };
  canvas.width = PLATE_W;
  canvas.height = PLATE_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PLATE_W, PLATE_H);

  // ---------------- Kopfzeile ----------------
  const cols = [
    ["CALLSIGN", 190, P.header.callsign],
    ["SEQUENCE", 260, P.header.sequence],
    ["ALTERNATE LZ", 208, P.header.alternate],
    ["LZ", 114, P.header.lz],
    ["GRID", 191, P.header.grid],
    ["ELEV", 78, P.header.elev],
    ["REMARKS", 275, P.header.remarks],
  ];
  const k = PLATE_W / cols.reduce((a, c) => a + c[1], 0);
  const hh = 24,
    vh = 44;
  let x = 0;
  for (const [title, w0, val] of cols) {
    const w = w0 * k;
    ctx.fillStyle = "#7f7f7f";
    ctx.fillRect(x, 0, w, hh);
    ctx.fillStyle = "#efefe8";
    ctx.fillRect(x, hh, w, vh);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, 0, w, hh);
    ctx.strokeRect(x, hh, w, vh);
    ctx.fillStyle = "#fff";
    ctx.font = FONT(15, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, x + w / 2, hh / 2 + 1);
    ctx.fillStyle = "#000";
    let fs = 22;
    ctx.font = FONT(fs, 700);
    const text = String(val ?? "");
    while (ctx.measureText(text).width > w - 12 && fs > 11) ctx.font = FONT(--fs, 700);
    ctx.fillText(text, x + w / 2, hh + vh / 2 + 1);
    x += w;
  }
  const top = hh + vh;
  const half = PLATE_W / 2;
  const left = { x: 0, y: top, w: half - 1, h: PLATE_H - top };
  const right = { x: half + 1, y: top, w: half - 1, h: PLATE_H - top };

  const crsTxt = `${geo.fmtCourse(P.courseMag)}°`;
  const depTxt = `${geo.fmtCourse(P.depMag)}°`;
  const eteTxt = geo.fmtTime(P.eteSec);
  const ipToTgt = geo.inverse(P.ip.lat, P.ip.lon, P.tgt.lat, P.tgt.lon);
  const L = ipToTgt.distance;

  // ---------------- Links: Strecke IP -> TGT ----------------
  onStatus("Luftbild Strecke IP → TGT …");
  const mppL = L / (left.h * 0.8);
  const mid = geo.direct(P.ip.lat, P.ip.lon, ipToTgt.course1, L * 0.52);
  const projL = await drawMap(ctx, left, mid, P.courseTrue, mppL, tiles);
  const ipP = projL(P.ip.lat, P.ip.lon);
  const tgtP = projL(P.tgt.lat, P.tgt.lon);
  const Y = "#ffff00";
  // Anflug unterhalb des IP
  const ipIn = { x: ipP.x - (tgtP.x - ipP.x) * 0.08, y: ipP.y - (tgtP.y - ipP.y) * 0.08 };
  line(ctx, ipIn, { x: ipP.x, y: ipP.y + 18 }, Y, 3, true);
  line(ctx, ipP, tgtP, Y, 3.5);
  // Abflug
  const depEnd = geo.direct(P.tgt.lat, P.tgt.lon, P.depTrue, L * 0.07);
  const dP = projL(depEnd.lat, depEnd.lon);
  const rT = Math.max(16, (P.lzDiameter / 2 / mppL) * 1.0);
  const dir = Math.atan2(dP.y - tgtP.y, dP.x - tgtP.x);
  line(ctx, { x: tgtP.x + Math.cos(dir) * rT, y: tgtP.y + Math.sin(dir) * rT }, dP, Y, 3, true);
  labelBox(ctx, depTxt, dP.x + 16, dP.y + 6);
  // Distanzmarken ab TGT
  const step = P.unit.f / 10;
  const len = (i) => (i % 5 === 0 ? 16 : 9);
  const nx = -(tgtP.y - ipP.y),
    ny = tgtP.x - ipP.x;
  const nl = Math.hypot(nx, ny);
  for (let i = 1; i * step < L - step * 0.5; i++) {
    const p = geo.direct(P.tgt.lat, P.tgt.lon, ipToTgt.course2 + 180, i * step);
    const q = projL(p.lat, p.lon);
    const red = i % 5 === 0;
    ctx.strokeStyle = red ? "#e00000" : Y;
    ctx.lineWidth = red ? 3 : 2.5;
    ctx.beginPath();
    ctx.moveTo(q.x - (nx / nl) * len(i), q.y - (ny / nl) * len(i));
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    if (red) {
      ctx.save();
      ctx.font = FONT(22, 700);
      ctx.fillStyle = Y;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 3;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(
        String((i / 10).toFixed(1))
          .replace(".", ",")
          .replace(",0", ""),
        q.x - (nx / nl) * 26,
        q.y - (ny / nl) * 26,
      );
      ctx.restore();
    }
  }
  // TGT-Kreis + IP-Quadrat
  ctx.strokeStyle = Y;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(tgtP.x, tgtP.y, rT, 0, Math.PI * 2);
  ctx.stroke();
  labelBox(ctx, "TGT", tgtP.x - rT - 14, tgtP.y, { anchor: "right" });
  ctx.strokeStyle = Y;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(ipP.x - 22, ipP.y - 22, 44, 44);
  labelBox(ctx, "IP", ipP.x - 40, ipP.y, { anchor: "right" });
  const qb = { x: ipP.x + (tgtP.x - ipP.x) * 0.22, y: ipP.y + (tgtP.y - ipP.y) * 0.22 };
  labelBox(ctx, `${crsTxt}\n${eteTxt}`, qb.x - 80, qb.y, { anchor: "right", size: 24 });
  // Hindernisse auf der Strecke (Leitungskreuzungen)
  for (const w of P.obstacles.wires || []) {
    const q = projL(w.lat, w.lon);
    if (q.y < left.y || q.y > left.y + left.h) continue;
    labelBox(ctx, `⚡ ${w.est ? "~" : ""}${Math.round(w.agl / geo.FT)} ft`, q.x + 22, q.y, {
      bg: "#e00000",
      fg: "#fff",
      size: 18,
    });
  }
  northIndicator(ctx, left.x + left.w * 0.74, left.y + left.h - 70, 44, P.courseTrue);

  // ---------------- Rechts: LZ-Detail ----------------
  onStatus("Luftbild LZ-Detail …");
  const R = P.lzDiameter / 2;
  const viewM = Math.max(180, P.lzDiameter * 4.2);
  const mppR = viewM / right.w;
  const center = geo.direct(P.tgt.lat, P.tgt.lon, P.courseTrue, viewM * 0.06);
  const projR = await drawMap(ctx, right, center, P.courseTrue, mppR, tiles);
  const c = projR(P.tgt.lat, P.tgt.lon);
  const rPx = R / mppR;
  // Anflug von unten
  const inStart = geo.direct(P.tgt.lat, P.tgt.lon, P.courseTrue + 180, viewM);
  const a0 = projR(inStart.lat, inStart.lon);
  const ang = Math.atan2(c.y - a0.y, c.x - a0.x);
  const edgeIn = { x: c.x - Math.cos(ang) * rPx, y: c.y - Math.sin(ang) * rPx };
  line(ctx, a0, edgeIn, Y, 4, true);
  labelBox(ctx, `${crsTxt}\n${eteTxt}`, edgeIn.x + 34, edgeIn.y + (right.y + right.h - edgeIn.y) * 0.55, { size: 24 });
  // Abflug
  const outEnd = geo.direct(P.tgt.lat, P.tgt.lon, P.depTrue, R + viewM * 0.22);
  const o1 = projR(outEnd.lat, outEnd.lon);
  const angO = Math.atan2(o1.y - c.y, o1.x - c.x);
  line(ctx, { x: c.x + Math.cos(angO) * rPx, y: c.y + Math.sin(angO) * rPx }, o1, Y, 4, true);
  labelBox(ctx, depTxt, o1.x + 30, o1.y + 50);
  // LZ-Kreis, Mittelpunkt, Beschriftung
  ctx.strokeStyle = Y;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = Y;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
  ctx.fill();
  labelBox(ctx, "TGT", c.x - rPx - 50, c.y, { anchor: "right" });
  // Abstandsmaße zu Hindernissen
  const RED = "#e00000";
  for (const cl of lzClearances(P, R)) {
    const e = projR(cl.edge.lat, cl.edge.lon),
      o = projR(cl.obj.lat, cl.obj.lon);
    if (o.x < right.x || o.x > right.x + right.w || o.y < right.y || o.y > right.y + right.h) continue;
    line(ctx, e, o, RED, 2.5, true, true);
    const dl = Math.hypot(o.x - e.x, o.y - e.y) || 1;
    const lx = o.x + ((o.x - e.x) / dl) * 40,
      ly = o.y + ((o.y - e.y) / dl) * 30;
    labelBox(ctx, `${Math.round(cl.clr)} m`, lx, ly, {
      anchor: "center",
      bg: RED,
      fg: "#fff",
      size: 20,
    });
  }
  // Maßstab
  const sb = viewM > 400 ? 100 : 50;
  const sbx = right.x + right.w - 40 - sb / mppR,
    sby = right.y + right.h - 40;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(sbx - 10, sby - 30, sb / mppR + 20, 42);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sbx, sby - 8);
  ctx.lineTo(sbx, sby);
  ctx.lineTo(sbx + sb / mppR, sby);
  ctx.lineTo(sbx + sb / mppR, sby - 8);
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.font = FONT(16, 700);
  ctx.textAlign = "center";
  ctx.fillText(`${sb} m`, sbx + sb / mppR / 2, sby - 16);
  northIndicator(ctx, right.x + 130, right.y + right.h - 70, 44, P.courseTrue);

  // Trennlinie
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(half, top);
  ctx.lineTo(half, PLATE_H);
  ctx.stroke();
  ctx.setLineDash([]);
  // Quellenangabe
  ctx.font = FONT(13, 400);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    "Luftbild: Esri, Maxar, Earthstar Geographics · Hindernisse: © OpenStreetMap · IP2TGT – nicht für reale Einsatzplanung",
    PLATE_W - 10,
    PLATE_H - 6,
  );
  return { tilesOk: tiles.ok + (tiles.diag.capture || 0) * 1000, tilesFailed: tiles.fail, diag: tiles.diag };
}
