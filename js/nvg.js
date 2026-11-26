// Tag-/NVG-Darstellung: Post-Processing (grüner Phosphor, Rauschen, NIR-Vegetation) und Szenen-Umgebung.

const Cesium = window.Cesium;

const NVG_SHADER = `
uniform sampler2D colorTexture;
uniform float u_time;
uniform float u_gain;
uniform float u_noise;
uniform vec3 u_phosphor;
uniform float u_contrast;   // Kontrast nach Restlicht (LLL: flach)
uniform float u_whiteout;   // Sonne/Dämmerung: Röhre übersteuert
uniform vec2 u_moonUv;      // Mond im Bild (Texturkoordinaten)
uniform float u_moonR;      // Mondradius in Pixeln
uniform float u_moonHalo;   // 0..1 Halo/Überstrahlung des Mondes
in vec2 v_textureCoordinates;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec2 res = vec2(textureSize(colorTexture, 0));
  vec2 px = 1.0 / res;
  // leichte Unschärfe (Bildverstärker-Auflösung)
  vec3 c = texture(colorTexture, uv).rgb * 0.4;
  c += texture(colorTexture, uv + vec2(px.x, 0.0)).rgb * 0.15;
  c += texture(colorTexture, uv - vec2(px.x, 0.0)).rgb * 0.15;
  c += texture(colorTexture, uv + vec2(0.0, px.y)).rgb * 0.15;
  c += texture(colorTexture, uv - vec2(0.0, px.y)).rgb * 0.15;

  // Bildverstärker sind im nahen Infrarot empfindlich: Vegetation erscheint hell
  float lum = dot(c, vec3(0.30, 0.56, 0.14));
  float veg = clamp((c.g - c.r) * 1.6 + (c.g - c.b) * 0.6, 0.0, 1.0);
  lum += veg * 0.22;
  // Wasser / sehr blaue Flächen dunkel
  lum -= clamp((c.b - c.g) * 0.8, 0.0, 0.3);

  // Halo um sehr helle Punkte (Lichtquellen)
  vec3 bloom = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a)) * px * 6.0;
    vec3 s = texture(colorTexture, uv + o).rgb;
    bloom += max(s - 0.85, 0.0);
  }
  lum += dot(bloom, vec3(0.33)) * 0.35;

  // wenig Restlicht -> flaches, kontrastarmes Bild
  lum = 0.32 + (lum - 0.32) * u_contrast;
  // Automatische Helligkeitsregelung (ABC/Auto-Gain) über u_gain
  lum = clamp(lum * u_gain, 0.0, 1.2);
  lum = pow(max(lum, 0.0), 0.9);
  // Mond: überstrahlter Kern + Halo (Bildverstärker-Blooming), unabhängig vom Gain
  if (u_moonHalo > 0.0) {
    float d = length((uv - u_moonUv) * res);
    float r = max(u_moonR, 2.0);
    float core = 1.0 - smoothstep(r * 0.95, r * 1.35, d);
    float halo = exp(-max(d - r, 0.0) / (r * 3.0 + 12.0)) * 0.95 + exp(-max(d - r, 0.0) / (r * 14.0 + 70.0)) * 0.35;
    lum = max(lum, core * 1.15 * u_moonHalo);
    lum += halo * u_moonHalo;
  }
  // Tageslicht/helle Dämmerung: Röhre übersteuert, Bild flau und ausgewaschen
  lum = mix(lum, 0.95 + 0.1 * lum, u_whiteout * 0.8);

  // Szintillation (Photonenrauschen), zeitlich veränderlich
  float n = hash(floor(uv * res) + mod(floor(u_time * 30.0), 512.0) * vec2(7.13, 3.71)) - 0.5;
  lum = clamp(lum + n * u_noise * (0.35 + 0.65 * smoothstep(0.0, 0.25, lum)), 0.0, 1.2);

  vec3 col = mix(vec3(0.005, 0.025, 0.01), u_phosphor, clamp(lum, 0.0, 1.0));
  col += vec3(0.5, 0.6, 0.45) * smoothstep(0.92, 1.2, lum);

  // Vignette
  vec2 d = (uv - 0.5) * vec2(res.x / res.y, 1.0);
  float vig = 1.0 - smoothstep(0.45, 1.05, length(d)) * 0.55;
  out_FragColor = vec4(col * vig, 1.0);
}
`;

const GLARE_SHADER = `
uniform sampler2D colorTexture;
uniform vec2 u_sun;
uniform float u_core;
uniform float u_veil;
in vec2 v_textureCoordinates;

vec3 ghost(vec2 uv, vec2 p, float r, vec3 col, float asp) {
  float d = length((uv - p) * vec2(asp, 1.0));
  return col * (1.0 - smoothstep(r * 0.7, r, d)) * (0.6 + 0.4 * smoothstep(r * 0.3, r, d));
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec2 res = vec2(textureSize(colorTexture, 0));
  float asp = res.x / res.y;
  vec3 c = texture(colorTexture, uv).rgb;
  vec3 warm = vec3(1.0, 0.95, 0.84);
  // Streulicht-Schleier: Kontrast sinkt, Bild wird hell und flau
  float v = clamp(u_veil, 0.0, 1.0);
  c = mix(c, warm, v * 0.62);
  c += warm * v * 0.12;
  if (u_core > 0.0) {
    vec2 d = (uv - u_sun) * vec2(asp, 1.0);
    float r = length(d);
    float a = atan(d.y, d.x);
    float core = exp(-r / 0.012) * 2.0 + exp(-r / 0.05) * 0.8 + exp(-r / 0.2) * 0.35;
    float rays = pow(abs(cos(a * 3.0)), 90.0) + 0.6 * pow(abs(cos(a * 3.0 + 0.52)), 120.0);
    core += rays * exp(-r / 0.22) * 0.55;
    vec3 add = warm * core;
    // Linsen-/Scheibenreflexe entlang der Achse Sonne -> Bildmitte
    vec2 ax = vec2(0.5) - u_sun;
    add += ghost(uv, u_sun + ax * 0.7, 0.025, vec3(0.5, 0.8, 0.5), asp) * 0.25;
    add += ghost(uv, u_sun + ax * 1.25, 0.06, vec3(0.45, 0.55, 1.0), asp) * 0.16;
    add += ghost(uv, u_sun + ax * 1.6, 0.035, vec3(1.0, 0.6, 0.35), asp) * 0.2;
    add += ghost(uv, u_sun + ax * 2.05, 0.11, vec3(0.6, 0.9, 1.0), asp) * 0.08;
    c += add * u_core;
  }
  out_FragColor = vec4(min(c, vec3(1.0)), 1.0);
}
`;

export class VisualMode {
  constructor(viewer) {
    this.viewer = viewer;
    this.mode = "day";
    this.gain = 1.15;
    this.phosphor = "green";
    // von SkyFx (Sonne/Mond/Restlicht) gesteuerte Parameter
    this.fx = {
      noise: 0.2,
      contrast: 1,
      level: 1,
      abc: 1,
      whiteout: 0,
      moonUv: new Cesium.Cartesian2(-10, -10),
      moonR: 0,
      moonHalo: 0,
      sunUv: new Cesium.Cartesian2(-10, -10),
      sunCore: 0,
      veil: 0,
    };
    const start = performance.now();
    // Blendung durch die Sonne (nur Tagansicht): Schleier/Kontrastverlust, Sonnenkern, Strahlen, Reflexe
    this.glare = new Cesium.PostProcessStage({
      name: "glare",
      fragmentShader: GLARE_SHADER,
      uniforms: {
        u_sun: () => this.fx.sunUv,
        u_core: () => this.fx.sunCore,
        u_veil: () => this.fx.veil,
      },
    });
    this.glare.enabled = false;
    viewer.scene.postProcessStages.add(this.glare);
    this.stage = new Cesium.PostProcessStage({
      name: "nvg",
      fragmentShader: NVG_SHADER,
      uniforms: {
        u_time: () => (performance.now() - start) / 1000,
        u_gain: () => this.gain * this.fx.level * this.fx.abc,
        u_noise: () => this.fx.noise,
        u_contrast: () => this.fx.contrast,
        u_whiteout: () => this.fx.whiteout,
        u_moonUv: () => this.fx.moonUv,
        u_moonR: () => this.fx.moonR,
        u_moonHalo: () => this.fx.moonHalo,
        u_phosphor: () =>
          this.phosphor === "white" ? new Cesium.Cartesian3(0.92, 0.97, 1.0) : new Cesium.Cartesian3(0.45, 1.0, 0.38),
      },
    });
    this.stage.enabled = false;
    viewer.scene.postProcessStages.add(this.stage);
    const s = viewer.scene;
    this.dayState = {
      sky: s.skyAtmosphere ? s.skyAtmosphere.show : true,
      groundAtmo: s.globe.showGroundAtmosphere,
      fogDensity: s.fog.density,
      bg: s.backgroundColor.clone(),
    };
  }

  set(mode) {
    this.mode = mode;
    const s = this.viewer.scene;
    const nvg = mode === "nvg";
    this.stage.enabled = nvg;
    this.glare.enabled = !nvg && this.fx.veil + this.fx.sunCore > 0.002;
    if (s.skyAtmosphere) s.skyAtmosphere.show = !nvg;
    s.globe.showGroundAtmosphere = !nvg && this.dayState.groundAtmo;
    if (s.sun) s.sun.show = !nvg;
    // Mond wird von SkyFx phasenrichtig selbst gezeichnet (astro.js)
    if (s.moon) s.moon.show = false;
    if (s.skyBox) s.skyBox.show = true;
    s.backgroundColor = nvg ? new Cesium.Color(0.01, 0.015, 0.02, 1) : this.dayState.bg;
    s.fog.enabled = true;
    s.fog.density = nvg ? this.dayState.fogDensity * 2.2 : this.dayState.fogDensity;
    document.body.classList.toggle("nvg", nvg);
  }
}
