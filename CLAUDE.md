# Hinweise für Änderungen an IP2TGT

Bei **jedem Update** (neue Version):

1. Versionsnummer erhöhen: `?v=NN` in `index.html` und allen `js/*.js`-Imports, Anzeige `vNN` (`#verBtn` in `index.html`), Cache-Name in `sw.js`, `version` in `version.json` (daran erkennen offene Browser das Update).
2. Neuen Eintrag **oben** in `CHANGELOG` in `js/changelog.js` anlegen (`version`, `date`, `title`, `items` – kurz, aus Nutzersicht, Deutsch). Daraus erscheint beim nächsten Öffnen automatisch das „Neu in vNN“-Popup.
3. Denselben Eintrag in `CHANGELOG.md` ergänzen.
4. README bei neuen Funktionen aktualisieren.
