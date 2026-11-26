# Changelog

Alle Änderungen an IP2TGT. Die App zeigt nach einem Update einmalig die Neuerungen an; der vollständige Changelog ist in der App über die Versionsnummer oben im Planungspanel oder „📋 Changelog“ erreichbar.

## v24 – Updates kommen sofort an (2026-11-26)

- Die App prüft beim Öffnen (und beim Zurückwechseln in den Tab), ob eine neue Version veröffentlicht ist, und lädt sie automatisch – kein veralteter Stand mehr aus dem Browser-Cache.
- Läuft gerade ein Anflug oder eine Videoaufnahme, wird nicht neu geladen, sondern nur ein Hinweis angezeigt.

## v23 – Neuigkeiten & Changelog (2026-11-26)

- Nach jedem Update erscheint einmalig ein Fenster mit den Neuerungen seit dem letzten Besuch.
- Vollständiger Changelog jederzeit über die Versionsnummer oben im Panel oder „📋 Changelog“ unter Daten & Darstellung.

## v22 – Anflugzeit · Sonne & Mond (2026-11-26)

- Datum und Uhrzeit (Ortszeit oder Zulu) für IP-Überflug oder Landung eingeben – Sonnen- und Mondstand an der LZ werden berechnet.
- Mond: Azimut, Höhe, Richtung zum Kurs, Beleuchtung in %, Phase, Größe und Helligkeit; Sonne: Azimut, Höhe, Richtung.
- Lichtlevel (Tag/Dämmerung/HLL/LLL), Auf-/Untergänge und BMNT/EENT, Himmelsdiagramm mit Blendzone und NVG-Sichtfeld.
- Auswirkungen auf den Anflug im Klartext (z. B. „Sonne von vorne: starke Blendung“).
- Simulation: Blendung bei Sonne von vorne; NVG-Auto-Gain regelt beim Blick in den Mond herunter und dunkelt die Außensicht ab (mit Halo).
- Sonne/Mond auf dem HUD-Kursband, Warnungen, Infobox auf der Approach Plate, Zeit im Missions-Link.

## v21 – Schneller laden (2026-11-12)

- Approach Plate lädt nur noch 2D-Daten (ohne 3D-Aufbau).
- OSM-Abfragen parallel und gestaffelt, 14 Tage Zwischenspeicher im Browser.
- Gebäudehöhen für Cesium ion aus OSM-Grundrissen, kürzeres Warten beim Start.

## v20 – Tutorial (2026-11-11)

- Bebildertes Tutorial beim ersten Start, jederzeit über ? erneut aufrufbar.

## v19 – H145M LUH SOF (2026-10-25)

- Neues Hubschraubermodell H145M LUH SOF mit eigenem Cockpitrahmen.

## v18 – Screenshot, Video & Web-App (2026-10-20)

- HUD-Meldungen PASSING IP X-n und SAFE DOWN.
- Screenshot (S) und Video des gesamten Anflugs (V).
- Luftbild-Fallback in der Kartenauswahl, als Web-App installierbar.

## v17 – Plate-Luftbildquellen (2026-10-19)

- Luftbildquelle der Plate wählbar (Esri, Bing, 3D-Globus) mit Diagnosezeile.
- 3D-Darstellung pausiert, solange die Plate offen ist.

## v16 – Höhenprofil „Konstant über LZ“ (2026-10-19)

- Neues Höhenprofil mit konstanter Höhe über LZ-Elevation; Kartenhintergrund der Plate wählbar.

## v15 – Luftbild-Ersatz (2026-10-19)

- Luftbild über Bing (Cesium ion), wenn der Esri-Server gesperrt ist; leere Kacheln werden erkannt.

## v14 – Plate: Globus-Aufnahme (2026-10-19)

- Ersatz-Luftbild für die Plate als Senkrechtaufnahme aus dem 3D-Globus.

## v13 – Plate-Diagnose (2026-10-19)

- Diagnose der Luftbildquellen, gespiegelte Globus-Kacheln korrigiert.

## v12 – Cesium ion als Standard (2026-10-19)

- Cesium ion ist Standard-Geodatenquelle; Plate-Luftbild über Globus/Bing.

## v11 – Target Approach Plate (2026-10-19)

- Approach Plate nach Vorlage (PNG/PDF), eingebauter Cesium-ion-Token.

## v10 – Einheiten (2026-10-17)

- Höhenregler-Skala korrigiert, globale Umschaltung NM/km.

## v9 – Robustere OSM-Abfragen (2026-10-17)

- OSM-Abfragen robuster, Lade-Ergebnis wird angezeigt.

## v8 – Erste Versionen (2026-10-17)

- Anflugsimulator IP → TGT auf 3D-Gelände mit Luftbild, Cockpit/Außen/LZ-Ansicht, Tag/NVG, HUD.
- Kartenauswahl und GPS-Position für TGT/IP, Hindernisse und Vegetation in 3D, Konturenflug.
- Mobile Darstellung, Datenlücken im Gelände gefüllt, Versionsanzeige.
