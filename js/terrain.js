// Gelände ohne API-Schlüssel: AWS Open Data "Terrarium" Höhenkacheln (Mapzen/Tilezen).
// Höhe = (R * 256 + G + B / 256) - 32768  [m über MSL]
// Stellt einen Cesium-TerrainProvider bereit und einen direkten Höhen-Sampler.

const Cesium = window.Cesium;

const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TILE_PX = 256;
const MAX_LEVEL = 15;
const GRID = 65;

async function decodeTile(blobOrImage) {
  const bmp = blobOrImage instanceof Blob ? await createImageBitmap(blobOrImage) : blobOrImage;
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(TILE_PX, TILE_PX)
      : Object.assign(document.createElement("canvas"), { width: TILE_PX, height: TILE_PX });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, TILE_PX, TILE_PX);
  const px = ctx.getImageData(0, 0, TILE_PX, TILE_PX).data;
  const h = new Float32Array(TILE_PX * TILE_PX);
  for (let i = 0, j = 0; i < h.length; i++, j += 4) {
    h[i] = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768;
  }
  if (bmp.close) bmp.close();
  return h;
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
