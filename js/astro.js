// Sonnen- und Mondstand für den Anflug (nach J. Meeus, "Astronomical Algorithms", Kap. 25 und 47,
// gekürzte Reihen: Sonne ~0,01°, Mond ~0,01–0,05°). Topozentrisch (Mondparallaxe) und mit Refraktion.
// Liefert außerdem Phase/Beleuchtung, scheinbare Größe, Helligkeit, Beleuchtungsstärke am Boden
// sowie Auf-/Untergänge und Dämmerungszeiten.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const sin = (d) => Math.sin(d * D2R);
const cos = (d) => Math.cos(d * D2R);
const norm360 = (x) => ((x % 360) + 360) % 360;
const norm180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;

const EARTH_R = 6378.14; // km
const MOON_R = 1737.4; // km
const AU = 149597870.7; // km
const MOON_MEAN_DIAM = 31.09; // Bogenminuten (mittlere Entfernung)

export const julian = (date) => date.getTime() / 86400000 + 2440587.5;

// Meeus Tab. 47.A: [D, M, M', F, Σl (1e-6°), Σr (m)]
const LR = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
];
// Meeus Tab. 47.B: [D, M, M', F, Σb (1e-6°)]
const B = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
];

function obliquity(T) {
  const om = 125.04452 - 1934.136261 * T;
  return { eps: 23.439291 - 0.0130042 * T + 0.00256 * cos(om), om };
}

/** Scheinbare ekliptikale Länge/Entfernung der Sonne */
function sunEcliptic(T) {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) +
    (0.019993 - 0.000101 * T) * sin(2 * M) +
    0.000289 * sin(3 * M);
  const v = M + C;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * cos(v));
  const om = 125.04 - 1934.136 * T;
  return { lon: norm360(L0 + C - 0.00569 - 0.00478 * sin(om)), lat: 0, dist: R * AU };
}

function moonEcliptic(T) {
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.29 * T;
  const A3 = 313.45 + 481266.484 * T;
  let sl = 0,
    sr = 0,
    sb = 0;
  for (const [d, m, mp, f, l, r] of LR) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    const arg = d * D + m * M + mp * Mp + f * F;
    sl += l * e * sin(arg);
    sr += r * e * cos(arg);
  }
  for (const [d, m, mp, f, b] of B) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sb += b * e * sin(d * D + m * M + mp * Mp + f * F);
  }
  sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sb +=
    -2235 * sin(Lp) +
    382 * sin(A3) +
    175 * sin(A1 - F) +
    175 * sin(A1 + F) +
    127 * sin(Lp - Mp) -
    115 * sin(Lp + Mp);
  // Nutation in Länge (Hauptterm) für scheinbare Position
  const om = 125.04452 - 1934.136261 * T;
  const dpsi = -0.004778 * sin(om);
  return { lon: norm360(Lp + sl / 1e6 + dpsi), lat: sb / 1e6, dist: 385000.56 + sr / 1000 };
}

function toEquatorial(lon, lat, eps) {
  const ra = Math.atan2(sin(lon) * cos(eps) - Math.tan(lat * D2R) * sin(eps), cos(lon)) * R2D;
  const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) * R2D;
  return { ra: norm360(ra), dec };
}

/** Mittlere Sternzeit Greenwich (Grad) */
function gmst(jd) {
  const T = (jd - 2451545) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - (T * T * T) / 38710000);
}

/** Azimut (rechtweisend, von Nord) und geometrische Höhe aus Äquatorkoordinaten */
function horizontal(ra, dec, lat, lon, jd) {
  const H = gmst(jd) + lon - ra;
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * R2D;
  const az = Math.atan2(sin(H), cos(H) * sin(lat) - Math.tan(dec * D2R) * cos(lat)) * R2D + 180;
  return { az: norm360(az), alt };
}

/** Atmosphärische Refraktion (Bennett), Grad – für die scheinbare Höhe */
function refraction(h) {
  if (h < -1.5) return 0;
  const hh = Math.max(h, -1);
  return 1 / Math.tan((hh + 7.31 / (hh + 4.4)) * D2R) / 60;
}

function body(which, jd, lat, lon) {
  const T = (jd - 2451545) / 36525;
  const { eps } = obliquity(T);
  const ecl = which === "sun" ? sunEcliptic(T) : moonEcliptic(T);
  const eq = toEquatorial(ecl.lon, ecl.lat, eps);
  const hz = horizontal(eq.ra, eq.dec, lat, lon, jd);
  let geomAlt = hz.alt;
  if (which === "moon") geomAlt -= Math.asin(EARTH_R / ecl.dist) * R2D * cos(hz.alt); // Parallaxe
  return { ...ecl, ...eq, az: hz.az, geomAlt, alt: geomAlt + refraction(geomAlt) };
}

/** Schnelle Höhenberechnung (für Auf-/Untergangssuche): geometrisch, Mond topozentrisch */
function altitude(which, jd, lat, lon) {
  return body(which, jd, lat, lon).geomAlt;
}

/** Beleuchtungsstärke durch die Sonne (lx) – inkl. Dämmerung, logarithmisch interpoliert */
function sunLux(h) {
  if (h > 0) {
    const s = Math.max(sin(h), 0.0001);
    const X = 1 / (s + 0.025 * Math.exp(-11 * s));
    return 400 + 1.1e5 * s * Math.pow(10, -0.4 * 0.25 * X);
  }
  // Dämmerung (Richtwerte, klarer Himmel)
  const tab = [
    [0, 400],
    [-3, 40],
    [-6, 3.4],
    [-9, 0.1],
    [-12, 0.008],
    [-15, 0.0012],
    [-18, 0.0002],
  ];
  if (h <= -18) return 0;
  for (let i = 1; i < tab.length; i++) {
    if (h >= tab[i][0]) {
      const [h0, l0] = tab[i - 1],
        [h1, l1] = tab[i];
      const t = (h - h0) / (h1 - h0);
      return Math.pow(10, Math.log10(l0) + t * (Math.log10(l1) - Math.log10(l0)));
    }
  }
  return 0;
}

const phaseName = (k, waxing) => {
  if (k < 0.03) return "Neumond";
  if (k > 0.97) return "Vollmond";
  if (Math.abs(k - 0.5) < 0.06) return waxing ? "Erstes Viertel" : "Letztes Viertel";
  if (k < 0.5) return waxing ? "zunehmende Sichel" : "abnehmende Sichel";
  return waxing ? "zunehmend (Dreiviertel)" : "abnehmend (Dreiviertel)";
};

/**
 * Sonne und Mond für Zeitpunkt/Ort.
 * Rückgabe: { sun:{az,alt,lux,dist}, moon:{az,alt,illum,phaseAngle,waxing,phase,diamArcmin,sizePct,mag,lux,dist},
 *             lux (gesamt am Boden), light ("DAY"|"CIVIL"|"NAUTICAL"|"HLL"|"LLL"), twilight }
 */
export function sunMoon(date, lat, lon) {
  const jd = julian(date);
  const s = body("sun", jd, lat, lon);
  const m = body("moon", jd, lat, lon);
  // Elongation und Phasenwinkel
  const cpsi = sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra);
  const psi = Math.acos(Math.max(-1, Math.min(1, cpsi)));
  const i = Math.atan2(s.dist * Math.sin(psi), m.dist - s.dist * Math.cos(psi)) * R2D;
  const illum = (1 + cos(i)) / 2;
  const waxing = norm360(m.lon - s.lon) < 180;
  const diam = 2 * Math.asin(MOON_R / (m.dist - EARTH_R * Math.max(0, sin(m.geomAlt)))) * R2D * 60;
  // Scheinbare Helligkeit (Allen) und Beleuchtungsstärke senkrecht zum Mond
  const ia = Math.abs(i);
  const mag = -12.73 + 0.026 * ia + 4e-9 * ia ** 4 + 5 * Math.log10(m.dist / 384400);
  let moonLux = 0;
  if (m.alt > -0.5) {
    const sh = Math.max(sin(m.alt), 0.0001);
    const X = 1 / (sh + 0.025 * Math.exp(-11 * sh));
    moonLux = Math.pow(10, -0.4 * (mag + 14.18)) * Math.pow(10, -0.4 * 0.25 * X) * sh;
  }
  const sLux = sunLux(s.alt);
  const lux = sLux + moonLux + 0.0008; // + Sternenlicht/Airglow (klarer Himmel)
  let light;
  if (s.alt > -0.833) light = "DAY";
  else if (s.alt > -6) light = "CIVIL";
  else if (s.alt > -12) light = "NAUTICAL";
  else light = lux >= 0.0022 ? "HLL" : "LLL";
  return {
    jd,
    sun: { az: s.az, alt: s.alt, geomAlt: s.geomAlt, lux: sLux, dist: s.dist },
    moon: {
      az: m.az,
      alt: m.alt,
      geomAlt: m.geomAlt,
      illum,
      phaseAngle: i,
      waxing,
      phase: phaseName(illum, waxing),
      diamArcmin: diam,
      sizePct: (diam / MOON_MEAN_DIAM) * 100,
      mag,
      lux: moonLux,
      dist: m.dist,
    },
    lux,
    light,
  };
}

/**
 * Auf-/Untergänge und Dämmerung im Zeitfenster [from, to].
 * Ereignisse: SR/SS (Sonne), MR/MS (Mond), BMCT/EECT (bürgerl.), BMNT/EENT (nautisch).
 */
export function events(from, to, lat, lon) {
  const defs = [
    { body: "sun", h0: -0.833, up: "SR", down: "SS", label: ["Sonnenaufgang", "Sonnenuntergang"] },
    { body: "sun", h0: -6, up: "BMCT", down: "EECT", label: ["Beginn bürgerl. Dämmerung", "Ende bürgerl. Dämmerung"] },
    { body: "sun", h0: -12, up: "BMNT", down: "EENT", label: ["Beginn naut. Dämmerung", "Ende naut. Dämmerung"] },
    { body: "moon", h0: -0.833, up: "MR", down: "MS", label: ["Mondaufgang", "Monduntergang"] },
  ];
  const step = 10 * 60e3;
  const t0 = from.getTime(),
    t1 = to.getTime();
  const out = [];
  const alts = { sun: [], moon: [] };
  const times = [];
  for (let t = t0; t <= t1 + 1; t += step) {
    times.push(t);
    const jd = julian(new Date(t));
    alts.sun.push(altitude("sun", jd, lat, lon));
    alts.moon.push(altitude("moon", jd, lat, lon));
  }
  for (const d of defs) {
    const a = alts[d.body];
    for (let k = 1; k < a.length; k++) {
      const p = a[k - 1] - d.h0,
        q = a[k] - d.h0;
      if ((p < 0) === (q < 0)) continue;
      // Bisektion auf ~30 s genau
      let lo = times[k - 1],
        hi = times[k];
      for (let n = 0; n < 6; n++) {
        const mid = (lo + hi) / 2;
        const v = altitude(d.body, julian(new Date(mid)), lat, lon) - d.h0;
        if (v < 0 === p < 0) lo = mid;
        else hi = mid;
      }
      const rising = p < 0;
      out.push({
        t: new Date((lo + hi) / 2),
        code: rising ? d.up : d.down,
        label: d.label[rising ? 0 : 1],
        body: d.body,
        rising,
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export const LIGHT_LABEL = {
  DAY: "Tag",
  CIVIL: "Bürgerliche Dämmerung",
  NAUTICAL: "Nautische Dämmerung",
  HLL: "Nacht · High Light Level",
  LLL: "Nacht · Low Light Level",
};

/** Seitenangabe relativ zum Kurs: "12° L" / "30° R" / "voraus" / "achteraus" */
export function relText(rel) {
  const r = Math.round(norm180(rel));
  if (Math.abs(r) <= 2) return "genau voraus";
  if (Math.abs(r) >= 178) return "genau achteraus";
  return `${Math.abs(r)}° ${r < 0 ? "links" : "rechts"}`;
}

/**
 * Bewertung der Auswirkungen auf den Anflug.
 * a: sunMoon()-Ergebnis, courseTrue: Anflugkurs rechtweisend.
 * Rückgabe: Liste { level: "danger"|"warn"|"info"|"good", icon, text }
 */
export function assess(a, courseTrue) {
  const res = [];
  const s = a.sun,
    m = a.moon;
  const sRel = norm180(s.az - courseTrue);
  const mRel = norm180(m.az - courseTrue);
  const side = (r) => (Math.abs(r) <= 3 ? "genau von vorne" : `${Math.abs(Math.round(r))}° ${r < 0 ? "links" : "rechts"} voraus`);
  if (s.alt > -0.833) {
    if (Math.abs(sRel) <= 30 && s.alt < 25)
      res.push({
        level: "danger",
        icon: "☀",
        text: `Sonne ${side(sRel)}, ${Math.round(s.alt)}° hoch: starke Blendung im Endanflug – LZ, Leitungen und Hindernisse vor dem hellen Hintergrund kaum erkennbar, Scheibe/Visier streuen Licht.`,
      });
    else if (Math.abs(sRel) <= 60 && s.alt < 40)
      res.push({
        level: "warn",
        icon: "☀",
        text: `Sonne schräg von vorne (${relText(sRel)}, ${Math.round(s.alt)}° hoch): Blendung beim Blick nach ${sRel < 0 ? "links" : "rechts"}, Kontrastverlust in dieser Richtung.`,
      });
    else if (Math.abs(sRel) >= 135 && s.alt < 30)
      res.push({
        level: "good",
        icon: "☀",
        text: `Sonne im Rücken (${relText(sRel)}, ${Math.round(s.alt)}° hoch): gute Sicht nach vorne, LZ gut ausgeleuchtet – eigener Schatten läuft voraus (verrät Anflug).`,
      });
    else
      res.push({
        level: "info",
        icon: "☀",
        text: `Sonne ${relText(sRel)}, ${Math.round(s.alt)}° hoch: ${s.alt >= 40 ? "hoch stehend, kaum Blendung, kurze Schatten" : "seitlich, geringe Blendwirkung"}.`,
      });
    if (s.alt < 10)
      res.push({
        level: "info",
        icon: "◐",
        text: `Tiefe Sonne: lange Schatten – Senken, Gräben und Hindernisse im Schatten schwer einzuschätzen.`,
      });
    return res;
  }
  if (a.light === "CIVIL" || a.light === "NAUTICAL") {
    const glow = Math.abs(norm180(s.az - courseTrue)) <= 60;
    res.push({
      level: "warn",
      icon: "◐",
      text: `${LIGHT_LABEL[a.light]} (Sonne ${Math.round(s.alt)}°): Übergang Tag/NVG – ${glow ? "heller Horizont voraus überstrahlt die NVG, Gelände davor wirkt schwarz" : "NVG-Bild kontrastarm, Horizont " + (sRel < 0 ? "links" : "rechts") + "/hinten hell"}.`,
    });
  }
  if (m.alt <= -0.5) {
    res.push({
      level: a.light === "LLL" ? "warn" : "info",
      icon: "☾",
      text: `Mond unter dem Horizont – kein Mondlicht. Restlicht nur von Sternen/Airglow: ${a.light === "LLL" ? "Low Light Level, NVG-Bild verrauscht und kontrastarm, Hindernisse/Leitungen spät erkennbar." : "Lichtlevel durch Dämmerung bestimmt."}`,
    });
    return res;
  }
  const pct = Math.round(m.illum * 100);
  const bright = m.illum >= 0.25;
  if (Math.abs(mRel) <= 22 && m.alt < 35) {
    res.push({
      level: bright ? "danger" : "warn",
      icon: "☾",
      text: `Mond ${side(mRel)}, ${Math.round(m.alt)}° hoch, ${pct} % beleuchtet – liegt im 40°-NVG-Sichtfeld: die automatische Helligkeitsregelung (Auto-Gain) regelt auf den hellen Mond herunter, die Außensicht ${bright ? "wird stark abgedunkelt" : "dunkelt ab"}, Halo um den Mond – LZ und Hindernisse vor dem Mond kaum erkennbar.`,
    });
  } else if (Math.abs(mRel) <= 50 && m.alt < 45) {
    res.push({
      level: bright ? "warn" : "info",
      icon: "☾",
      text: `Mond schräg voraus (${relText(mRel)}, ${Math.round(m.alt)}°, ${pct} %): beim Blick nach ${mRel < 0 ? "links" : "rechts"} kommt der Mond ins NVG-Sichtfeld → Auto-Gain dunkelt das Bild ab.`,
    });
  } else if (Math.abs(mRel) >= 120) {
    res.push({
      level: "good",
      icon: "☾",
      text: `Mond im Rücken (${relText(mRel)}, ${Math.round(m.alt)}°, ${pct} %): LZ von hinten ausgeleuchtet, NVG regelt nicht ab – gute Bedingungen${m.alt < 15 ? "; lange Schatten voraus" : ""}.`,
    });
  } else {
    res.push({
      level: "info",
      icon: "☾",
      text: `Mond ${relText(mRel)}, ${Math.round(m.alt)}° hoch, ${pct} % beleuchtet: seitliches Licht, plastisches Geländebild, kein Abregeln bei Blick nach vorne.`,
    });
  }
  if (m.alt < 15 && m.illum > 0.15 && Math.abs(mRel) < 120)
    res.push({
      level: "info",
      icon: "◐",
      text: `Tiefer Mond: lange Mondschatten – Hindernisse und Senken in Schattenbereichen schwer erkennbar.`,
    });
  if (a.light === "LLL")
    res.push({
      level: "warn",
      icon: "✦",
      text: `Low Light Level (${a.lux.toExponential(1)} lx): wenig Restlicht, NVG-Bild verrauscht – Abstände und Höhen schwer zu schätzen.`,
    });
  return res;
}

export { norm180 as astroNorm180 };
