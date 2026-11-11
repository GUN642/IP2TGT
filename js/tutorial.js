// Bebildertes Tutorial: erscheint beim ersten Öffnen der Seite, später über „?“ im Panel
// (oder Taste ?) jederzeit wieder aufrufbar.

const SEEN_KEY = "ip2tgt.tutorialSeen";
const IMG = "img/tutorial/";

const STEPS = [
  {
    title: "Willkommen bei IP2TGT",
    img: ["cockpit.jpg"],
    html: `<p>IP2TGT simuliert den <b>Hubschrauber-Anflug vom Initial Point (IP) zur Landezone (TGT/LZ)</b> –
      auf echtem 3D-Gelände mit Luftbildern, Gebäuden, Wald und Hindernissen, aus dem Cockpit oder von außen,
      bei Tag oder nachts unter NVG.</p>
      <p>Die nächsten Schritte zeigen in etwa einer Minute alles Wichtige. Du kannst das Tutorial jederzeit über
      <span class="key">?</span> oben im Planungspanel wieder öffnen.</p>`,
  },
  {
    title: "1 · Landezone eingeben",
    img: ["p_tgt.png"],
    html: `<p>Oben im Panel trägst du die <b>Landezone (TGT)</b> ein – als MGRS oder Lat/Lon, z. B.:</p>
      <ul>
        <li><code>32U NB 20005 62607</code> oder kurz <code>NB 2000 6260</code></li>
        <li><code>51.1146, 9.2858</code> · <code>N51 06.876 E009 17.148</code></li>
      </ul>
      <p>Daneben: <b>Karte</b> (Punkt auf der Karte wählen) und <b>GPS</b> (aktuellen Standort übernehmen).</p>`,
  },
  {
    title: "2 · Auf der Karte wählen",
    img: ["map.jpg"],
    html: `<ul>
        <li>Oben <b>TGT setzen</b> oder <b>IP setzen</b> wählen, dann in die Karte tippen – Marker lassen sich verschieben.</li>
        <li>Suchfeld: Ortsname oder Koordinate eingeben.</li>
        <li>Rechts oben: Luftbild, Topografisch oder OpenStreetMap.</li>
        <li>Unten stehen MGRS, Kurs und Distanz IP → TGT live; <b>Übernehmen</b> trägt alles ins Panel ein.</li>
      </ul>`,
  },
  {
    title: "3 · Anflug festlegen",
    img: ["p_ip.png"],
    html: `<ul>
        <li><b>IP-Koordinate:</b> IP wie die LZ eingeben (Karte oder GPS ebenfalls möglich).</li>
        <li><b>Kurs &amp; Distanz:</b> ohne IP einfach Final Course (MAG oder TRUE) und Entfernung (NM oder km) angeben – der IP wird berechnet.</li>
      </ul>
      <p>Darunter siehst du sofort Kurs (°M/°T), Distanz, ETE, Missweisung und LZ-Elevation.</p>`,
  },
  {
    title: "4 · Flugprofil und Muster",
    img: ["p_profile.png", "p_heli.png"],
    html: `<ul>
        <li><b>Geländefolgend:</b> hält die eingestellte Radarhöhe über Gelände und Hindernissen.</li>
        <li><b>Konstant über LZ:</b> fliegt gerade in LZ-Elevation + Anflughöhe bis zur Verzögerung.</li>
        <li>Anflughöhe (Standard 100 ft AGL) und Ground Speed (Standard 80 kt) per Regler oder Zahl; unter <i>Erweitert</i> Verzögerungspunkt, Vorlauf, Hover-Höhe und Sinkrate.</li>
        <li>Muster: <b>CH-53G</b>, <b>CH-47F</b> oder <b>H145M LUH SOF</b>.</li>
      </ul>`,
  },
  {
    title: "5 · Anflug starten",
    img: ["controls.png"],
    html: `<p>Unten im Panel auf <b>▶ Anflug starten</b> – danach steuerst du alles über die Leiste unten:</p>
      <ul>
        <li>Pause/Weiter, Neustart, Zeitraffer 0,25×–16×</li>
        <li>Zeitleiste zum Spulen, mit Marken für IP, Verzögerung (DEC) und Hover (HOV)</li>
        <li>Ansicht <b>Cockpit · Außen · LZ · Frei</b>, <b>Tag/NVG</b>, HUD, NVG-Röhre 40°</li>
        <li><b>Kamera</b> = Screenshot, <b>REC</b> = Video des ganzen Anflugs, Vollbild</li>
      </ul>
      <p>Im Cockpit schaust du dich mit Maus bzw. Finger um; Doppelklick setzt den Blick zurück.</p>`,
  },
  {
    title: "6 · Das HUD lesen",
    img: ["cockpit.jpg"],
    html: `<ul>
        <li><b>Oben:</b> Kursband mit Steuerkurs (°M).</li>
        <li><b>Mitte:</b> LZ-Kasten mit Distanz, IP-Raute, Flugbahnvektor (Kreis) und Leitlinie zur LZ.</li>
        <li><b>Links:</b> Ground Speed und Steig-/Sinkrate · <b>rechts:</b> Radarhöhe (R…) und MSL-Höhe.</li>
        <li><b>Unten:</b> Distanz und Zeit bis TGT sowie die Flugphase.</li>
        <li>Meldungen: <code>PASSING IP: X-n</code>, <code>VERZÖGERN</code>, <code>SAFE DOWN</code>; ⚠ warnt vor Leitungen und Masten voraus.</li>
      </ul>`,
  },
  {
    title: "7 · Nacht mit NVG",
    img: ["nvg.jpg"],
    html: `<p><b>NVG</b> schaltet auf das grüne Phosphorbild mit Rauschen um, <b>40°</b> begrenzt das Sichtfeld auf die Röhre.</p>
      <p>Weitere Ansichten: <b>Außen</b> (Kamera um den Hubschrauber drehen und zoomen), <b>LZ</b> (Beobachter an der Landezone), <b>Frei</b>.</p>`,
  },
  {
    title: "8 · Target Approach Plate",
    img: ["plate.jpg"],
    html: `<p>Im Panel unter <i>Target Approach Plate</i> Callsign, Sequence, LZ-Name usw. ausfüllen und
      <b>📄 Approach Plate erstellen</b> wählen.</p>
      <ul>
        <li>Links die Strecke IP → TGT mit Distanzmarken, Kurs und Zeit, rechts das LZ-Detail mit Abständen zu Hindernissen.</li>
        <li>Hintergrund oben umschaltbar: Luftbild (automatisch, Esri, Bing, 3D-Globus), Topo oder OSM.</li>
        <li>Export als <b>PNG</b> oder <b>Drucken/PDF</b> (A4 quer).</li>
      </ul>`,
  },
  {
    title: "9 · Briefing, Teilen, App",
    img: ["chase.jpg"],
    html: `<ul>
        <li><b>Screenshot</b> (Kamera-Knopf, Taste S) und <b>Video</b> (REC, Taste V) – die Aufnahme startet am Anfang und endet nach der Landung.</li>
        <li><b>Link</b> im Panel kopiert die Mission als teilbaren Link.</li>
        <li><b>⤓ Als App installieren</b> unter <i>Daten &amp; Darstellung</i> (iPhone: Teilen → Zum Home-Bildschirm).</li>
      </ul>
      <p class="keys">Tasten: <span class="key">Leertaste</span> Start/Pause · <span class="key">1</span>–<span class="key">4</span> Ansichten ·
      <span class="key">N</span> NVG · <span class="key">H</span> HUD · <span class="key">T</span> 40° · <span class="key">+</span>/<span class="key">−</span> Zeitraffer ·
      <span class="key">P</span> Panel · <span class="key">F</span> Vollbild · <span class="key">?</span> Tutorial</p>
      <p class="muted small">Trainings- und Visualisierungswerkzeug – nicht für die reale Einsatz- oder Flugplanung.</p>`,
  },
];

export function initTutorial() {
  const dlg = document.getElementById("tutDlg");
  const fig = dlg.querySelector(".tut-fig");
  const title = dlg.querySelector(".tut-title");
  const body = dlg.querySelector(".tut-body");
  const count = dlg.querySelector(".tut-count");
  const dots = dlg.querySelector(".tut-dots");
  const prev = document.getElementById("tutPrev");
  const next = document.getElementById("tutNext");
  let i = 0;

  dots.innerHTML = STEPS.map(
    (s, k) => `<button type="button" aria-label="Schritt ${k + 1}: ${s.title.replace(/^\d+ · /, "")}"></button>`,
  ).join("");
  dots.querySelectorAll("button").forEach((b, k) => b.addEventListener("click", () => show(k)));

  function show(k) {
    i = Math.max(0, Math.min(STEPS.length - 1, k));
    const s = STEPS[i];
    fig.className = "tut-fig" + (s.img.some((f) => f.endsWith(".png")) ? " ui" : "");
    fig.innerHTML = s.img.map((f) => `<img src="${IMG}${f}" alt="" decoding="async" />`).join("");
    title.textContent = s.title;
    body.innerHTML = s.html;
    body.scrollTop = 0;
    count.textContent = `${i + 1} / ${STEPS.length}`;
    dots.querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
    prev.disabled = i === 0;
    next.textContent = i === STEPS.length - 1 ? "Los geht’s" : "Weiter →";
  }

  function open(k = 0) {
    // einmal gezeigt = gesehen (auch wenn die Seite ohne Schließen verlassen wird)
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    show(k);
    if (!dlg.open) dlg.showModal();
  }

  prev.addEventListener("click", () => show(i - 1));
  next.addEventListener("click", () => (i === STEPS.length - 1 ? dlg.close() : show(i + 1)));
  document.getElementById("tutClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") show(i + 1);
    else if (e.key === "ArrowLeft") show(i - 1);
  });
  // Wischen auf dem Handy
  let x0 = null;
  fig.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  fig.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  // Bilder vorladen
  STEPS.flatMap((s) => s.img).forEach((f) => (new Image().src = IMG + f));

  let seen = false;
  try {
    seen = !!localStorage.getItem(SEEN_KEY);
  } catch {}
  if (!seen) setTimeout(() => open(0), 600);

  return { open };
}
