// Gelände ohne API-Schlüssel: AWS Open Data "Terrarium" Höhenkacheln (Mapzen/Tilezen).
// Höhe = (R * 256 + G + B / 256) - 32768  [m über MSL]
// Stellt einen Cesium-TerrainProvider bereit und einen direkten Höhen-Sampler.

const Cesium = window.Cesium;

const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TILE_PX = 256;
const MAX_LEVEL = 15;
const GRID = 65;

// PNG direkt dekodieren (ohne Canvas): Browser mit Anti-Fingerprinting (z. B. Samsung
// Internet) verrauschen Canvas-Pixel beim Auslesen – bei Terrarium bedeutet ein Fehler
// von 1 im Rotkanal 256 m Höhensprung (Löcher im Gelände, falsche Flughöhe).
async function inflate(bytes) {
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decodePng(buf) {
  const d = new Uint8Array(buf);
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (dv.getUint32(0) !== 0x89504e47) throw new Error("kein PNG");
  let p = 8,
    w = 0,
    h = 0,
    depth = 0,
    ctype = 0,
    interlace = 0;
  const idat = [];
  let palette = null;
  while (p < d.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(d[p + 4], d[p + 5], d[p + 6], d[p + 7]);
    const body = d.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = dv.getUint32(p + 8);
      h = dv.getUint32(p + 12);
      depth = d[p + 16];
      ctype = d[p + 17];
      interlace = d[p + 20];
    } else if (type === "PLTE") palette = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 3, 6].includes(ctype)) throw new Error("PNG-Format nicht unterstützt");
  const bpp = ctype === 2 ? 3 : ctype === 6 ? 4 : 1;
  const total = idat.reduce((a, b) => a + b.length, 0);
  const comp = new Uint8Array(total);
  let o = 0;
  for (const c of idat) {
    comp.set(c, o);
    o += c.length;
  }
  const raw = await inflate(comp);
  const stride = w * bpp;
  const out = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y > 0 ? out[dst + x - stride] : 0;
      const c = x >= bpp && y > 0 ? out[dst + x - stride - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c,
          pa = Math.abs(pp - a),
          pb = Math.abs(pp - b),
          pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out, palette };
}

// Einzelne Ausreißer (> 60 m vom Median der 8 Nachbarn) glätten – Schutz vor fehlerhaften Pixeln
function despeckle(hgt) {
  const n = TILE_PX;
  const out = Float32Array.from(hgt);
  const nb = new Float32Array(8);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = Math.min(Math.max(x + dx, 0), n - 1),
            yy = Math.min(Math.max(y + dy, 0), n - 1);
          nb[k++] = hgt[yy * n + xx];
        }
      nb.sort();
      const med = (nb[3] + nb[4]) / 2;
      const v = hgt[y * n + x];
      if (Math.abs(v - med) > 60 || !isFinite(v)) out[y * n + x] = med;
    }
  }
  return out;
}

async function decodeTile(blob) {
  const png = await decodePng(await blob.arrayBuffer());
  if (png.w !== TILE_PX || png.h !== TILE_PX) throw new Error("unerwartete Kachelgröße");
  const hgt = new Float32Array(TILE_PX * TILE_PX);
  const { data, bpp, palette } = png;
  for (let i = 0; i < hgt.length; i++) {
    let r, g, b;
    if (palette) {
      const k = data[i] * 3;
      r = palette[k];
      g = palette[k + 1];
      b = palette[k + 2];
    } else {
      r = data[i * bpp];
      g = data[i * bpp + 1];
      b = data[i * bpp + 2];
    }
    hgt[i] = r * 256 + g + b / 256 - 32768;
  }
  return despeckle(hgt);
}

function bilinear(h, u, v) {
  // u,v in Pixelkoordinaten (Pixelmitte = k + 0.5)
  const x = Math.min(Math.max(u - 0.5, 0), TILE_PX - 1);
  const y = Math.min(Math.max(v - 0.5, 0), TILE_PX - 1);
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, TILE_PX - 1),
    y1 = Math.min(y0 + 1, TILE_PX - 1);
  const fx = x - x0,
    fy = y - y0;
  const a = h[y0 * TILE_PX + x0],
    b = h[y0 * TILE_PX + x1];
  const c = h[y1 * TILE_PX + x0],
    d = h[y1 * TILE_PX + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export class TerrariumTerrainProvider {
  constructor() {
    this._tilingScheme = new Cesium.WebMercatorTilingScheme();
    this._errorEvent = new Cesium.Event();
    this._credit = new Cesium.Credit(
      'Gelände: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles (AWS Open Data, Mapzen)</a>',
    );
    this._levelZeroError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      this._tilingScheme.ellipsoid,
      GRID,
      this._tilingScheme.getNumberOfXTilesAtLevel(0),
    );
  }
  get errorEvent() {
    return this._errorEvent;
  }
  get credit() {
    return this._credit;
  }
  get tilingScheme() {
    return this._tilingScheme;
  }
  get hasWaterMask() {
    return false;
  }
  get hasVertexNormals() {
    return false;
  }
  get availability() {
    return undefined;
  }

  requestTileGeometry(x, y, level, request) {
    const url = TERRARIUM_URL.replace("{z}", level).replace("{x}", x).replace("{y}", y);
    const resource = new Cesium.Resource({ url, request });
    const promise = resource.fetchBlob();
    if (!promise) return undefined; // gedrosselt -> Cesium versucht es später erneut
    const childTileMask = level < MAX_LEVEL ? 15 : 0;
    // Fehler bewusst weiterreichen: Cesium lädt abgebrochene Kacheln später neu und
    // interpoliert fehlgeschlagene aus der Elternkachel (keine Löcher im Gelände).
    return promise.then(decodeTile).then((h) => {
      const buf = new Float32Array(GRID * GRID);
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          buf[j * GRID + i] = bilinear(h, (i / (GRID - 1)) * TILE_PX, (j / (GRID - 1)) * TILE_PX);
        }
      }
      return new Cesium.HeightmapTerrainData({ buffer: buf, width: GRID, height: GRID, childTileMask });
    });
  }
  getLevelMaximumGeometricError(level) {
    return this._levelZeroError / (1 << level);
  }
  getTileDataAvailable(x, y, level) {
    return level <= MAX_LEVEL;
  }
  loadTileDataAvailability() {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Direkter Sampler (für Höhenprofil, unabhängig vom Rendering)
// ---------------------------------------------------------------------------

const tileCache = new Map();

function fetchTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    const url = TERRARIUM_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    tileCache.set(
      key,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        })
        .then(decodeTile)
        .catch((e) => {
          tileCache.delete(key);
          throw e;
        }),
    );
  }
  return tileCache.get(key);
}

/** Höhen [m MSL] für Array von {lat, lon} (Grad). */
export async function sampleTerrarium(points, zoom = 14) {
  const n = 1 << zoom;
  const jobs = points.map((p) => {
    const lat = Math.max(Math.min(p.lat, 85.05), -85.05);
    const fx = ((p.lon + 180) / 360) * n;
    const latR = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
    const tx = Math.floor(fx),
      ty = Math.floor(fy);
    return { tx, ty, u: (fx - tx) * TILE_PX, v: (fy - ty) * TILE_PX };
  });
  const out = new Array(points.length);
  await Promise.all(
    jobs.map(async (j, i) => {
      const h = await fetchTile(zoom, j.tx, j.ty);
      out[i] = bilinear(h, j.u, j.v);
    }),
  );
  return out;
}
