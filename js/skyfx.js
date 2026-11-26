// Sonne und Mond in der Szene: phasenrichtiger Mond, Blendung durch die Sonne (Tag),
// Restlicht und automatische Helligkeitsregelung (Auto-Gain/ABC) der NVG beim Blick in den Mond.

import { sunMoon } from "./astro.js?v=25";

const Cesium = window.Cesium;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const MOON_DIST = 120000; // m – Billboard-Abstand (Tiefentest gegen Gelände bleibt korrekt)

/** Mondscheibe mit Phase; beleuchteter Rand oben (+y), Phasenwinkel i in Grad */
function drawMoon(canvas, i) {
  const N = canvas.width;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(N, N);
  const lx = 0,
    ly = Math.sin(i * D2R),
    lz = Math.cos(i * D2R);
  // grobe "Maria" (dunkle Flächen) für ein mondähnliches Aussehen
  const maria = [
    [-0.25, 0.3, 0.28, 0.75],
    [0.15, 0.35, 0.22, 0.78],
    [0.3, 0.05, 0.2, 0.8],
    [-0.35, -0.15, 0.25, 0.8],
    [0.05, -0.1, 0.16, 0.82],
    [-0.05, -0.55, 0.12, 0.85],
  ];
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = (px + 0.5) / (N / 2) - 1;
      const y = 1 - (py + 0.5) / (N / 2);
      const r2 = x * x + y * y;
      const o = (py * N + px) * 4;
      if (r2 > 1) {
        img.data[o + 3] = 0;
        continue;
      }
      const z = Math.sqrt(1 - r2);
      let alb = 1;
      for (const [mx, my, mr, a] of maria) {
        const d = Math.hypot(x - mx, y - my) / mr;
        if (d < 1) alb *= a + (1 - a) * d * d;
      }
      const lit = x * lx + y * ly + z * lz;
      // weicher Terminator + Aschgrau (Erdschein) auf der Nachtseite
      let v = lit > 0 ? Math.pow(lit, 0.45) : 0;
      v = Math.max(v * alb, 0.045);
      const edge = 1 - Math.max(0, (Math.sqrt(r2) - 0.94) / 0.06);
      img.data[o] = Math.round(255 * v * 0.98);
      img.data[o + 1] = Math.round(255 * v * 0.97);
      img.data[o + 2] = Math.round(255 * v * 0.92);
      img.data[o + 3] = Math.round(255 * clamp(edge, 0, 1) * (v > 0.05 ? 1 : 0.55));
    }
  }
  ctx.putImageData(img, 0, 0);
}

export class SkyFx {
  constructor(viewer, visual) {
    this.viewer = viewer;
    this.visual = visual;
    this.scene = viewer.scene;
    this.loc = null;
    this.date = null;
    this.astro = null;
    this.lastJd = 0;
    this.suspended = false;
    this.occl = { sun: false, moon: false, t: 0 };
    this.state = null;
    this.moonCanvas = document.createElement("canvas");
    this.moonCanvas.width = this.moonCanvas.height = 128;
    this.moonPhase = -1;
    this.collection = this.scene.primitives.add(new Cesium.BillboardCollection());
    this.moon = this.collection.add({
      position: Cesium.Cartesian3.ZERO,
      image: this.moonCanvas,
      sizeInMeters: true,
      width: 1000,
      height: 1000,
      show: false,
    });
    this.sunLight = new Cesium.SunLight();
    this.nvgLight = new Cesium.DirectionalLight({ direction: new Cesium.Cartesian3(0, 0, -1), intensity: 2.0 });
    this.last = performance.now();
    this.scene.preRender.addEventListener(() => this.update());
  }

  /** Zeitpunkt und Ort (Grad) setzen */
  setTime(date, loc) {
    this.date = date;
    if (loc) this.loc = loc;
    this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(date);
    const jd = date.getTime() / 86400000;
    // alle ~2 s Simulationszeit neu rechnen
    if (!this.astro || Math.abs(jd - this.lastJd) * 86400 > 2 || this.locChanged) {
      this.astro = this.loc ? sunMoon(date, this.loc.lat, this.loc.lon) : null;
      this.lastJd = jd;
      this.locChanged = false;
    }
  }

  setLocation(loc) {
    this.loc = loc;
    this.locChanged = true;
  }

  /** Richtung (Weltkoordinaten) zu Azimut/Höhe am Punkt p */
  dirWorld(p, az, alt) {
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(p);
    const ca = Math.cos(alt * D2R);
    const local = new Cesium.Cartesian3(ca * Math.sin(az * D2R), ca * Math.cos(az * D2R), Math.sin(alt * D2R));
    const w = Cesium.Matrix4.multiplyByPointAsVector(enu, local, new Cesium.Cartesian3());
    return Cesium.Cartesian3.normalize(w, w);
  }

  /** Gelände zwischen Kamera und Gestirn? (nur Globus; 3D-Tiles werden nicht geprüft) */
  occluded(pos, dir) {
    const globe = this.scene.globe;
    if (!globe.show) return false;
    try {
      const hit = globe.pick(new Cesium.Ray(pos, dir), this.scene);
      return !!hit && Cesium.Cartesian3.distance(hit, pos) < 80000;
    } catch {
      return false;
    }
  }

  /** Bildposition (Texturkoordinaten, Ursprung unten links) und Winkel zur Blickrichtung */
  screen(dir) {
    const cam = this.scene.camera;
    const x = Cesium.Cartesian3.dot(dir, cam.rightWC);
    const y = Cesium.Cartesian3.dot(dir, cam.upWC);
    const z = Cesium.Cartesian3.dot(dir, cam.directionWC);
    const fr = cam.frustum;
    const fovy = fr.fovy ?? fr.fov;
    const ty = Math.tan(fovy / 2);
    const asp = fr.aspectRatio || this.scene.canvas.width / this.scene.canvas.height;
    const angle = Math.acos(clamp(z, -1, 1)) / D2R;
    if (z <= 0.01) return { angle, on: false, u: -10, v: -10 };
    const u = 0.5 + (0.5 * x) / z / (ty * asp);
    const v = 0.5 + (0.5 * y) / z / ty;
    return { angle, u, v, on: u > -0.05 && u < 1.05 && v > -0.05 && v < 1.05, pxPerRad: this.scene.drawingBufferHeight / 2 / ty };
  }

  update() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    const a = this.astro;
    const fx = this.visual.fx;
    const scene = this.scene;
    const nvg = this.visual.mode === "nvg";
    if (!a || this.suspended || !(scene.camera.frustum instanceof Cesium.PerspectiveFrustum)) {
      this.moon.show = false;
      this.visual.glare.enabled = false;
      return;
    }
    const cam = scene.camera;
    const pos = cam.positionWC;
    const sunDir = this.dirWorld(pos, a.sun.az, a.sun.alt);
    const moonDir = this.dirWorld(pos, a.moon.az, a.moon.alt);

    const ss = this.screen(sunDir);
    const ms = this.screen(moonDir);
    // Verdeckung durch Gelände und Cockpitrahmen (4 Hz)
    if (now - this.occl.t > 250) {
      this.occl.t = now;
      this.occl.sun = a.sun.alt > -1 && a.sun.alt < 25 ? this.occluded(pos, sunDir) : false;
      this.occl.moon = a.moon.alt > -1 && a.moon.alt < 25 ? this.occluded(pos, moonDir) : false;
      const c = scene.canvas;
      const fo = (p) => p.on && this.frameOccludes && this.frameOccludes(p.u * c.clientWidth, (1 - p.v) * c.clientHeight);
      this.occl.sunFrame = a.sun.alt > -1 && fo(ss);
      this.occl.moonFrame = a.moon.alt > -1 && fo(ms);
    }
    const sunVisible = a.sun.alt > -0.6 && !this.occl.sun;
    const moonVisible = a.moon.alt > -0.4 && !this.occl.moon && !this.occl.moonFrame;

    // ---- Mond (Billboard, Tiefentest gegen Gelände/Gebäude) ----
    const k = Math.round(a.moon.phaseAngle);
    if (k !== this.moonPhase) {
      this.moonPhase = k;
      drawMoon(this.moonCanvas, a.moon.phaseAngle);
      this.moon.setImage(`moon${k}`, this.moonCanvas);
    }
    const mPos = Cesium.Cartesian3.add(
      pos,
      Cesium.Cartesian3.multiplyByScalar(moonDir, MOON_DIST, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const size = 2 * MOON_DIST * Math.tan(((a.moon.diamArcmin / 60) * D2R) / 2);
    this.moon.position = mPos;
    this.moon.width = this.moon.height = size;
    // beleuchteter Rand zeigt zur Sonne: Sonnenrichtung senkrecht zur Mondrichtung
    const sp = Cesium.Cartesian3.subtract(
      sunDir,
      Cesium.Cartesian3.multiplyByScalar(moonDir, Cesium.Cartesian3.dot(sunDir, moonDir), new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitude(sp) > 1e-6) this.moon.alignedAxis = Cesium.Cartesian3.normalize(sp, sp);
    const dayFade = 1 - 0.55 * smooth(-4, 6, a.sun.alt);
    this.moon.color = new Cesium.Color(1, 1, 1, dayFade);
    this.moon.show = a.moon.alt > -1;

    // ---- Licht für Gelände/Modelle ----
    const globe = scene.globe;
    if (nvg) {
      globe.enableLighting = false;
      const ld = Cesium.Cartesian3.negate(a.moon.alt > 5 ? moonDir : this.dirWorld(pos, 0, 70), new Cesium.Cartesian3());
      this.nvgLight.direction = ld;
      scene.light = this.nvgLight;
    } else {
      globe.enableLighting = true;
      this.sunLight.intensity = 0.35 + 1.65 * smooth(-6, 12, a.sun.alt);
      scene.light = this.sunLight;
    }

    // ---- Blendung durch die Sonne (Tagansicht) ----
    const sunI = sunVisible ? smooth(-0.6, 3, a.sun.alt) * (0.75 + 0.25 * smooth(3, 15, a.sun.alt)) : 0;
    const th = ss.angle;
    // hinter Dach/Strebe: nur noch Streulicht der Scheibe, kein Sonnenkern
    const veilT = clamp(sunI * (0.85 * Math.exp(-th / 10) + 0.35 * Math.exp(-th / 28)), 0, 1) * (this.occl.sunFrame ? 0.3 : 1);
    const coreT = ss.on && !this.occl.sunFrame ? sunI : 0;
    // Auge/Scheibe reagieren nicht schlagartig
    const kk = 1 - Math.exp(-dt / 0.15);
    fx.veil += (veilT - fx.veil) * kk;
    fx.sunCore += (coreT - fx.sunCore) * (ss.on ? 1 : kk);
    fx.sunUv = new Cesium.Cartesian2(ss.u, ss.v);
    this.visual.glare.enabled = !nvg && fx.veil + fx.sunCore > 0.002;

    // ---- NVG: Restlicht, Mond im Sichtfeld -> Auto-Gain ----
    const lux = a.lux;
    const t = clamp((Math.log10(lux) - Math.log10(3e-4)) / (Math.log10(0.05) - Math.log10(3e-4)), 0, 1);
    fx.noise = 0.11 + 0.33 * (1 - t);
    fx.contrast = 0.55 + 0.45 * t;
    fx.level = 0.7 + 0.3 * t;
    fx.whiteout = smooth(-7, 1, a.sun.alt);
    // Helligkeit des Mondes relativ zum Vollmond (Phasengesetz) – auch eine Sichel regelt merklich ab
    const mBright = clamp(Math.pow(10, -0.4 * (a.moon.mag + 12.73)), 0, 1.2);
    const mStrength = moonVisible ? clamp(0.3 + 0.75 * Math.sqrt(mBright), 0, 1) * smooth(-0.4, 2, a.moon.alt) : 0;
    // 40°-Sichtfeld der Brille um die Blickrichtung: voll im Bild bis ~17°, Rand bis ~28°
    const inFov = 1 - smooth(16, 28, ms.angle);
    const abcT = 1 - 0.86 * mStrength * inFov * (1 - fx.whiteout);
    // Auto-Gain regelt schnell herunter und langsamer wieder hoch
    const ka = 1 - Math.exp(-dt / (abcT < fx.abc ? 0.18 : 0.6));
    fx.abc += (abcT - fx.abc) * ka;
    fx.moonUv = new Cesium.Cartesian2(ms.u, ms.v);
    fx.moonR = ms.on ? ((a.moon.diamArcmin / 120) * D2R) * ms.pxPerRad : 0;
    fx.moonHalo = ms.on ? mStrength * (0.55 + 0.45 * inFov) : 0;

    this.state = {
      astro: a,
      sunVisible,
      moonVisible,
      sunAngle: ss.angle,
      moonAngle: ms.angle,
      glare: fx.veil,
      abc: fx.abc,
      moonInFov: inFov * mStrength,
      nvg,
    };
  }
}
