// Service Worker: macht IP2TGT als Web-App installierbar. Eigene Dateien werden immer
// beim Server nachgefragt ("network first", HTTP-Cache wird umgangen), damit Updates sofort
// ankommen; der Zwischenspeicher dient nur als Notfall ohne Netz.
// Karten, Gelände und Bibliotheken anderer Server werden nicht angefasst.
const CACHE = "ip2tgt-v25";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest"].map((u) => new Request(u, { cache: "reload" })))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // Seitenaufrufe: eigene Anfrage (Navigations-Requests lassen sich nicht mit Optionen kopieren)
  const net =
    req.mode === "navigate"
      ? fetch(req.url, { cache: "no-store", credentials: "same-origin" })
      : fetch(req, { cache: "no-cache" });
  e.respondWith(
    net
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }).then((r) => r || caches.match("./index.html"))),
  );
});
