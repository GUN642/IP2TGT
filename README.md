# IP2TGT – Hubschrauber-Anflugsimulator

**Live:** https://gun642.github.io/IP2TGT/

Web-App (reines HTML/JS, kein Build-Schritt) zur Simulation des Anflugs vom **Initial Point (IP)** zur **Landezone (TGT/LZ)** – auf echtem 3D-Gelände mit hochauflösenden Luftbildern und 3D-Gebäuden, aus dem Cockpit oder von außen, bei Tag oder nachts mit grünem **NVG-Bild**.

![Ablauf](https://img.shields.io/badge/IP%20%E2%86%92%20TGT-80%20kt%20%C2%B7%20100%20ft%20AGL-42e3a0)

## Funktionen

- **Immer aktuell:** Beim Öffnen und beim Zurückwechseln in den Tab prüft die App `version.json` am Server (am Browser-Cache vorbei) und lädt eine neue Version automatisch; der Service Worker holt eigene Dateien immer frisch vom Server.
- **Neuigkeiten & Changelog:** Nach jedem Update zeigt die App einmalig, was neu ist. Den vollständigen Verlauf gibt es in der App (Versionsnummer oben im Panel oder „📋 Changelog“) und in [CHANGELOG.md](CHANGELOG.md).

- **Tutorial:** Beim ersten Öffnen führt ein bebildertes Tutorial (10 Schritte) durch die App; später jederzeit über **?** oben im Planungspanel, „📘 Tutorial / Anleitung öffnen“ unter *Daten & Darstellung* oder die Taste `?`.

- **TGT/LZ und IP** per **MGRS** oder **Lat/Lon** eingeben, auf einer **Karte auswählen** oder die **aktuelle Position (GPS)** übernehmen.
  - Kartenauswahl (🗺): Luftbild (Esri, ersatzweise Bing), topografische Karte oder OpenStreetMap; Klick setzt TGT bzw. IP, Marker sind verschiebbar, Kurs/Distanz IP→TGT und MGRS unter dem Cursor werden live angezeigt; Ortssuche oder Koordinateneingabe im Suchfeld; „Meine Position“ setzt den Gerätestandort.
  - GPS-Knopf (◎) neben den Feldern übernimmt den aktuellen Standort direkt (Browser-Freigabe nötig, nur über HTTPS – auf GitHub Pages gegeben).
  - MGRS: `32U NB 20005 62607`, `32UNB2000562607`, auch kurz `NB 2000 6260` (Zone wird vom TGT übernommen)
  - Lat/Lon: `51.1146, 9.2858` · `51,1146 9,2858` · `N51 06.876 E009 17.148` · `51°06'52.6"N 9°17'08.9"E` · `N5106.88 E00917.15` (auch `O` für Ost)
- **Ohne IP:** Final Course (MAG oder TRUE) und Entfernung (NM oder km) eingeben – der IP wird berechnet.
- **Missweisung** automatisch nach dem World Magnetic Model **WMM2025**; Kurse werden °M und °T angezeigt.
- **Flugprofil** (Standard 80 kt GS, 100 ft AGL, frei einstellbar):
  1. Vorlauf auf Kurs bis zum IP (Standard 0,5 NM)
  2. Nach Überflug des IP: Kurs halten, Geländefolgeflug in der gewählten Höhe über Grund (Hindernisse/Gebäude werden mit überflogen)
  3. Kurz vor der LZ (Standard 0,5 NM): Verzögerung mit Flare, Sinkflug in den Hover über der LZ
  4. Hover (10 ft) und Aufsetzen bis zum Boden
- **Hindernisse & Vegetation (OpenStreetMap, alle Datenquellen):** Freileitungen mit Masten und Leiterseilen (inkl. Durchhang), Sende-/Funkmasten, Türme, Schornsteine, Windkraftanlagen, Wald/Gehölz sowie Einzelbäume und Baumreihen als 3D-Objekte. Höhen stammen aus dem OSM-Tag `height`, sonst aus typischen Werten (Masten nach Spannungsebene, Waldhöhe einstellbar, Standard 22 m) – geschätzte Höhen sind im HUD mit `~` markiert. Hindernisse werden im Höhenprofil überflogen; das HUD warnt vor Leitungen und Hindernissen voraus (⚠, Λ-Symbol mit Höhe über Grund). Mit Google 3D Tiles sind Bäume/Bewuchs bereits fotorealistisch im Modell enthalten.
- **Target Approach Plate** (Knopf „📄 Approach Plate erstellen“): Kopfzeile CALLSIGN / SEQUENCE / ALTERNATE LZ / LZ / GRID / ELEV / REMARKS, links Strecke IP→TGT (Kurs oben) mit Distanzmarken, Kurs/Zeit und Abflugkurs, rechts LZ-Detail mit LZ-Kreis, An-/Abflug und automatischen Abstandsmaßen zu Gebäuden, Bäumen, Masten und Leitungen. Export als PNG oder Drucken/PDF (A4 quer).
- **Höhenprofil wählbar:** *Geländefolgend* (hält die Radarhöhe über Gelände/Hindernissen) oder *Konstant über LZ* (Höhe = LZ-Elevation + Anflughöhe, geradlinig gehalten bis zur Verzögerung; nur wo Gelände/Hindernisse höher sind, wird lokal auf die Anflughöhe über Grund angehoben – mit Hinweis).
- **TAP-Kartenhintergrund:** Luftbild (automatisch: Bing über Cesium ion → Bildquelle des 3D-Globus → Esri → Senkrechtaufnahme aus dem 3D-Globus), gezielt *Luftbild Esri*, *Luftbild Bing* oder *Luftbild 3D-Globus*, Topografisch (OpenTopoMap) oder OpenStreetMap – auch direkt im Plate-Fenster umschaltbar. Die Statuszeile im Plate-Fenster zeigt, wie viele Kacheln je Quelle geladen wurden (hilfreich in Netzen mit Filtern/Proxys).
- **Anflugzeit · Sonne & Mond:** Datum und Uhrzeit (Ortszeit oder Zulu) für den IP-Überflug oder die Landung eingeben („⟳ Jetzt“ übernimmt die aktuelle Zeit). Daraus werden Sonnen- und Mondstand an der LZ berechnet (nach Meeus, topozentrisch mit Mondparallaxe und Refraktion, Genauigkeit ~0,05°):
  - Sonne: Azimut (°T/°M), Höhe, Richtung relativ zum Anflugkurs
  - Mond: Azimut, Höhe, Richtung, **Beleuchtung in %** und Phase (zu-/abnehmend), scheinbare **Größe** (Bogenminuten, % vom Mittel), **Helligkeit** (mag, % vom Vollmond)
  - Lichtlevel am Boden (Tag / bürgerl. / naut. Dämmerung / Nacht HLL bzw. LLL, Richtwert in lx), Auf-/Untergänge und Dämmerung (SR/SS, MR/MS, BMNT/EENT) ±12 h
  - Himmelsdiagramm mit Anflugkurs oben, Blendzone und 40°-NVG-Sichtfeld; darunter die **Auswirkungen auf den Anflug** in Klartext (z. B. „Sonne 12° rechts voraus, 2° hoch: starke Blendung im Endanflug“ oder „Mond genau von vorne … Auto-Gain regelt herunter“)
  - In der Simulation läuft die Uhr mit: Sonne/Mond stehen richtig am Himmel, Mond phasenrichtig, Gelände, Gebäude und Cockpitrahmen verdecken sie.
  - **Blendung (Tag):** Sonne im/nahe dem Blickfeld erzeugt Streulicht-Schleier, Kontrastverlust, Strahlen und Reflexe – je näher an der Blickrichtung, desto stärker; HUD-Warnung `BLENDUNG`.
  - **NVG-Auto-Gain (Nacht):** Kommt der Mond ins 40°-Sichtfeld der Brille, regelt die Helligkeitsautomatik auf den hellen Mond herunter – die Außensicht wird stark abgedunkelt, um den Mond entsteht ein Halo; Stärke abhängig von Beleuchtung und Höhe des Mondes; HUD-Warnung `NVG GAIN ↓`. Wenig Restlicht (LLL) macht das NVG-Bild verrauschter und kontrastärmer, Tageslicht/helle Dämmerung übersteuert es.
  - HUD: Sonne/Mond-Symbole (mit Phase und Höhe) auf dem Kursband; Telemetrie mit Uhrzeit, Sonne und Mond. Beim Start wird bei Nacht automatisch NVG gewählt.
  - Die Approach Plate enthält Uhrzeit, Sonne, Mond und Lichtlevel (mit Warnzeile bei Sonne/Mond von vorne); der Missions-Link enthält die Zeit.
- **Hubschrauber:** CH-53G (6-Blatt-Hauptrotor, Heckrotor), CH-47F (Tandemrotor) oder H145M LUH SOF (4-Blatt-Hauptrotor, Fenestron, Kufen, Rettungswinde, EO/IR-Sensor, Außenlastträger), mit drehenden Rotoren und eigenem Cockpitrahmen.
- **Ansichten:** Cockpit (rechter Pilotensitz, Umsehen mit der Maus), Außen (Orbit), Beobachter an der LZ, freie Kamera.
- **HUD** mit Kursband, Kurs-Bug zum TGT, GS, Radarhöhe, MSL-Höhe, Steig-/Sinkrate, Horizont/Nicklage, Flugbahnvektor, LZ- und IP-Markern, Distanz und ETE.
- **Tag / NVG:** grünes Phosphorbild mit Rauschen, Halo-Effekt, „NIR-heller“ Vegetation, optional 40°-Röhrensichtfeld.
- Pause, Zeitraffer (0,25×–16×), Zeitleiste zum Spulen, teilbarer **Missions-Link**.
- HUD-Meldungen: beim IP-Überflug `PASSING IP: X-n` (n = Minuten bis zur LZ), Verzögern, nach dem Aufsetzen `SAFE DOWN`.
- **Screenshot** (Kamera-Knopf, Taste `S`) und **Video des gesamten Anflugs** (REC, Taste `V`) für das Briefing: Aufnahme startet am Anfang, läuft mit dem eingestellten Zeitraffer und endet automatisch nach der Landung; Ansicht, Tag/NVG und HUD lassen sich währenddessen umschalten. Gespeichert wird als MP4 (H.264), wenn der Browser es kann, sonst WebM.
- **Als Web-App installierbar** (Chrome/Edge/Samsung Internet: „Als App installieren“ im Panel bzw. Browsermenü; iPhone/iPad: Teilen → „Zum Home-Bildschirm“).

## Geodaten

| Quelle | Luftbild | Gelände | 3D-Gebäude | Schlüssel |
|---|---|---|---|---|
| **Standard** | Esri World Imagery | AWS Terrain Tiles (Terrarium) | OpenStreetMap via Overpass (extrudiert) | keiner |
| **Cesium ion** | Esri oder Bing Maps Aerial | Cesium World Terrain | Cesium OSM Buildings | eingebauter Token (eigener Token optional) |
| **Google 3D** | Google Photorealistic 3D Tiles (Gelände, Gebäude, Bewuchs in einem Mesh) | | | Google-Maps-API-Key (Map Tiles API) **oder** ion-Token |

Schlüssel werden über „🔑 API-Schlüssel“ eingegeben und nur lokal im Browser (localStorage) gespeichert.
Alle Daten werden zur Laufzeit online abgerufen; die Nutzungsbedingungen der jeweiligen Anbieter gelten.
OSM-Abfragen (Overpass) laufen parallel, fragen bei langsamer Antwort nach 8 s zusätzlich den nächsten Server und werden 14 Tage im Browser zwischengespeichert – dieselbe Route lädt beim nächsten Mal fast sofort. Die Approach Plate lädt nur 2D-Daten (Satellitenbild, Grundrisse, Hindernisse), ohne 3D-Aufbau.

## Bedienung

| Taste | Funktion |
|---|---|
| Leertaste | Start/Pause |
| `1` `2` `3` `4` | Cockpit / Außen / LZ / Frei |
| `N` | Tag ↔ NVG |
| `T` | NVG-Röhrensichtfeld 40° |
| `H` | HUD ein/aus |
| `+` / `-` | Zeitraffer |
| `R` / Doppelklick | Blickrichtung zurücksetzen |
| Pfeiltasten | Kopf drehen (Cockpit) |
| Maus ziehen / Mausrad | Umsehen bzw. Orbit / Zoom |
| `P` | Planungspanel ein/aus |
| `F` | Vollbild |
| `S` | Screenshot |
| `?` | Tutorial |
| `V` | Video-Aufnahme starten/stoppen |

## Hosting auf GitHub Pages

1. Repository auf GitHub → **Settings → Pages**
2. *Source*: **Deploy from a branch**, Branch auswählen, Ordner **`/ (root)`** → Save
3. Nach ca. einer Minute ist die App unter `https://<benutzer>.github.io/<repo>/` erreichbar.

Lokal testen: `python3 -m http.server` im Repository starten und `http://localhost:8000` öffnen (nicht per `file://`, da ES-Module verwendet werden).

## Aufbau

```
index.html          Oberfläche
css/style.css       Design (Glas-Paneele, Dark-UI, Mobil-Layout)
js/app.js           UI, Szenen-Setup, Kameras, Simulationsschleife
js/geo.js           MGRS/Lat-Lon-Parser, Vincenty-Geodäsie, WMM2025-Missweisung
js/flight.js        Höhenprofil (Geländefolge), Trajektorie (Verzögerung, Hover, Aufsetzen)
js/terrain.js       Cesium-TerrainProvider für AWS Terrarium-Kacheln + Höhen-Sampler
js/buildings.js     OSM-Gebäude via Overpass (Extrusion, Hindernishöhen)
js/obstacles.js     Leitungen, Masten, Windräder, Wald/Bäume (OSM), Hindernisprofil & HUD-Warnungen
js/plate.js         Target Approach Plate (Canvas, PNG/PDF-Export)
js/capture.js       Screenshot und Videoaufnahme (Szene + Cockpit + HUD)
js/tutorial.js      Bebildertes Tutorial (Bilder in img/tutorial/)
js/changelog.js     Changelog-Daten und „Neu in dieser Version“-Popup (CHANGELOG.md parallel pflegen)
js/imagery.js       Luftbild-Helfer (Esri per fetch, Bing über ion, Leerkachel-Erkennung)
manifest.webmanifest, sw.js, icons/   Installierbare Web-App (PWA)
js/mappicker.js     2D-Kartenauswahl (Leaflet), Ortssuche (Nominatim), GPS-Position
js/models.js        Prozedurale 3D-Modelle CH-53G / CH-47F / H145M (GLB im Speicher)
js/hud.js           HUD-Symbologie
js/cockpit.js       Cockpit-Rahmen (SVG)
js/nvg.js           NVG-Post-Processing (inkl. Auto-Gain, Mond-Halo) und Sonnenblendung
js/astro.js         Sonnen-/Mondstand, Phase, Helligkeit, Auf-/Untergänge, Bewertung der Auswirkungen
js/skyfx.js         Sonne/Mond in der Szene: Mond-Billboard, Blendung, NVG-Restlicht und Auto-Gain
js/vendor/mgrs.esm.js   proj4js/mgrs (MIT)
js/wmm2025.js       WMM2025-Koeffizienten (NOAA/BGS, gemeinfrei)
```

3D-Engine: [CesiumJS](https://cesium.com/platform/cesiumjs/) 1.146 (Apache 2.0), 2D-Karte: [Leaflet](https://leafletjs.com/) 1.9.4 (BSD-2) – beide per CDN.

## Hinweis

Trainings- und Visualisierungswerkzeug. Gelände-, Hindernis- und Luftbilddaten können veraltet, ungenau oder unvollständig sein (OSM ist nicht vollständig: nicht jede Leitung, jeder Mast oder Baum ist erfasst, Höhen sind teils geschätzt; es ersetzt keine amtlichen Luftfahrthindernisdaten). **Nicht für die reale Einsatz- oder Flugplanung verwenden.**
