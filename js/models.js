// Prozedurale Low-Poly-Hubschraubermodelle (CH-53G / CH-47F) als GLB im Speicher.
// Lokales Koordinatensystem: x = vorne, y = links, z = oben; Ursprung = Bodenkontakt (Fahrwerk), Rumpfmitte.

// ---------------------------------------------------------------------------
// Mesh-Builder (flach schattiert, Vertexfarben)
// ---------------------------------------------------------------------------

class Mesh {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }
  tri(a, b, c, color, ref) {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return;
    nx /= len;
    ny /= len;
    nz /= len;
    if (ref) {
      const cx = (a[0] + b[0] + c[0]) / 3 - ref[0];
      const cy = (a[1] + b[1] + c[1]) / 3 - ref[1];
      const cz = (a[2] + b[2] + c[2]) / 3 - ref[2];
      if (nx * cx + ny * cy + nz * cz < 0) {
        [b, c] = [c, b];
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    }
    const col = typeof color === "function" ? color(a, b, c) : color;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(col[0], col[1], col[2], col[3] ?? 1);
    }
  }
  quad(a, b, c, d, color, ref) {
    this.tri(a, b, c, color, ref);
    this.tri(a, c, d, color, ref);
  }
  get count() {
    return this.pos.length / 3;
  }
}

// Superellipsen-Querschnitt
function ring(sec, segs) {
  const pts = [];
  const zc = (sec.zb + sec.zt) / 2,
    hh = (sec.zt - sec.zb) / 2;
  const e = 2 / (sec.n ?? 4);
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const c = Math.cos(t),
      s = Math.sin(t);
    pts.push([
      sec.x,
      (sec.yc ?? 0) + sec.hw * Math.sign(c) * Math.pow(Math.abs(c), e),
      zc + hh * Math.sign(s) * Math.pow(Math.abs(s), e),
    ]);
  }
  return pts;
}

// Lange Abschnitte unterteilen, damit Fenster per Dreiecksschwerpunkt eingefärbt werden können
function subdivide(sections, maxDx) {
  const out = [sections[0]];
  for (let k = 1; k < sections.length; k++) {
    const a = sections[k - 1],
      b = sections[k];
    const n = Math.max(1, Math.ceil(Math.abs(b.x - a.x) / maxDx));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const l = (p, d = 0) => (a[p] ?? d) + ((b[p] ?? d) - (a[p] ?? d)) * t;
      out.push({ x: l("x"), hw: l("hw"), zb: l("zb"), zt: l("zt"), n: l("n", 4), yc: l("yc") });
    }
  }
  return out;
}

/** Lofted Körper entlang x. sections: [{x, hw, zb, zt, n, yc}] von hinten nach vorne oder umgekehrt. */
function loft(mesh, sections, color, segs = 20) {
  sections = subdivide(sections, 0.7);
  const rings = sections.map((s) => ring(s, segs));
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k],
      B = rings[k + 1];
    const sa = sections[k],
      sb = sections[k + 1];
    const ref = [(sa.x + sb.x) / 2, ((sa.yc ?? 0) + (sb.yc ?? 0)) / 2, (sa.zb + sa.zt + sb.zb + sb.zt) / 4];
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      mesh.quad(A[i], A[j], B[j], B[i], color, ref);
    }
  }
  for (const [idx, R] of [
    [0, rings[0]],
    [rings.length - 1, rings[rings.length - 1]],
  ]) {
    const s = sections[idx];
    const c = [s.x, s.yc ?? 0, (s.zb + s.zt) / 2];
    const nb = sections[idx === 0 ? 1 : idx - 1];
    const ref = [nb.x, nb.yc ?? 0, (nb.zb + nb.zt) / 2];
    // Deckel: Normale weg vom Nachbarquerschnitt
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      mesh.tri(c, R[i], R[j], color, ref);
    }
  }
}

function box(mesh, cx, cy, cz, sx, sy, sz, color) {
  const x0 = cx - sx / 2,
    x1 = cx + sx / 2,
    y0 = cy - sy / 2,
    y1 = cy + sy / 2;
  const z0 = cz - sz / 2,
    z1 = cz + sz / 2;
  const ref = [cx, cy, cz];
  const v = (x, y, z) => [x, y, z];
  mesh.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0), color, ref);
  mesh.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), color, ref);
  mesh.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1), color, ref);
  mesh.quad(v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1), color, ref);
  mesh.quad(v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1), color, ref);
  mesh.quad(v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1), color, ref);
}

/** Zylinder entlang Achse axis ('x'|'y'|'z') */
function cylinder(mesh, c, axis, r, len, color, segs = 16, r2 = r) {
  const pts0 = [],
    pts1 = [];
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const a = Math.cos(t),
      b = Math.sin(t);
    const mk = (rad, off) => {
      if (axis === "x") return [c[0] + off, c[1] + rad * a, c[2] + rad * b];
      if (axis === "y") return [c[0] + rad * a, c[1] + off, c[2] + rad * b];
      return [c[0] + rad * a, c[1] + rad * b, c[2] + off];
    };
    pts0.push(mk(r, -len / 2));
    pts1.push(mk(r2, len / 2));
  }
  const ax = axis === "x" ? [1, 0, 0] : axis === "y" ? [0, 1, 0] : [0, 0, 1];
  const e0 = [c[0] - (ax[0] * len) / 2, c[1] - (ax[1] * len) / 2, c[2] - (ax[2] * len) / 2];
  const e1 = [c[0] + (ax[0] * len) / 2, c[1] + (ax[1] * len) / 2, c[2] + (ax[2] * len) / 2];
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    mesh.quad(pts0[i], pts0[j], pts1[j], pts1[i], color, c);
    mesh.tri(e0, pts0[i], pts0[j], color, c);
    mesh.tri(e1, pts1[i], pts1[j], color, c);
  }
}

/** Rotorblatt als flacher Quader, radial entlang Winkel ang in der Rotorebene */
function blade(mesh, plane, ang, rIn, rOut, chord, thick, color) {
  // lokale Blattkoordinaten: s (radial), c (Profiltiefe), t (Dicke)
  const corners = [];
  for (const s of [rIn, rOut])
    for (const cc of [-chord / 2, chord / 2]) for (const t of [-thick / 2, thick / 2]) corners.push([s, cc, t]);
  const ca = Math.cos(ang),
    sa = Math.sin(ang);
  const map = ([s, cc, t]) => {
    const u = s * ca - cc * sa,
      w = s * sa + cc * ca;
    if (plane === "xy") return [u, w, t];
    return [u, t, w]; // xz-Ebene (Heckrotor)
  };
  const P = corners.map(map);
  const mid = map([(rIn + rOut) / 2, 0, 0]);
  const F = [
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 3, 7, 5],
  ];
  for (const f of F) mesh.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], color, mid);
}

function disc(mesh, plane, r, color, segs = 48) {
  const c = [0, 0, 0];
  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * Math.PI * 2,
      t1 = ((i + 1) / segs) * Math.PI * 2;
    const p = (t) => (plane === "xy" ? [r * Math.cos(t), r * Math.sin(t), 0] : [r * Math.cos(t), 0, r * Math.sin(t)]);
    mesh.tri(c, p(t0), p(t1), color);
  }
}

// ---------------------------------------------------------------------------
// GLB-Writer
// ---------------------------------------------------------------------------

/** meshes: [{mesh, material: {color?, alpha?, doubleSided?, blend?}}] -> GLB Uint8Array */
/** instancing (optional): {translation: Float32Array, scale: Float32Array} -> EXT_mesh_gpu_instancing */
function toGlb(parts, instancing) {
  const bufs = [];
  let offset = 0;
  const bufferViews = [],
    accessors = [],
    meshes = [],
    materials = [],
    nodes = [];
  const pushArray = (arr, comps) => {
    const f = new Float32Array(arr);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: f.byteLength, target: 34962 });
    bufs.push(f);
    offset += f.byteLength;
    const count = arr.length / comps;
    const acc = { bufferView: bufferViews.length - 1, componentType: 5126, count, type: comps === 3 ? "VEC3" : "VEC4" };
    return acc;
  };
  const prims = [];
  parts.forEach((part) => {
    const m = part.mesh;
    if (!m.count) return;
    const accP = pushArray(m.pos, 3);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], m.pos[i + k]);
        max[k] = Math.max(max[k], m.pos[i + k]);
      }
    }
    accP.min = min;
    accP.max = max;
    accessors.push(accP);
    const iP = accessors.length - 1;
    accessors.push(pushArray(m.nrm, 3));
    const iN = accessors.length - 1;
    accessors.push(pushArray(m.col, 4));
    const iC = accessors.length - 1;
    const mat = part.material || {};
    materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, mat.alpha ?? 1],
        metallicFactor: mat.metallic ?? 0.15,
        roughnessFactor: mat.roughness ?? 0.75,
      },
      alphaMode: mat.blend ? "BLEND" : "OPAQUE",
      doubleSided: !!mat.doubleSided,
    });
    prims.push({ attributes: { POSITION: iP, NORMAL: iN, COLOR_0: iC }, material: materials.length - 1 });
  });
  meshes.push({ primitives: prims });
  const node = { mesh: 0, name: "root" };
  let extensionsUsed;
  if (instancing) {
    const addInst = (arr) => {
      const f = arr instanceof Float32Array ? arr : new Float32Array(arr);
      bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: f.byteLength });
      bufs.push(f);
      offset += f.byteLength;
      const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < f.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], f[i + k]);
          max[k] = Math.max(max[k], f[i + k]);
        }
      }
      accessors.push({
        bufferView: bufferViews.length - 1,
        componentType: 5126,
        count: f.length / 3,
        type: "VEC3",
        min,
        max,
      });
      return accessors.length - 1;
    };
    node.extensions = {
      EXT_mesh_gpu_instancing: {
        attributes: { TRANSLATION: addInst(instancing.translation), SCALE: addInst(instancing.scale) },
      },
    };
    extensionsUsed = ["EXT_mesh_gpu_instancing"];
  }
  nodes.push(node);
  const json = {
    asset: { version: "2.0", generator: "IP2TGT procedural" },
    ...(extensionsUsed ? { extensionsUsed, extensionsRequired: extensionsUsed } : {}),
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (offset % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + offset + binPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20;
  let p = 20 + jsonBytes.length + jsonPad;
  dv.setUint32(p, offset + binPad, true);
  dv.setUint32(p + 4, 0x004e4942, true);
  p += 8;
  for (const b of bufs) {
    out.set(new Uint8Array(b.buffer), p);
    p += b.byteLength;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Farben
// ---------------------------------------------------------------------------

const C = {
  olive: [0.36, 0.4, 0.3, 1],
  oliveDark: [0.27, 0.3, 0.22, 1],
  grey: [0.33, 0.35, 0.36, 1],
  greyDark: [0.22, 0.23, 0.24, 1],
  black: [0.06, 0.06, 0.06, 1],
  glass: [0.05, 0.08, 0.1, 1],
  rubber: [0.04, 0.04, 0.04, 1],
  metal: [0.45, 0.45, 0.45, 1],
  blade: [0.12, 0.12, 0.12, 1],
  tip: [0.75, 0.68, 0.2, 1],
  disc: [0.1, 0.1, 0.1, 0.12],
  trunk: [0.25, 0.19, 0.13, 1],
  needle: [0.09, 0.18, 0.1, 1],
  needle2: [0.11, 0.21, 0.11, 1],
  leaf: [0.16, 0.27, 0.12, 1],
  leaf2: [0.2, 0.32, 0.14, 1],
};

function bodyPaint(base, glassTest) {
  return (a, b, c) => {
    const cx = (a[0] + b[0] + c[0]) / 3,
      cy = (a[1] + b[1] + c[1]) / 3,
      cz = (a[2] + b[2] + c[2]) / 3;
    return glassTest(cx, cy, cz) ? C.glass : base;
  };
}

function wheel(mesh, x, y, r, w) {
  cylinder(mesh, [x, y, r], "y", r, w, C.rubber, 14);
  cylinder(mesh, [x, y, r], "y", r * 0.45, w * 1.05, C.metal, 10);
}

// ---------------------------------------------------------------------------
// CH-53G
// ---------------------------------------------------------------------------

function buildCH53() {
  const body = new Mesh();
  const paint = bodyPaint(
    C.olive,
    (x, y, z) =>
      // Cockpitverglasung: vordere Rumpfoberseite + Seitenfenster
      (x > 7.4 && z > 2.25 && x < 9.6) ||
      (x > 6.6 && x < 7.6 && z > 2.6 && z < 3.4 && Math.abs(y) > 1.2) ||
      (x > -2.5 && x < 5.5 && z > 2.3 && z < 2.75 && Math.abs(y) > 1.35 && Math.abs((x % 1.6) + 1.6) % 1.6 < 0.7),
  );
  loft(
    body,
    [
      { x: 9.95, hw: 0.25, zb: 1.55, zt: 2.0, n: 2.5 },
      { x: 9.6, hw: 0.85, zb: 1.05, zt: 2.55, n: 3 },
      { x: 8.9, hw: 1.25, zb: 0.8, zt: 3.05, n: 3.5 },
      { x: 7.8, hw: 1.42, zb: 0.7, zt: 3.45, n: 4 },
      { x: 6.8, hw: 1.48, zb: 0.68, zt: 3.6, n: 4.5 },
      { x: -3.6, hw: 1.48, zb: 0.68, zt: 3.6, n: 4.5 },
      { x: -4.8, hw: 1.4, zb: 1.25, zt: 3.6, n: 4.2 },
      { x: -6.0, hw: 0.95, zb: 2.45, zt: 3.65, n: 3.5 },
      { x: -8.5, hw: 0.6, zb: 2.95, zt: 3.75, n: 3 },
      { x: -10.9, hw: 0.42, zb: 3.15, zt: 3.95, n: 3 },
      { x: -11.6, hw: 0.32, zb: 3.3, zt: 4.15, n: 3 },
    ],
    paint,
    24,
  );
  // Seitliche Sponsons (Kraftstoff/Hauptfahrwerk)
  for (const s of [1, -1]) {
    loft(
      body,
      [
        { x: 3.2, hw: 0.2, zb: 1.0, zt: 1.6, yc: s * 1.55, n: 3 },
        { x: 2.4, hw: 0.75, zb: 0.75, zt: 1.95, yc: s * 1.95, n: 3.5 },
        { x: -1.8, hw: 0.75, zb: 0.75, zt: 1.95, yc: s * 1.95, n: 3.5 },
        { x: -3.2, hw: 0.3, zb: 1.0, zt: 1.7, yc: s * 1.6, n: 3 },
      ],
      C.olive,
      16,
    );
    // Triebwerksgondeln
    loft(
      body,
      [
        { x: 4.6, hw: 0.32, zb: 3.75, zt: 4.35, yc: s * 1.55, n: 2 },
        { x: 3.9, hw: 0.6, zb: 3.55, zt: 4.65, yc: s * 1.55, n: 2.2 },
        { x: 0.2, hw: 0.6, zb: 3.55, zt: 4.65, yc: s * 1.55, n: 2.2 },
        { x: -0.8, hw: 0.4, zb: 3.75, zt: 4.45, yc: s * 1.5, n: 2 },
      ],
      C.oliveDark,
      16,
    );
    cylinder(body, [4.62, s * 1.55, 4.05], "x", 0.33, 0.06, C.black, 14);
    // Hauptfahrwerk unter Sponson
    wheel(body, -0.1, s * 2.15, 0.48, 0.32);
    box(body, -0.1, s * 2.05, 0.75, 0.25, 0.2, 0.55, C.metal);
  }
  // Getriebeverkleidung / Rotormast
  loft(
    body,
    [
      { x: 3.6, hw: 0.4, zb: 3.5, zt: 3.75, n: 3 },
      { x: 2.4, hw: 0.95, zb: 3.5, zt: 4.55, n: 3.5 },
      { x: -1.6, hw: 0.95, zb: 3.5, zt: 4.55, n: 3.5 },
      { x: -3.4, hw: 0.45, zb: 3.5, zt: 3.9, n: 3 },
    ],
    C.olive,
    20,
  );
  cylinder(body, [0.6, 0, 4.85], "z", 0.28, 0.7, C.greyDark, 12);
  // Bugfahrwerk (Doppelrad)
  for (const s of [1, -1]) wheel(body, 7.0, s * 0.3, 0.4, 0.22);
  box(body, 7.0, 0, 0.7, 0.25, 0.25, 0.4, C.metal);
  // Heckpylon (nach links geneigt ~20°)
  const finCol = C.olive;
  const fin = new Mesh();
  loft(
    fin,
    [
      { x: -11.2, hw: 0.28, zb: 3.4, zt: 3.9, n: 2.5 },
      { x: -11.5, hw: 0.22, zb: 3.6, zt: 6.0, n: 2.5 },
      { x: -11.8, hw: 0.2, zb: 3.8, zt: 7.1, n: 2.5 },
      { x: -12.6, hw: 0.12, zb: 4.4, zt: 7.35, n: 2.5 },
    ],
    finCol,
    14,
  );
  // Höhenleitwerk (rechts)
  box(fin, -12.1, -1.35, 6.7, 1.0, 2.6, 0.12, finCol);
  // Neigung des Pylons nach links um Achse x bei z=3.6
  const cant = (20 * Math.PI) / 180;
  for (let i = 0; i < fin.pos.length; i += 3) {
    const y = fin.pos[i + 1],
      z = fin.pos[i + 2] - 3.8;
    fin.pos[i + 1] = y * Math.cos(cant) - z * Math.sin(cant) * -1;
    fin.pos[i + 2] = 3.8 + y * Math.sin(cant) * -1 + z * Math.cos(cant);
    const ny = fin.nrm[i + 1],
      nz = fin.nrm[i + 2];
    fin.nrm[i + 1] = ny * Math.cos(cant) + nz * Math.sin(cant);
    fin.nrm[i + 2] = -ny * Math.sin(cant) + nz * Math.cos(cant);
  }
  body.pos.push(...fin.pos);
  body.nrm.push(...fin.nrm);
  body.col.push(...fin.col);

  // Hauptrotor: 6 Blätter, R = 11.0 m
  const rotor = new Mesh();
  const R = 11.0;
  for (let b = 0; b < 6; b++) {
    const ang = (b / 6) * Math.PI * 2;
    blade(rotor, "xy", ang, 0.7, R - 0.35, 0.66, 0.1, C.blade);
    blade(rotor, "xy", ang, R - 0.35, R, 0.66, 0.1, C.tip);
  }
  cylinder(rotor, [0, 0, 0], "z", 0.75, 0.35, C.greyDark, 12);
  const rotorDisc = new Mesh();
  disc(rotorDisc, "xy", R, C.disc);

  // Heckrotor: 4 Blätter, R = 2.44 m (linke Seite des Pylons)
  const tail = new Mesh();
  const r = 2.44;
  for (let b = 0; b < 4; b++) {
    const ang = (b / 4) * Math.PI * 2;
    blade(tail, "xz", ang, 0.2, r, 0.3, 0.06, C.blade);
  }
  cylinder(tail, [0, 0, 0], "y", 0.22, 0.3, C.greyDark, 10);
  const tailDisc = new Mesh();
  disc(tailDisc, "xz", r, C.disc, 32);

  return {
    name: "CH-53G",
    body: toGlb([{ mesh: body }]),
    rotors: [
      // Hub-Position, Rotationsachse (lokal), Drehsinn (+1 = gegen Uhrzeigersinn von oben/links)
      {
        glb: toGlb([{ mesh: rotor }, { mesh: rotorDisc, material: { blend: true, alpha: 1, doubleSided: true } }]),
        hub: [0.6, 0, 5.25],
        axis: "z",
        dir: -1,
        rpm: 185,
        tiltDeg: 5,
      },
      {
        glb: toGlb([{ mesh: tail }, { mesh: tailDisc, material: { blend: true, alpha: 1, doubleSided: true } }]),
        hub: [-12.0, 1.3, 6.45],
        axis: "y",
        dir: 1,
        rpm: 790,
        cantDeg: 20,
      },
    ],
    eye: [8.25, -0.62, 2.95], // rechter Pilotensitz
    copilotEye: [8.25, 0.62, 2.95],
    length: 26.9,
    cockpitStyle: "ch53",
  };
}

// ---------------------------------------------------------------------------
// CH-47F
// ---------------------------------------------------------------------------

function buildCH47() {
  const body = new Mesh();
  const paint = bodyPaint(
    C.olive,
    (x, y, z) =>
      (x > 6.9 && z > 2.3 && x < 8.05) ||
      (x > 5.6 && x < 7.0 && z > 2.55 && z < 3.35 && Math.abs(y) > 1.25) ||
      (x > -4.5 && x < 5.0 && z > 2.35 && z < 2.8 && Math.abs(y) > 1.4 && Math.abs((x % 1.5) + 1.5) % 1.5 < 0.6),
  );
  loft(
    body,
    [
      { x: 8.25, hw: 0.3, zb: 1.5, zt: 2.05, n: 2.5 },
      { x: 7.95, hw: 1.0, zb: 1.05, zt: 2.75, n: 3.2 },
      { x: 7.3, hw: 1.38, zb: 0.92, zt: 3.35, n: 4 },
      { x: 6.4, hw: 1.5, zb: 0.88, zt: 3.7, n: 5 },
      { x: -5.4, hw: 1.5, zb: 0.88, zt: 3.7, n: 5 },
      { x: -6.6, hw: 1.5, zb: 1.25, zt: 3.7, n: 5 },
      { x: -7.75, hw: 1.46, zb: 2.25, zt: 3.7, n: 5 },
      { x: -7.85, hw: 1.3, zb: 2.45, zt: 3.6, n: 5 },
    ],
    paint,
    24,
  );
  // Seitentanks (Fuel pods)
  for (const s of [1, -1]) {
    loft(
      body,
      [
        { x: 4.6, hw: 0.15, zb: 1.05, zt: 1.6, yc: s * 1.55, n: 3 },
        { x: 3.9, hw: 0.42, zb: 0.92, zt: 2.0, yc: s * 1.8, n: 3.5 },
        { x: -4.3, hw: 0.42, zb: 0.92, zt: 2.0, yc: s * 1.8, n: 3.5 },
        { x: -5.0, hw: 0.15, zb: 1.05, zt: 1.7, yc: s * 1.55, n: 3 },
      ],
      C.olive,
      14,
    );
    // Triebwerke am hinteren Pylon
    loft(
      body,
      [
        { x: -3.0, hw: 0.3, zb: 3.7, zt: 4.25, yc: s * 1.75, n: 2 },
        { x: -3.6, hw: 0.52, zb: 3.45, zt: 4.5, yc: s * 1.75, n: 2.2 },
        { x: -6.4, hw: 0.52, zb: 3.45, zt: 4.5, yc: s * 1.75, n: 2.2 },
        { x: -7.1, hw: 0.35, zb: 3.6, zt: 4.35, yc: s * 1.75, n: 2 },
      ],
      C.oliveDark,
      14,
    );
    cylinder(body, [-3.02, s * 1.75, 3.98], "x", 0.32, 0.06, C.black, 12);
    box(body, -4.8, s * 1.45, 3.95, 1.2, 0.5, 0.3, C.oliveDark);
    // Fahrwerk: vorne Doppelrad, hinten Einzelrad
    for (const d of [0.22, -0.22]) wheel(body, 4.2, s * (1.55 + d), 0.45, 0.28);
    box(body, 4.2, s * 1.55, 0.85, 0.3, 0.25, 0.55, C.metal);
    wheel(body, -4.3, s * 1.65, 0.45, 0.3);
    box(body, -4.3, s * 1.55, 0.85, 0.3, 0.25, 0.55, C.metal);
  }
  // Vorderer Pylon (niedrig)
  loft(
    body,
    [
      { x: 7.3, hw: 0.35, zb: 3.3, zt: 3.45, n: 3 },
      { x: 6.9, hw: 0.75, zb: 3.5, zt: 4.15, n: 3 },
      { x: 5.0, hw: 0.85, zb: 3.6, zt: 4.35, n: 3 },
      { x: 3.6, hw: 0.4, zb: 3.65, zt: 3.8, n: 3 },
    ],
    C.olive,
    18,
  );
  cylinder(body, [6.0, 0, 4.45], "z", 0.25, 0.5, C.greyDark, 12);
  // Rückenverkleidung (Wellentunnel)
  box(body, 0, 0, 3.82, 8.0, 0.75, 0.3, C.oliveDark);
  // Hinterer Pylon (hoch)
  loft(
    body,
    [
      { x: -2.6, hw: 0.4, zb: 3.65, zt: 3.95, n: 3 },
      { x: -4.4, hw: 0.95, zb: 3.65, zt: 5.25, n: 3.2 },
      { x: -6.9, hw: 1.0, zb: 3.65, zt: 5.45, n: 3.2 },
      { x: -7.85, hw: 0.75, zb: 3.6, zt: 5.1, n: 3 },
    ],
    C.olive,
    18,
  );
  cylinder(body, [-5.9, 0, 5.6], "z", 0.25, 0.4, C.greyDark, 12);

  const mkRotor = () => {
    const m = new Mesh();
    const R = 9.14;
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2;
      blade(m, "xy", ang, 0.6, R - 0.3, 0.81, 0.11, C.blade);
      blade(m, "xy", ang, R - 0.3, R, 0.81, 0.11, C.tip);
    }
    cylinder(m, [0, 0, 0], "z", 0.6, 0.4, C.greyDark, 12);
    const d = new Mesh();
    disc(d, "xy", R, C.disc);
    return toGlb([{ mesh: m }, { mesh: d, material: { blend: true, alpha: 1, doubleSided: true } }]);
  };

  return {
    name: "CH-47F",
    body: toGlb([{ mesh: body }]),
    rotors: [
      { glb: mkRotor(), hub: [6.0, 0, 4.75], axis: "z", dir: 1, rpm: 225, tiltDeg: 3 },
      { glb: mkRotor(), hub: [-5.9, 0, 5.85], axis: "z", dir: -1, rpm: 225, tiltDeg: 3, phase: Math.PI / 3 },
    ],
    eye: [7.15, -0.65, 2.95],
    copilotEye: [7.15, 0.65, 2.95],
    length: 30.1,
    cockpitStyle: "ch47",
  };
}

const cache = {};
export function getHelicopterDef(type) {
  if (!cache[type]) cache[type] = type === "CH47" ? buildCH47() : buildCH53();
  return cache[type];
}

// ---------------------------------------------------------------------------
// Bäume (Einheitsgröße: Höhe 1, Spitze bei z = 1) mit GPU-Instancing
// ---------------------------------------------------------------------------

/**
 * kind: "conifer" | "broadleaf"; translation/scale: Float32Array (x,y,z je Baum, lokales ENU-System).
 * Scale = (Kronenbreite, Kronenbreite, Höhe) relativ zum Einheitsbaum.
 */
export function treeGlb(kind, translation, scale) {
  const m = new Mesh();
  if (kind === "conifer") {
    cylinder(m, [0, 0, 0.12], "z", 0.07, 0.24, C.trunk, 6);
    cylinder(m, [0, 0, 0.42], "z", 0.5, 0.5, C.needle, 8, 0.18);
    cylinder(m, [0, 0, 0.75], "z", 0.34, 0.5, C.needle2, 8, 0.0);
  } else {
    cylinder(m, [0, 0, 0.2], "z", 0.08, 0.4, C.trunk, 6);
    cylinder(m, [0, 0, 0.5], "z", 0.32, 0.25, C.leaf, 9, 0.5);
    cylinder(m, [0, 0, 0.74], "z", 0.5, 0.24, C.leaf2, 9, 0.38);
    cylinder(m, [0, 0, 0.93], "z", 0.38, 0.14, C.leaf2, 9, 0.12);
  }
  return toGlb([{ mesh: m, material: { roughness: 0.95, metallic: 0 } }], { translation, scale });
}
