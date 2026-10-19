# IP2TGT – Hubschrauber-Anflugsimulator

**Live:** https://gun642.github.io/IP2TGT/

Web-App (reines HTML/JS, kein Build-Schritt) zur Simulation des Anflugs vom **Initial Point (IP)** zur **Landezone (TGT/LZ)** – auf echtem 3D-Gelände mit hochauflösenden Luftbildern und 3D-Gebäuden, aus dem Cockpit oder von außen, bei Tag oder nachts mit grünem **NVG-Bild**.

![Ablauf](https://img.shields.io/badge/IP%20%E2%86%92%20TGT-80%20kt%20%C2%B7%20100%20ft%20AGL-42e3a0)

## Funktionen

- **TGT/LZ und IP** per **MGRS** oder **Lat/Lon** eingeben, auf einer **Karte auswählen** oder die **aktuelle Position (GPS)** übernehmen.
  - Kartenauswahl (🗺): Luftbild, topografische Karte oder OpenStreetMap; Klick setzt TGT bzw. IP, Marker sind verschiebbar, Kurs/Distanz IP→TGT und MGRS unter dem Cursor werden live angezeigt; Ortssuche oder Koordinateneingabe im Suchfeld; „Meine Position“ setzt den Gerätestandort.
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
- **TAP-Kartenhintergrund:** Luftbild, Topografisch (OpenTopoMap) oder OpenStreetMap – auch direkt im Plate-Fenster umschaltbar.
- **Hubschrauber:** CH-53G (6-Blatt-Hauptrotor, Heckrotor) oder CH-47F (Tandemrotor), mit drehenden Rotoren.
- **Ansichten:** Cockpit (rechter Pilotensitz, Umsehen mit der Maus), Außen (Orbit), Beobachter an der LZ, freie Kamera.
- **HUD** mit Kursband, Kurs-Bug zum TGT, GS, Radarhöhe, MSL-Höhe, Steig-/Sinkrate, Horizont/Nicklage, Flugbahnvektor, LZ- und IP-Markern, Distanz und ETE.
- **Tag / NVG:** grünes Phosphorbild mit Rauschen, Halo-Effekt, „NIR-heller“ Vegetation, optional 40°-Röhrensichtfeld.
- Pause, Zeitraffer (0,25×–16×), Zeitleiste zum Spulen, teilbarer **Missions-Link**.

## Geodaten

| Quelle | Luftbild | Gelände | 3D-Gebäude | Schlüssel |
|---|---|---|---|---|
| **Standard** | Esri World Imagery | AWS Terrain Tiles (Terrarium) | OpenStreetMap via Overpass (extrudiert) | keiner |
| **Cesium ion** | Esri oder Bing Maps Aerial | Cesium World Terrain | Cesium OSM Buildings | eingebauter Token (eigener Token optional) |
| **Google 3D** | Google Photorealistic 3D Tiles (Gelände, Gebäude, Bewuchs in einem Mesh) | | | Google-Maps-API-Key (Map Tiles API) **oder** ion-Token |

Schlüssel werden über „🔑 API-Schlüssel“ eingegeben und nur lokal im Browser (localStorage) gespeichert.
Alle Daten werden zur Laufzeit online abgerufen; die Nutzungsbedingungen der jeweiligen Anbieter gelten.

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
js/mappicker.js     2D-Kartenauswahl (Leaflet), Ortssuche (Nominatim), GPS-Position
js/models.js        Prozedurale 3D-Modelle CH-53G / CH-47F (GLB im Speicher)
js/hud.js           HUD-Symbologie
js/cockpit.js       Cockpit-Rahmen (SVG)
js/nvg.js           NVG-Post-Processing
js/vendor/mgrs.esm.js   proj4js/mgrs (MIT)
js/wmm2025.js       WMM2025-Koeffizienten (NOAA/BGS, gemeinfrei)
```

3D-Engine: [CesiumJS](https://cesium.com/platform/cesiumjs/) 1.146 (Apache 2.0), 2D-Karte: [Leaflet](https://leafletjs.com/) 1.9.4 (BSD-2) – beide per CDN.

## Hinweis

Trainings- und Visualisierungswerkzeug. Gelände-, Hindernis- und Luftbilddaten können veraltet, ungenau oder unvollständig sein (OSM ist nicht vollständig: nicht jede Leitung, jeder Mast oder Baum ist erfasst, Höhen sind teils geschätzt; es ersetzt keine amtlichen Luftfahrthindernisdaten). **Nicht für die reale Einsatz- oder Flugplanung verwenden.**
