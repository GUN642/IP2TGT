// Geodäsie, Koordinaten-Parser/-Formatierung und Missweisung (WMM2025).
// Reine Funktionen ohne Cesium-Abhängigkeit (in Node testbar).

import { forward as mgrsForward, toPoint as mgrsToPoint } from "./vendor/mgrs.esm.js?v=8";
import { WMM2025 } from "./wmm2025.js?v=8";

export const NM = 1852; // m
export const FT = 0.3048; // m
export const KT = 1852 / 3600; // m/s

const DEG = Math.PI / 180;
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);

export const norm360 = (d) => ((d % 360) + 360) % 360;
export const norm180 = (d) => {
  const x = norm360(d);
  return x > 180 ? x - 360 : x;
};

// ---------------------------------------------------------------------------
// Vincenty (WGS84) – inverse & direct
// ---------------------------------------------------------------------------

/** Distanz [m] und Anfangs-/Endkurs [° rw] zwischen zwei Punkten. */
export function inverse(lat1, lon1, lat2, lon2) {
  const a = WGS84_A,
    b = WGS84_B,
    f = WGS84_F;
  const L = (lon2 - lon1) * DEG;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * DEG));
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * DEG));
  const sinU1 = Math.sin(U1),
    cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2),
    cosU2 = Math.cos(U2);
  let lambda = L,
    lambdaP,
    iter = 0;
  let sinLambda, cosLambda, sinSigma, cosSigma, sigma, sinAlpha, cos2Alpha, cos2SigmaM;
  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2);
    if (sinSigma === 0) return { distance: 0, course1: 0, course2: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cos2Alpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha : 0;
    const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    lambdaP = lambda;
    lambda =
      L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && ++iter < 200);

  const u2 = (cos2Alpha * (a * a - b * b)) / (b * b);
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
  const distance = b * A * (sigma - dSigma);
  const course1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) / DEG;
  const course2 = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda) / DEG;
  return { distance, course1: norm360(course1), course2: norm360(course2) };
}

/** Zielpunkt aus Startpunkt, Kurs [° rw] und Distanz [m]. */
export function direct(lat1, lon1, courseDeg, distance) {
  const a = WGS84_A,
    b = WGS84_B,
    f = WGS84_F;
  const alpha1 = courseDeg * DEG;
  const sinAlpha1 = Math.sin(alpha1),
    cosAlpha1 = Math.cos(alpha1);
  const tanU1 = (1 - f) * Math.tan(lat1 * DEG);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1),
    sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cos2Alpha = 1 - sinAlpha * sinAlpha;
  const u2 = (cos2Alpha * (a * a - b * b)) / (b * b);
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  let sigma = distance / (b * A),
    sigmaP,
    iter = 0;
  let cos2SigmaM, sinSigma, cosSigma;
  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const dSigma =
      B *
      sinSigma *
      (cos2SigmaM +
        (B / 4) *
          (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
            (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
    sigmaP = sigma;
    sigma = distance / (b * A) + dSigma;
  } while (Math.abs(sigma - sigmaP) > 1e-12 && ++iter < 200);

  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const lat2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp),
  );
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
  const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
  const L =
    lambda - (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  const course2 = Math.atan2(sinAlpha, -tmp) / DEG;
  return { lat: lat2 / DEG, lon: norm180(lon1 + L / DEG), course2: norm360(course2) };
}

// ---------------------------------------------------------------------------
// Missweisung – World Magnetic Model 2025
// ---------------------------------------------------------------------------

/** Missweisung (Deklination) in Grad, Ost positiv. altM in m über Ellipsoid. */
export function magneticDeclination(lat, lon, altM = 0, date = new Date()) {
  const m = WMM2025;
  const N = m.n_max;
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const yearLen = Date.UTC(date.getUTCFullYear() + 1, 0, 1) - yearStart;
  const decYear = date.getUTCFullYear() + (date.getTime() - yearStart) / yearLen;
  const dt = decYear - m.epoch;

  // geodätisch -> geozentrisch sphärisch
  const a = 6378.137,
    f = 1 / 298.257223563,
    e2 = f * (2 - f);
  const h = altM / 1000;
  const phi = lat * DEG,
    lam = lon * DEG;
  const sinPhi = Math.sin(phi),
    cosPhi = Math.cos(phi);
  const Rc = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const p = (Rc + h) * cosPhi;
  const z = (Rc * (1 - e2) + h) * sinPhi;
  const r = Math.hypot(p, z);
  const phiC = Math.asin(z / r);

  // Schmidt-semi-normierte Legendre-Funktionen in der Kolatitude
  const theta = Math.PI / 2 - phiC;
  const c = Math.cos(theta);
  const s = Math.max(Math.sin(theta), 1e-12);
  const P = [],
    dP = [];
  for (let n = 0; n <= N; n++) {
    P.push(new Float64Array(N + 1));
    dP.push(new Float64Array(N + 1));
  }
  P[0][0] = 1;
  dP[0][0] = 0;
  for (let n = 1; n <= N; n++) {
    for (let mm = 0; mm <= n; mm++) {
      if (n === mm) {
        if (n === 1) {
          P[1][1] = s;
          dP[1][1] = c;
        } else {
          const k = Math.sqrt((2 * n - 1) / (2 * n));
          P[n][n] = k * s * P[n - 1][n - 1];
          dP[n][n] = k * (c * P[n - 1][n - 1] + s * dP[n - 1][n - 1]);
        }
      } else {
        const k1 = 2 * n - 1;
        const k2 = n >= 2 && n - 2 >= mm ? Math.sqrt((n - 1) ** 2 - mm * mm) : 0;
        const k3 = Math.sqrt(n * n - mm * mm);
        const P2 = n - 2 >= mm ? P[n - 2][mm] : 0;
        const dP2 = n - 2 >= mm ? dP[n - 2][mm] : 0;
        P[n][mm] = (k1 * c * P[n - 1][mm] - k2 * P2) / k3;
        dP[n][mm] = (k1 * (c * dP[n - 1][mm] - s * P[n - 1][mm]) - k2 * dP2) / k3;
      }
    }
  }

  const aRef = 6371.2;
  let Br = 0,
    Bt = 0,
    Bl = 0;
  for (let n = 1; n <= N; n++) {
    const ar = Math.pow(aRef / r, n + 2);
    for (let mm = 0; mm <= n; mm++) {
      const k = (n * (n + 1)) / 2 + mm;
      const g = m.main_field_coeff_g[k] + dt * m.secular_var_coeff_g[k];
      const hh = m.main_field_coeff_h[k] + dt * m.secular_var_coeff_h[k];
      const cm = Math.cos(mm * lam),
        sm = Math.sin(mm * lam);
      Br += (n + 1) * ar * (g * cm + hh * sm) * P[n][mm];
      Bt -= ar * (g * cm + hh * sm) * dP[n][mm];
      Bl += (ar * mm * (g * sm - hh * cm) * P[n][mm]) / s;
    }
  }
  const Xp = -Bt,
    Yp = Bl,
    Zp = -Br;
  const psi = phiC - phi;
  const X = Xp * Math.cos(psi) - Zp * Math.sin(psi);
  const Y = Yp;
  return Math.atan2(Y, X) / DEG;
}

// ---------------------------------------------------------------------------
// Koordinaten-Parser
// ---------------------------------------------------------------------------

const MGRS_FULL = /^(\d{1,2})\s*([C-HJ-NP-X])\s*([A-HJ-NP-Z])\s*([A-HJ-V])\s*(\d*)\s*(\d*)$/;
const MGRS_SHORT = /^([A-HJ-NP-Z])\s*([A-HJ-V])\s*(\d+)\s*(\d*)$/;

/**
 * Erkennt MGRS (auch mit Leerzeichen, oder kurz "MA 778 515" mit Zone aus refMgrs)
 * sowie Lat/Lon in Dezimalgrad, Grad-Minuten und Grad-Minuten-Sekunden.
 * Gibt {lat, lon, type} zurück oder wirft einen Error mit verständlicher Meldung.
 */
export function parseCoordinate(input, refMgrs) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Keine Eingabe");
  const up = raw.toUpperCase();

  let mm = up.match(MGRS_FULL);
  if (!mm && refMgrs) {
    const sm = up.match(MGRS_SHORT);
    const ref = String(refMgrs)
      .toUpperCase()
      .replace(/\s+/g, "")
      .match(/^(\d{1,2}[C-HJ-NP-X])/);
    if (sm && ref) mm = (ref[1] + up.replace(/\s+/g, "")).match(MGRS_FULL);
  }
  if (mm) {
    let e = mm[5],
      n = mm[6];
    if (!n) {
      if (e.length % 2) throw new Error("MGRS: ungerade Anzahl Ziffern");
      n = e.slice(e.length / 2);
      e = e.slice(0, e.length / 2);
    }
    if (e.length !== n.length) throw new Error("MGRS: Rechts- und Hochwert unterschiedlich lang");
    if (e.length > 5) throw new Error("MGRS: maximal 5+5 Ziffern");
    const zone = parseInt(mm[1], 10);
    if (zone < 1 || zone > 60) throw new Error("MGRS: Zone 1–60");
    const str = `${zone}${mm[2]}${mm[3]}${mm[4]}${e}${n}`;
    let pt;
    try {
      pt = mgrsToPoint(str);
    } catch (err) {
      throw new Error("MGRS ungültig: " + err.message);
    }
    if (!pt || !isFinite(pt[0]) || !isFinite(pt[1])) throw new Error("MGRS ungültig");
    return { lat: pt[1], lon: pt[0], type: "MGRS", precision: e.length };
  }
  return parseLatLon(up);
}

function parseLatLon(up) {
  let s = up
    .replace(/[°º˚]/g, " ")
    .replace(/[′'’´`]/g, " ")
    .replace(/[″"”]/g, " ")
    .replace(/\bO\b|(?<=\d)O|O(?=\s*\d)/g, "E") // deutsch "O" = Ost
    .trim();

  // Deutsches Dezimalkomma "50,123 8,456"
  if (/^[NSEW]?\s*-?\d+,\d+\s*[NSEW]?[\s;/]+[NSEW]?\s*-?\d+,\d+\s*[NSEW]?$/.test(s)) {
    s = s.replace(/(\d),(\d)/g, "$1.$2");
  }
  s = s.replace(/[;,/]/g, " ").replace(/\s+/g, " ").trim();

  // In zwei Hälften teilen: bevorzugt an Hemisphären-Buchstaben
  let parts = null;
  const hemi = [...s.matchAll(/[NSEW]/g)];
  if (hemi.length === 2) {
    const prefix = /^[NSEW]/.test(s);
    if (prefix) {
      const i = hemi[1].index;
      parts = [s.slice(0, i), s.slice(i)];
    } else {
      const i = hemi[0].index + 1;
      parts = [s.slice(0, i), s.slice(i)];
    }
  } else if (hemi.length === 0) {
    const nums = s.split(" ").filter(Boolean);
    if (nums.length % 2 || nums.length === 0 || nums.length > 6) {
      throw new Error("Format nicht erkannt (MGRS oder Lat/Lon)");
    }
    const k = nums.length / 2;
    parts = [nums.slice(0, k).join(" "), nums.slice(k).join(" ")];
  } else {
    throw new Error("Format nicht erkannt (Hemisphären N/S und E/W angeben)");
  }

  const vals = parts.map((p, idx) => parseAngle(p.trim(), idx));
  let lat, lon;
  const latIdx = vals.findIndex((v) => v.axis === "lat");
  const lonIdx = vals.findIndex((v) => v.axis === "lon");
  if (latIdx >= 0 && lonIdx >= 0 && latIdx !== lonIdx) {
    lat = vals[latIdx].value;
    lon = vals[lonIdx].value;
  } else if (latIdx < 0 && lonIdx < 0) {
    lat = vals[0].value;
    lon = vals[1].value;
  } else if (latIdx === 1 || lonIdx === 0) {
    lat = vals[1].value;
    lon = vals[0].value;
  } else {
    lat = vals[0].value;
    lon = vals[1].value;
  }
  if (!(Math.abs(lat) <= 90)) throw new Error("Breite außerhalb ±90°");
  if (!(Math.abs(lon) <= 180)) throw new Error("Länge außerhalb ±180°");
  return { lat, lon, type: "LATLON" };
}

function parseAngle(str, idx) {
  let sign = 1,
    axis = null;
  const h = str.match(/[NSEW]/);
  if (h) {
    axis = h[0] === "N" || h[0] === "S" ? "lat" : "lon";
    if (h[0] === "S" || h[0] === "W") sign = -1;
  }
  let t = str.replace(/[NSEW]/g, " ").trim();
  if (t.startsWith("-")) {
    sign *= -1;
    t = t.slice(1);
  } else if (t.startsWith("+")) t = t.slice(1);
  const nums = t.split(/\s+/).filter(Boolean);
  if (!nums.length || nums.some((n) => !/^\d+(\.\d+)?$/.test(n))) {
    throw new Error("Ungültige Zahl in Koordinate");
  }
  let v;
  if (nums.length === 1) {
    const n = nums[0];
    const intPart = n.split(".")[0];
    const isLon = axis === "lon" || (axis === null && idx === 1);
    // Kompakt: DDMM.mm / DDDMM.mm bzw. DDMMSS / DDDMMSS
    const degDigits = isLon ? 3 : 2;
    if (intPart.length === degDigits + 2 && axis) {
      v = parseInt(intPart.slice(0, degDigits), 10) + parseFloat(n.slice(degDigits)) / 60;
    } else if (intPart.length === degDigits + 4 && axis) {
      v =
        parseInt(intPart.slice(0, degDigits), 10) +
        parseInt(intPart.slice(degDigits, degDigits + 2), 10) / 60 +
        parseFloat(n.slice(degDigits + 2)) / 3600;
    } else {
      v = parseFloat(n);
    }
  } else {
    const d = parseFloat(nums[0]);
    const mi = parseFloat(nums[1]);
    const se = nums.length > 2 ? parseFloat(nums[2]) : 0;
    if (mi >= 60 || se >= 60) throw new Error("Minuten/Sekunden müssen < 60 sein");
    v = d + mi / 60 + se / 3600;
  }
  return { value: sign * v, axis };
}

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

export function toMgrs(lat, lon, digits = 5) {
  try {
    const m = mgrsForward([lon, lat], digits);
    const k = m.length - 2 * digits;
    return `${m.slice(0, k - 2)} ${m.slice(k - 2, k)} ${m.slice(k, k + digits)} ${m.slice(k + digits)}`;
  } catch {
    return "—";
  }
}

export function formatDDM(lat, lon) {
  const f = (v, pos, neg, w) => {
    const h = v >= 0 ? pos : neg;
    const a = Math.abs(v);
    let d = Math.floor(a);
    let m = (a - d) * 60;
    if (m >= 59.9995) {
      d += 1;
      m = 0;
    }
    return `${h}${String(d).padStart(w, "0")}°${m.toFixed(3).padStart(6, "0")}'`;
  };
  return `${f(lat, "N", "S", 2)} ${f(lon, "E", "W", 3)}`;
}

export function formatDec(lat, lon) {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export function fmtCourse(deg) {
  return String(Math.round(norm360(deg)) % 360 || 360).padStart(3, "0");
}

export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
