// Changelog und „Neu in dieser Version“-Popup.
// Neue Versionen OBEN eintragen (version = Zahl wie in index.html "vNN"); CHANGELOG.md parallel pflegen.

export const CHANGELOG = [
  {
    version: 23,
    date: "2026-11-26",
    title: "Neuigkeiten & Changelog",
    items: [
      "Nach jedem Update erscheint einmalig ein Fenster mit den Neuerungen seit dem letzten Besuch.",
      "Vollständiger Changelog jederzeit über die Versionsnummer oben im Panel oder „📋 Changelog“ unter <i>Daten &amp; Darstellung</i>.",
    ],
  },
  {
    version: 22,
    date: "2026-11-26",
    title: "Anflugzeit · Sonne & Mond",
    items: [
      "Datum und Uhrzeit (Ortszeit oder Zulu) für IP-Überflug oder Landung eingeben – Sonnen- und Mondstand an der LZ werden berechnet.",
      "Mond: Azimut, Höhe, Richtung zum Kurs, <b>Beleuchtung in %</b>, Phase, Größe und Helligkeit; Sonne: Azimut, Höhe, Richtung.",
      "Lichtlevel (Tag/Dämmerung/HLL/LLL), Auf-/Untergänge und BMNT/EENT, Himmelsdiagramm mit Blendzone und NVG-Sichtfeld.",
      "Auswirkungen auf den Anflug im Klartext (z. B. „Sonne von vorne: starke Blendung“).",
      "Simulation: <b>Blendung</b> bei Sonne von vorne; <b>NVG-Auto-Gain</b> regelt beim Blick in den Mond herunter und dunkelt die Außensicht ab (mit Halo).",
      "Sonne/Mond auf dem HUD-Kursband, Warnungen, Infobox auf der Approach Plate, Zeit im Missions-Link.",
    ],
  },
  {
    version: 21,
    date: "2026-11-12",
    title: "Schneller laden",
    items: [
      "Approach Plate lädt nur noch 2D-Daten (ohne 3D-Aufbau).",
      "OSM-Abfragen parallel und gestaffelt, 14 Tage Zwischenspeicher im Browser.",
      "Gebäudehöhen für Cesium ion aus OSM-Grundrissen, kürzeres Warten beim Start.",
    ],
  },
  {
    version: 20,
    date: "2026-11-11",
    title: "Tutorial",
    items: ["Bebildertes Tutorial beim ersten Start, jederzeit über <b>?</b> erneut aufrufbar."],
  },
  {
    version: 19,
    date: "2026-10-25",
    title: "H145M LUH SOF",
    items: ["Neues Hubschraubermodell H145M LUH SOF mit eigenem Cockpitrahmen."],
  },
  {
    version: 18,
    date: "2026-10-20",
    title: "Screenshot, Video & Web-App",
    items: [
      "HUD-Meldungen PASSING IP X-n und SAFE DOWN.",
      "Screenshot (S) und Video des gesamten Anflugs (V).",
      "Luftbild-Fallback in der Kartenauswahl, als Web-App installierbar.",
    ],
  },
  {
    version: 17,
    date: "2026-10-19",
    title: "Plate-Luftbildquellen",
    items: [
      "Luftbildquelle der Plate wählbar (Esri, Bing, 3D-Globus) mit Diagnosezeile.",
      "3D-Darstellung pausiert, solange die Plate offen ist.",
    ],
  },
  {
    version: 16,
    date: "2026-10-19",
    title: "Höhenprofil „Konstant über LZ“",
    items: ["Neues Höhenprofil mit konstanter Höhe über LZ-Elevation; Kartenhintergrund der Plate wählbar."],
  },
  {
    version: 15,
    date: "2026-10-19",
    title: "Luftbild-Ersatz",
    items: ["Luftbild über Bing (Cesium ion), wenn der Esri-Server gesperrt ist; leere Kacheln werden erkannt."],
  },
  {
    version: 14,
    date: "2026-10-19",
    title: "Plate: Globus-Aufnahme",
    items: ["Ersatz-Luftbild für die Plate als Senkrechtaufnahme aus dem 3D-Globus."],
  },
  {
    version: 13,
    date: "2026-10-19",
    title: "Plate-Diagnose",
    items: ["Diagnose der Luftbildquellen, gespiegelte Globus-Kacheln korrigiert."],
  },
  {
    version: 12,
    date: "2026-10-19",
    title: "Cesium ion als Standard",
    items: ["Cesium ion ist Standard-Geodatenquelle; Plate-Luftbild über Globus/Bing."],
  },
  {
    version: 11,
    date: "2026-10-19",
    title: "Target Approach Plate",
    items: ["Approach Plate nach Vorlage (PNG/PDF), eingebauter Cesium-ion-Token."],
  },
  {
    version: 10,
    date: "2026-10-17",
    title: "Einheiten",
    items: ["Höhenregler-Skala korrigiert, globale Umschaltung NM/km."],
  },
  {
    version: 9,
    date: "2026-10-17",
    title: "Robustere OSM-Abfragen",
    items: ["OSM-Abfragen robuster, Lade-Ergebnis wird angezeigt."],
  },
  {
    version: 8,
    date: "2026-10-17",
    title: "Erste Versionen",
    items: [
      "Anflugsimulator IP → TGT auf 3D-Gelände mit Luftbild, Cockpit/Außen/LZ-Ansicht, Tag/NVG, HUD.",
      "Kartenauswahl und GPS-Position für TGT/IP, Hindernisse und Vegetation in 3D, Konturenflug.",
      "Mobile Darstellung, Datenlücken im Gelände gefüllt, Versionsanzeige.",
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;
const SEEN_KEY = "ip2tgt.seenVersion";
const TUT_KEY = "ip2tgt.tutorialSeen";

const get = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* privat / blockiert */
  }
};

const fmtDate = (d) => d.split("-").reverse().join(".");
const entryHtml = (e) => `
  <article class="cl-entry">
    <h3><span class="cl-ver">v${e.version}</span>${e.title}<span class="cl-date">${fmtDate(e.date)}</span></h3>
    <ul>${e.items.map((i) => `<li>${i}</li>`).join("")}</ul>
  </article>`;

/**
 * Popup nach Updates + vollständiger Changelog.
 * Neue Nutzer (Tutorial noch nicht gesehen) bekommen kein Popup – das Tutorial erklärt alles.
 */
export function initChangelog() {
  const dlg = document.getElementById("clDlg");
  const body = dlg.querySelector(".cl-body");
  const title = dlg.querySelector(".cl-title");
  const allBtn = document.getElementById("clAll");

  function open(sinceVersion = null) {
    const news = sinceVersion == null ? [] : CHANGELOG.filter((e) => e.version > sinceVersion);
    const list = news.length ? news : CHANGELOG;
    title.textContent = news.length ? `Neu in v${APP_VERSION}` : "Changelog";
    body.innerHTML = list.map(entryHtml).join("");
    allBtn.hidden = !news.length;
    body.scrollTop = 0;
    set(SEEN_KEY, String(APP_VERSION));
    if (!dlg.open) dlg.showModal();
  }

  allBtn.addEventListener("click", () => open());
  document.getElementById("clClose").addEventListener("click", () => dlg.close());
  document.getElementById("clOk").addEventListener("click", () => dlg.close());

  const seen = parseInt(get(SEEN_KEY), 10);
  const known = !!get(TUT_KEY);
  if (!known && !isFinite(seen)) set(SEEN_KEY, String(APP_VERSION)); // Erstbesuch: Tutorial statt Popup
  else if (!isFinite(seen)) setTimeout(() => open(APP_VERSION - 2), 900); // vorhandene Nutzer vor v23
  else if (seen < APP_VERSION) setTimeout(() => open(seen), 900);

  return { open: () => open() };
}
