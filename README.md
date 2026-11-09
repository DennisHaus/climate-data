# climate-data · Klimakalender Schweiz

Interaktives Web-Tool: Ort auf der Karte wählen, passende Stationen für **Temperatur, Niederschlag, Schnee und Abfluss** werden vorgeschlagen, und der Klimakalender zeigt, wie sich Wärme und Wasser über das Jahr und über die Jahrzehnte verschieben.

**Live:** https://dennishaus.github.io/climate-data/

## Inhalt

| Teil | Beschreibung |
|---|---|
| Karte & Stationswahl | swisstopo-Karte, Ortssuche, automatische Wahl naher Stationen (Distanz, Höhe, Länge der Reihe, homogenisierte Temperatur bevorzugt), jede Station austauschbar |
| Klimakalender | Jahr × Kalenderwoche als Raster oder Jahresringe, Referenzperiode frei verschieb- und dehnbar (Standard 1961–1990), Glättung über Jahre und Wochen |
| Wirkungskette | Jahresgang früher/heute: Wärme → Schneeanteil → Schneedecke → Abfluss, Niederschlag → Bodenfeuchte |
| Zusammenhänge | Streudiagramme von Jahr zu Jahr mit Regression |
| Niederschlag & Abfluss | Anteile über das Jahr in 2–52 Abschnitten, Raster «Abfluss minus Niederschlag», Summenkurven |
| Kennzahlen | Jahresmittel (inkl. Paris-Ziele bei Referenz vor 1901), Schneeschmelze, Bodenfeuchte, Abfluss-Schwerpunkt u. a. |

## Daten

- **MeteoSchweiz Open Data** (data.geo.admin.ch) wird **live** abgefragt: Stationsliste (~480 Stationen) und Tageswerte der gewählten Stationen werden direkt im Browser geladen und zu Wochenwerten verrechnet (rund 1 s). SwissMetNet, Niederschlags- und Schneemessnetz, Swiss NBCN (homogenisierte Temperatur).
- **BAFU Hydrodaten**: Tagesmittel Abfluss aus den publizierten Jahrestabellen (meist ab 1993). Das BAFU erlaubt keine Browser-Abfrage, deshalb liest eine GitHub Action die Tabellen einmal pro Woche aus und legt nur kleine Wochenwerte in `data/` ab (insgesamt wenige MB). Ältere Daten sind beim BAFU bestellbar.
- Schneeanteil und Bodenfeuchte sind **abgeleitet/modelliert** (siehe «Daten und Methode» im Tool).

`scripts/build_data.py` liest die BAFU-Tabellen und schreibt `data/hydro.json` und `data/q/<ID>.json`. Die GitHub Action *Abflussdaten aktualisieren* läuft jeden Montag und lässt sich manuell starten (auch nur für einzelne Stationen). Beim ersten Lauf werden alle Jahre gelesen (dauert lange), danach nur noch die letzten zwei Jahre.

```bash
python scripts/build_data.py                 # alle Abflussstationen
python scripts/build_data.py --only 2372     # nur Linth, Mollis
```

Nur Python-Standardbibliothek. Lokal ansehen: `python -m http.server` und http://localhost:8000 öffnen.
