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

- **MeteoSchweiz Open Data** (data.geo.admin.ch): SwissMetNet, Niederschlags- und Schneemessnetz, Swiss NBCN (homogenisierte Temperatur).
- **BAFU Hydrodaten**: Tagesmittel Abfluss aus den publizierten Jahrestabellen (meist ab 1993). Ältere Daten sind beim BAFU bestellbar.
- Schneeanteil und Bodenfeuchte sind **abgeleitet/modelliert** (siehe «Daten und Methode» im Tool).

`scripts/build_data.py` lädt alles und schreibt kompakte Wochenwerte nach `data/`. Die GitHub Action *Daten aktualisieren* läuft jeden Montag und lässt sich manuell starten (auch nur für einzelne Stationen).

```bash
python scripts/build_data.py            # alles
python scripts/build_data.py --met      # nur MeteoSchweiz
python scripts/build_data.py --hydro --only 2372
```

Nur Python-Standardbibliothek. Lokal ansehen: `python -m http.server` und http://localhost:8000 öffnen.
