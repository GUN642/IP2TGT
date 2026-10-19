// Anflugprofil IP -> TGT: Geländefolgeflug, Verzögerung, Hover, Landung.
// Erzeugt eine vorab berechnete Trajektorie (zeitlich abgetastet), damit
// Pause/Spulen jederzeit deterministisch funktioniert.

import { direct } from "./geo.js?v=17";

export const PHASES = {
  LEADIN: "ANFLUG IP",
  INBOUND: "INBOUND",
  DECEL: "VERZÖGERUNG",
  HOVER: "HOVER",
  DESCENT: "AUFSETZEN",
  LANDED: "GELANDET",
};

const DT = 0.05;
const G0 = 9.80665;
const DEG = Math.PI / 180;

const smoothstep = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/** Punkte entlang der Bahn (Abstand ds) als {s, lat, lon}. */
export function pathPoints(start, courseStart, length, ds) {
  const n = Math.max(2, Math.ceil(length / ds) + 1);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(i * ds, length);
    const p = direct(start.lat, start.lon, courseStart, s);
    pts.push({ s, lat: p.lat, lon: p.lon });
  }
  return pts;
}

function movingAvg(arr, half) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0,
      n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

/**
 * Geglättete Bodenreferenz für Geländefolgeflug.
 * ground: Rohhöhen (Gelände + Hindernisse) im Abstand ds.
 */
export function smoothGroundProfile(ground, ds, gsMs) {
  const k = (m) => Math.max(1, Math.round(m / ds));
  // Enges Geländefolgen (Konturenflug): die Sollhöhe über Grund wird gehalten.
  // Begrenzt werden nur die Steig-/Sinkraten (~2000 ft/min steigen, ~1400 ft/min sinken),
  // damit Kuppen und Hindernisse rechtzeitig, aber nicht unnötig hoch überflogen werden.
  const v = Math.max(gsMs, 10);
  const maxClimb = Math.min(0.35, 10 / v) * ds;
  const maxDesc = Math.min(0.3, 7 / v) * ds;
  let G = movingAvg(ground, k(25));
  for (let i = 0; i < G.length; i++) G[i] = Math.max(G[i], ground[i]);
  for (let i = 1; i < G.length; i++) G[i] = Math.max(G[i], G[i - 1] - maxDesc);
  for (let i = G.length - 2; i >= 0; i--) G[i] = Math.max(G[i], G[i + 1] - maxClimb);
  G = movingAvg(G, k(15));
  for (let i = 0; i < G.length; i++) G[i] = Math.max(G[i], ground[i] - 1);
  return G;
}

function filtfilt(arr, tau, dt) {
  const a = dt / (tau + dt);
  const out = Float64Array.from(arr);
  for (let i = 1; i < out.length; i++) out[i] = out[i - 1] + a * (out[i] - out[i - 1]);
  for (let i = out.length - 2; i >= 0; i--) out[i] = out[i + 1] + a * (out[i] - out[i + 1]);
  return out;
}

/**
 * @param {object} p
 *  start {lat,lon}, courseStart (° rw am Startpunkt), length (m, Start->TGT),
 *  sIP (m, Position des IP auf der Bahn), gs (m/s), agl (m), decelDist (m),
 *  hoverH (m), hoverTime (s), descentRate (m/s),
 *  profile {ds, ground: Float64Array, G: Float64Array}, gTGT (m)
 */
export function buildTrajectory(p) {
  const v0 = p.gs;
  const D = p.length;
  const dDec = Math.min(p.decelDist, D * 0.95);
  const sDec = D - dDec;
  const aDec = (v0 * v0) / (2 * dDec);
  const T1 = sDec / v0;
  const T2 = v0 / aDec;
  const T3 = p.hoverTime;
  const T4 = Math.max(3, (p.hoverH / p.descentRate) * 1.4);
  const T5 = 8;
  const total = T1 + T2 + T3 + T4 + T5;
  const n = Math.ceil(total / DT) + 1;

  const t = new Float64Array(n),
    s = new Float64Array(n),
    v = new Float64Array(n);
  const acc = new Float64Array(n),
    agl = new Float64Array(n),
    w = new Float64Array(n);
  const phase = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const ti = i * DT;
    t[i] = ti;
    if (ti < T1) {
      s[i] = v0 * ti;
      v[i] = v0;
      acc[i] = 0;
      agl[i] = p.agl;
      w[i] = 0;
      phase[i] = s[i] < p.sIP ? 0 : 1;
    } else if (ti < T1 + T2) {
      const tau = ti - T1;
      s[i] = sDec + v0 * tau - 0.5 * aDec * tau * tau;
      v[i] = v0 - aDec * tau;
      acc[i] = -aDec;
      const r = (D - s[i]) / dDec;
      agl[i] = p.hoverH + (p.agl - p.hoverH) * smoothstep(r);
      w[i] = smoothstep(1 - r);
      phase[i] = 2;
    } else if (ti < T1 + T2 + T3) {
      s[i] = D;
      v[i] = 0;
      agl[i] = p.hoverH;
      w[i] = 1;
      phase[i] = 3;
    } else if (ti < T1 + T2 + T3 + T4) {
      const x = (ti - T1 - T2 - T3) / T4;
      s[i] = D;
      v[i] = 0;
      agl[i] = p.hoverH * (0.5 + 0.5 * Math.cos(Math.PI * x));
      w[i] = 1;
      phase[i] = 4;
    } else {
      s[i] = D;
      v[i] = 0;
      agl[i] = 0;
      w[i] = 1;
      phase[i] = 5;
    }
  }

  // Längslage: Trimmlage abhängig von Fahrt + Verzögerung (Flare)
  const pitchRaw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const trim = 2 - 6 * Math.pow(v[i] / 41.2, 1.5);
    const flare = (-Math.atan(acc[i] / G0) * 1.6) / DEG;
    pitchRaw[i] = phase[i] === 5 ? 0.5 : phase[i] === 4 ? 1.5 : trim + flare;
  }
  const pitch = filtfilt(pitchRaw, 1.0, DT);

  // Bodenreferenz entlang der Bahn
  const { ds, G } = p.profile;
  const Gs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = s[i] / ds;
    const k = Math.min(Math.floor(f), G.length - 2);
    const fr = Math.min(Math.max(f - k, 0), 1);
    Gs[i] = G[k] * (1 - fr) + G[k + 1] * fr;
  }

  const phaseNames = [PHASES.LEADIN, PHASES.INBOUND, PHASES.DECEL, PHASES.HOVER, PHASES.DESCENT, PHASES.LANDED];

  return {
    total,
    times: { ip: p.sIP / v0, decel: T1, hover: T1 + T2, descent: T1 + T2 + T3, landed: T1 + T2 + T3 + T4 },
    length: D,
    sIP: p.sIP,
    params: p,
    /** Zustand zur Zeit tt; gTGT = aktuelle Bodenhöhe am TGT (live nachgeführt) */
    sample(tt, gTGT) {
      const x = Math.min(Math.max(tt / DT, 0), n - 1);
      const i = Math.min(Math.floor(x), n - 2);
      const f = x - i;
      const L = (a) => a[i] * (1 - f) + a[i + 1] * f;
      const si = L(s);
      const pos = direct(p.start.lat, p.start.lon, p.courseStart, si);
      const wi = L(w);
      const ground = Gs[i] * (1 - f) + Gs[i + 1] * f;
      const gRef = (1 - wi) * ground + wi * gTGT;
      const ph = phase[f < 0.5 ? i : i + 1];
      // leichte Turbulenz (deterministisch)
      const vi = L(v);
      const amp = ph === 5 ? 0 : 0.25 + 0.75 * (vi / v0);
      const turbRoll =
        amp * 0.7 * (Math.sin(1.31 * tt) + 0.6 * Math.sin(2.93 * tt + 1.1) + 0.3 * Math.sin(5.17 * tt + 2.3));
      const turbPitch = amp * 0.35 * (Math.sin(1.07 * tt + 0.4) + 0.5 * Math.sin(3.41 * tt + 2.0));
      const turbYaw = amp * 0.3 * Math.sin(0.71 * tt + 0.9);
      const bob = ph >= 4 ? 0 : amp * 0.25 * Math.sin(0.93 * tt + 0.2);
      const aglNow = L(agl);
      return {
        t: tt,
        s: si,
        lat: pos.lat,
        lon: pos.lon,
        heading: pos.course2 + turbYaw,
        track: pos.course2,
        gs: vi,
        agl: aglNow,
        alt: gRef + aglNow + (aglNow > 1 ? bob : 0),
        groundRef: gRef,
        pitch: L(pitch) + turbPitch,
        roll: turbRoll,
        phase: phaseNames[ph],
        phaseIndex: ph,
        distToGo: Math.max(0, D - si),
        distToIP: p.sIP - si,
      };
    },
  };
}

/**
 * Konstanter Anflug: Höhe = LZ-Elevation + Anflughöhe, gehalten bis zur Verzögerung.
 * Ragen Gelände/Hindernisse bis auf weniger als minClear an diese Höhe heran, wird lokal
 * (mit begrenzter Steig-/Sinkrate aus dem Geländeprofil Gtf) darüber geflogen.
 * Liefert ein Bodenreferenz-Profil G, so dass G + agl der geflogenen Höhe entspricht.
 */
export function levelProfile(Gtf, gTGT, agl, minClear) {
  const level = gTGT + agl;
  let maxExcess = 0;
  const G = new Float64Array(Gtf.length);
  for (let i = 0; i < Gtf.length; i++) {
    const req = Gtf[i] + minClear;
    maxExcess = Math.max(maxExcess, req - level);
    G[i] = Math.max(level, req) - agl;
  }
  return { G, level, maxExcess };
}
