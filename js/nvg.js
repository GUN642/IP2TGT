// Tag-/NVG-Darstellung: Post-Processing (grüner Phosphor, Rauschen, NIR-Vegetation) und Szenen-Umgebung.

const Cesium = window.Cesium;

const NVG_SHADER = `
uniform sampler2D colorTexture;
uniform float u_time;
uniform float u_gain;
uniform float u_noise;
uniform vec3 u_phosphor;
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

  lum = clamp(lum * u_gain, 0.0, 1.2);
  lum = pow(max(lum, 0.0), 0.9);

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

export class VisualMode {
  constructor(viewer) {
    this.viewer = viewer;
    this.mode = "day";
    this.gain = 1.15;
    this.phosphor = "green";
    const start = performance.now();
    this.stage = new Cesium.PostProcessStage({
      name: "nvg",
      fragmentShader: NVG_SHADER,
      uniforms: {
        u_time: () => (performance.now() - start) / 1000,
        u_gain: () => this.gain,
        u_noise: () => 0.2,
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
    if (s.skyAtmosphere) s.skyAtmosphere.show = !nvg;
    s.globe.showGroundAtmosphere = !nvg && this.dayState.groundAtmo;
    if (s.sun) s.sun.show = !nvg;
    if (s.moon) s.moon.show = nvg;
    if (s.skyBox) s.skyBox.show = true;
    s.backgroundColor = nvg ? new Cesium.Color(0.01, 0.015, 0.02, 1) : this.dayState.bg;
    s.fog.enabled = true;
    s.fog.density = nvg ? this.dayState.fogDensity * 2.2 : this.dayState.fogDensity;
    document.body.classList.toggle("nvg", nvg);
  }
}
