// Screenshot und Videoaufnahme des Anflugs: 3D-Bild + Cockpitrahmen + HUD + NVG-Röhre
// werden in ein Canvas zusammengesetzt (im postRender, solange der WebGL-Puffer gültig ist).

const cp = { key: "", img: null, ready: false };

/** Cockpitrahmen (SVG-Overlay) als Bild in Zielgröße W×H; CSS-Variablen werden aufgelöst */
function prepareCockpit(W, H) {
  const svg = document.getElementById("cockpit");
  if (!document.body.classList.contains("view-cockpit") || !svg.firstElementChild) {
    cp.key = "";
    cp.ready = false;
    return Promise.resolve(null);
  }
  const g = svg.querySelector("#frame");
  const key = [W, H, document.body.className, g?.getAttribute("transform"), svg.innerHTML.length].join("|");
  if (key === cp.key) return cp.promise;
  cp.key = key;
  const cs = getComputedStyle(document.body);
  const v = (n) => cs.getPropertyValue(n).trim() || "#000";
  const c = svg.cloneNode(true);
  c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  c.setAttribute("width", W);
  c.setAttribute("height", H);
  c.removeAttribute("style");
  const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.textContent = `.mfd{fill:${v("--mfd")}}.mfd-lines{stroke:${v("--mfd-line")}}`;
  c.insertBefore(st, c.firstChild);
  const src = new XMLSerializer().serializeToString(c).replace(/var\((--[\w-]+)\)/g, (_, n) => v(n));
  const img = new Image();
  cp.promise = new Promise((resolve) => {
    img.onload = () => {
      if (cp.key === key) {
        cp.img = img;
        cp.ready = true;
      }
      resolve(img);
    };
    img.onerror = () => resolve(null);
  });
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
  return cp.promise;
}

function compose(ctx, sceneCanvas, W, H) {
  ctx.drawImage(sceneCanvas, 0, 0, W, H);
  if (cp.ready && cp.img && document.body.classList.contains("view-cockpit")) ctx.drawImage(cp.img, 0, 0, W, H);
  const hud = document.getElementById("hud");
  if (hud.width) ctx.drawImage(hud, 0, 0, W, H);
  if (document.body.classList.contains("tube")) {
    const k = W / Math.max(1, sceneCanvas.clientWidth);
    const r = (parseFloat(document.body.style.getPropertyValue("--tube-r")) || H * 0.3) * k;
    const gr = ctx.createRadialGradient(W / 2, H / 2, r, W / 2, H / 2, r + 30 * k);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(0.2, "rgba(0,0,0,0.92)");
    gr.addColorStop(1, "#000");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const MIMES = [
  ["video/mp4;codecs=avc1.42E01E", "mp4"],
  ["video/mp4;codecs=avc1", "mp4"],
  ["video/webm;codecs=vp9", "webm"],
  ["video/webm;codecs=vp8", "webm"],
  ["video/webm", "webm"],
];

/**
 * scene: Cesium-Szene. Liefert { shot(name), startVideo(name, onStop), stopVideo(), recording }.
 */
export function createCapture(scene) {
  let pendingShot = null;
  let rec = null;

  scene.postRender.addEventListener(() => {
    const sc = scene.canvas;
    if (pendingShot) {
      const { resolve, name } = pendingShot;
      pendingShot = null;
      const c = document.createElement("canvas");
      c.width = sc.width;
      c.height = sc.height;
      compose(c.getContext("2d"), sc, c.width, c.height);
      c.toBlob((b) => {
        if (b) download(b, `${name}.png`);
        resolve(!!b);
      }, "image/png");
    }
    if (rec) {
      prepareCockpit(rec.c.width, rec.c.height);
      compose(rec.ctx, sc, rec.c.width, rec.c.height);
    }
  });

  return {
    get recording() {
      return !!rec;
    },
    async shot(name) {
      const sc = scene.canvas;
      await prepareCockpit(sc.width, sc.height);
      return new Promise((resolve) => {
        pendingShot = { resolve, name };
        scene.requestRender();
      });
    },
    supportsVideo() {
      return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
    },
    async startVideo(name) {
      const sc = scene.canvas;
      const k = Math.min(1, 1920 / Math.max(sc.width, sc.height));
      const c = document.createElement("canvas");
      c.width = Math.round((sc.width * k) / 2) * 2;
      c.height = Math.round((sc.height * k) / 2) * 2;
      const ctx = c.getContext("2d");
      await prepareCockpit(c.width, c.height);
      compose(ctx, sc, c.width, c.height);
      const [mimeType, ext] = MIMES.find(([m]) => MediaRecorder.isTypeSupported(m)) || ["", "webm"];
      const recorder = new MediaRecorder(c.captureStream(30), {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 8_000_000,
      });
      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
          if (blob.size) download(blob, `${name}.${ext}`);
          resolve(blob.size);
        };
      });
      recorder.start(1000);
      rec = { c, ctx, recorder, done };
      return ext;
    },
    async stopVideo() {
      if (!rec) return 0;
      const r = rec;
      rec = null;
      if (r.recorder.state !== "inactive") r.recorder.stop();
      return r.done;
    },
  };
}
