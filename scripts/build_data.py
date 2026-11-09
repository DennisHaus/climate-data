#!/usr/bin/env python3
"""
climate-data · Datenaufbereitung

Das Tool lädt die Wetterdaten von MeteoSchweiz live im Browser. Nur der Abfluss
muss vorbereitet werden: Das BAFU publiziert die Tageswerte als PDF-Jahrestabellen
(hydrodaten.admin.ch) und erlaubt keine Abfrage aus dem Browser. Dieses Skript liest
die Tabellen aus und schreibt kompakte Wochenwerte:

  data/hydro.json           Abflussstationen mit Koordinaten, Einzugsgebiet, Zeitraum
  data/q/<ID>.json          Wochenmittel Abfluss (m³/s)

Optional (--met) lassen sich auch die Wetterdaten vorrechnen; das Tool braucht sie nicht.

Wochen: 52 pro Jahr ab 1. Januar, die letzten 1–2 Tage zählen zur Woche 52.
Nur Standardbibliothek. Aufruf:  python scripts/build_data.py [--only 2372,2104]
"""
import argparse, concurrent.futures as cf, csv, io, json, math, os, re, sys, time, urllib.request, zlib
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data")
STAC = "https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.{c}"
HYDRO = "https://www.hydrodaten.admin.ch"
UA = {"User-Agent": "climate-data (github.com/DennisHaus/climate-data)"}
NW = 52
THIS_YEAR = date.today().year


def get(url, binary=False, tries=3, timeout=90):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
            return b if binary else b.decode("utf-8", errors="replace") if b[:3] == b"\xef\xbb\xbf" or _is_utf8(b) else b.decode("latin-1")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 * (i + 1))
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def _is_utf8(b):
    try:
        b.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def week_of(d):
    return min((d - date(d.year, 1, 1)).days // 7, NW - 1)


def weekly(daily, how):
    """daily: {date: value} -> {year: [52 values or None]}"""
    acc = {}
    for d, v in daily.items():
        a = acc.setdefault(d.year, [[0.0, 0] for _ in range(NW)])
        w = week_of(d)
        a[w][0] += v
        a[w][1] += 1
    out = {}
    for y, a in acc.items():
        row = []
        for s, n in a:
            if n < 4:
                row.append(None)
            elif how == "sum7":
                row.append(round(s * 7 / n, 1))
            elif how == "int":
                row.append(round(s / n))
            else:
                row.append(round(s / n, 1))
        out[y] = row
    return out


def grid(wk):
    """{year:[...]} -> {y0, g} trimmed to years with data"""
    ys = sorted(y for y, r in wk.items() if sum(x is not None for x in r) >= 8)
    if not ys:
        return None
    y0, y1 = ys[0], ys[-1]
    g = [wk.get(y, [None] * NW) for y in range(y0, y1 + 1)]
    return {"y0": y0, "g": g}


# ---------------------------------------------------------------- MeteoSchweiz
def stac_items(coll):
    url = STAC.format(c=coll) + "/items?limit=100"
    items = []
    while url:
        t = get(url)
        if not t:
            break
        j = json.loads(t)
        items += j.get("features", [])
        nxt = [l["href"] for l in j.get("links", []) if l.get("rel") == "next"]
        url = nxt[0] if nxt else None
    return items


def read_meta(coll):
    """station metadata csv of a collection -> {abbr: {...}}"""
    t = get(f"https://data.geo.admin.ch/ch.meteoschweiz.{coll}/{coll}_meta_stations.csv")
    if not t:
        return {}
    rd = csv.DictReader(io.StringIO(t), delimiter=";")
    out = {}
    for r in rd:
        k = {kk.lower(): vv for kk, vv in r.items() if kk}
        ab = k.get("station_abbr")
        if not ab:
            continue
        def f(*names):
            for n in names:
                for kk, vv in k.items():
                    if n in kk and vv not in ("", None):
                        try:
                            return float(vv)
                        except ValueError:
                            pass
            return None
        out[ab.upper()] = {
            "name": k.get("station_name", ab),
            "canton": k.get("station_canton", ""),
            "lat": f("wgs84_lat"), "lon": f("wgs84_lon"),
            "elev": f("height_masl"),
        }
    return out


def read_daily(coll, abbr, cols):
    """returns {col: {date: value}} from historical + recent daily csv"""
    res = {c: {} for c in cols}
    for part in ("historical", "recent"):
        t = get(f"https://data.geo.admin.ch/ch.meteoschweiz.{coll}/{abbr.lower()}/{coll}_{abbr.lower()}_d_{part}.csv")
        if not t:
            continue
        rd = csv.reader(io.StringIO(t), delimiter=";")
        head = next(rd, None)
        if not head:
            continue
        head = [h.strip() for h in head]
        idx = {c: head.index(c) for c in cols if c in head}
        ti = head.index("reference_timestamp") if "reference_timestamp" in head else 1
        for row in rd:
            if len(row) <= ti:
                continue
            try:
                dd, mm, yy = row[ti].split(" ")[0].split(".")
                d = date(int(yy), int(mm), int(dd))
            except Exception:
                continue
            for c, i in idx.items():
                if i < len(row) and row[i].strip() not in ("", "-"):
                    try:
                        res[c][d] = float(row[i])
                    except ValueError:
                        pass
    return res


MET_SOURCES = [
    # collection, column, variable, aggregation, homogenised
    ("ogd-nbcn", "ths200d0", "T", "mean", True),
    ("ogd-smn", "tre200d0", "T", "mean", False),
    ("ogd-smn", "rre150d0", "P", "sum7", False),
    ("ogd-smn-precip", "rre150d0", "P", "sum7", False),
    ("ogd-nime", "rre150d0", "P", "sum7", False),
    ("ogd-smn", "htoautd0", "S", "int", False),
    ("ogd-nime", "hto000d0", "S", "int", False),
]


def build_met(only=None):
    os.makedirs(os.path.join(OUT, "met"), exist_ok=True)
    colls = sorted({c for c, *_ in MET_SOURCES})
    meta, have = {}, {}
    for c in colls:
        m = read_meta(c)
        print(f"[met] {c}: {len(m)} stations in metadata", flush=True)
        for ab, v in m.items():
            if ab not in meta or meta[ab]["lat"] is None:
                meta[ab] = v
        items = stac_items(c)
        print(f"[met] {c}: {len(items)} STAC items", flush=True)
        for it in items:
            ab = it["id"].upper()
            assets = it.get("assets", {})
            if any("_d_" in a for a in assets):
                have.setdefault(ab, set()).add(c)
            if ab not in meta:
                geom = it.get("geometry") or {}
                co = geom.get("coordinates") or [None, None]
                meta[ab] = {"name": (it.get("properties") or {}).get("title", ab), "canton": "", "lat": co[1], "lon": co[0], "elev": None}
    abbrs = sorted(have)
    if only:
        abbrs = [a for a in abbrs if a in only]
    print(f"[met] {len(abbrs)} stations with daily data", flush=True)

    def one(ab):
        series = {}
        for coll, col, var, how, homog in MET_SOURCES:
            if coll not in have[ab]:
                continue
            if var in series and (series[var]["h"] or var != "T"):
                # keep homogenised T; for P/S keep the longest
                pass
            d = read_daily(coll, ab, [col])[col]
            if len(d) < 3650:
                continue
            gr = grid(weekly(d, how))
            if not gr:
                continue
            gr["h"] = homog
            gr["src"] = coll
            old = series.get(var)
            if old is None or (homog and not old["h"]) or (not old["h"] and len(gr["g"]) > len(old["g"])):
                series[var] = gr
        if not series:
            return ab, None
        with open(os.path.join(OUT, "met", f"{ab}.json"), "w") as f:
            json.dump({"id": ab, **{k: {"y0": v["y0"], "h": v["h"], "g": v["g"]} for k, v in series.items()}}, f, separators=(",", ":"))
        return ab, {k: [v["y0"], v["y0"] + len(v["g"]) - 1, 1 if v["h"] else 0] for k, v in series.items()}

    out = []
    with cf.ThreadPoolExecutor(6) as ex:
        for ab, vars_ in ex.map(one, abbrs):
            if not vars_:
                continue
            m = meta.get(ab, {})
            if m.get("lat") is None:
                continue
            out.append({"id": ab, "name": m.get("name", ab), "kt": m.get("canton", ""), "lat": round(m["lat"], 5), "lon": round(m["lon"], 5),
                        "elev": None if m.get("elev") is None else round(m["elev"]), "v": vars_})
            print(f"[met] {ab} {vars_}", flush=True)
    return out


# ---------------------------------------------------------------- BAFU hydrology
def lv95_to_wgs84(e, n):
    y = (e - 2600000) / 1e6
    x = (n - 1200000) / 1e6
    lam = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    phi = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return phi * 100 / 36, lam * 100 / 36


def hydro_station_ids():
    ids = set()
    for path in ("/de/seen-und-fluesse/stationen-und-daten", "/de/seen-und-fluesse/messstationen-zustand"):
        t = get(HYDRO + path) or ""
        ids |= set(re.findall(r"stationen-und-daten/(\d{4})", t))
    # fallback: geo.admin layer of hydrometric stations
    if len(ids) < 50:
        t = get("https://api3.geo.admin.ch/rest/services/api/MapServer/ch.bafu.hydrologie-hydromessstationen/query?where=1%3D1&returnGeometry=false&outFields=*&f=json") or ""
        ids |= set(re.findall(r'"(?:key|nr|station_id|lhg_nr|messstation_nr)"\s*:\s*"?(\d{4})', t))
    return sorted(ids)


def num_after(html, label):
    m = re.search(re.escape(label) + r"[^0-9\-]{0,200}?([\d'’\.]+)", html, re.S)
    if not m:
        return None
    try:
        return float(m.group(1).replace("'", "").replace("’", ""))
    except ValueError:
        return None


def hydro_meta(sid):
    html = get(f"{HYDRO}/de/seen-und-fluesse/stationen-und-daten/{sid}")
    if not html:
        return None
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    title = re.search(r"<title>([^<]+)</title>", html)
    name = title.group(1).split("|")[0].strip() if title else sid
    m = re.search(r"Koordinaten der Station\s*([\d'’]+)\s*/\s*([\d'’]+)", text)
    if not m:
        return None
    e, n = (float(v.replace("'", "").replace("’", "")) for v in m.groups())
    lat, lon = lv95_to_wgs84(e, n)
    years = sorted({int(y) for y in re.findall(rf"/documents/Jahrestabellen/{sid}Q_(\d\d)\.pdf", html)})
    years = [2000 + y if 2000 + y <= THIS_YEAR else 1900 + y for y in years]
    if not years:
        return None
    return {"id": sid, "name": name, "lat": round(lat, 5), "lon": round(lon, 5),
            "elev": num_after(text, "Stationshöhe"), "area": num_after(text, "Fläche des Einzugsgebiets"),
            "melev": num_after(text, "Mittlere Höhe des Einzugsgebiets"), "glac": num_after(text, "Vergletscherung"),
            "years": sorted(years)}


# --- minimal PDF text extraction for BAFU Jahrestabellen
def pdf_streams(b):
    out = []
    for m in re.finditer(rb"stream\r?\n", b):
        s = m.end()
        e = b.find(b"endstream", s)
        if e < 0:
            continue
        raw = b[s:e]
        head = b[max(0, m.start() - 300):m.start()]
        if b"FlateDecode" in head:
            try:
                raw = zlib.decompressobj().decompress(raw)
            except Exception:
                continue
        out.append(raw.decode("latin-1", errors="replace"))
    return out


def pdf_items(c):
    items = []
    for m in re.finditer(r"BT(.*?)ET", c, re.S):
        blk = m.group(1)
        q = re.search(r"([\d.\-]+)\s+([\d.\-]+)\s+Td", blk) or re.search(r"1\s+0\s+0\s+1\s+([\d.\-]+)\s+([\d.\-]+)\s+Tm", blk)
        tq = re.search(r"(\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f]*>)\s*Tj", blk)
        if not q or not tq:
            continue
        s = tq.group(1)
        if s[0] == "<":
            h = s[1:-1]
            s = "".join(chr(int(h[i:i + 2], 16)) for i in range(0, len(h) - 1, 2))
        else:
            s = s[1:-1]
        items.append((float(q.group(1)), float(q.group(2)), s.strip()))
    return items


def parse_jahrestabelle(b, year):
    best = {}
    for c in pdf_streams(b):
        it = pdf_items(c)
        ints = [i for i in it if re.fullmatch(r"\d{1,2}", i[2]) and 1 <= int(i[2]) <= 31]
        if len(ints) < 28:
            continue
        minx = min(i[0] for i in ints)
        days = [i for i in ints if i[0] < minx + 8]
        vals = []
        for x, y, s in it:
            if not re.fullmatch(r"\d+(\.\d+)?", s) or x < minx + 8:
                continue
            d = next((dd for dd in days if abs(dd[1] - y) < 0.8), None)
            if d:
                vals.append((x + len(s) * 3, int(d[2]), float(s)))
        xs = sorted({round(v[0]) for v in vals})
        cl = []
        for x in xs:
            if cl and x - cl[-1][1] < 12:
                cl[-1][1] = x
            else:
                cl.append([x, x])
        if len(cl) >= 13:
            C = cl[:12]
        elif len(cl) >= 2:
            C = cl[:-1]  # partial year: last cluster are the right-hand day labels
        else:
            continue
        out = {}
        for x, d, v in vals:
            m = next((k for k, (a, bb) in enumerate(C) if a - 1 <= x <= bb + 1), None)
            if m is None:
                continue
            try:
                out[date(year, m + 1, d)] = v
            except ValueError:
                pass
        if len(out) > len(best):
            best = out
    return best


def build_hydro(only=None):
    os.makedirs(os.path.join(OUT, "q"), exist_ok=True)
    ids = hydro_station_ids()
    if only:
        ids = [i for i in ids if i in only]
    print(f"[hydro] {len(ids)} station ids", flush=True)
    with cf.ThreadPoolExecutor(6) as ex:
        metas = [m for m in ex.map(hydro_meta, ids) if m]
    print(f"[hydro] {len(metas)} stations with discharge tables", flush=True)
    out = []
    for m in metas:
        sid = m["id"]
        path = os.path.join(OUT, "q", f"{sid}.json")
        cache = json.load(open(path)) if os.path.exists(path) else {"years": {}}
        yrs = cache.get("years", {})
        todo = [y for y in m["years"] if str(y) not in yrs or y >= THIS_YEAR - 1]

        def fetch(y):
            b = get(f"{HYDRO}/documents/Jahrestabellen/{sid}Q_{y % 100:02d}.pdf", binary=True)
            if not b:
                return y, None
            d = parse_jahrestabelle(b, y)
            if len(d) < 20:
                return y, None
            return y, weekly(d, "mean").get(y)

        with cf.ThreadPoolExecutor(6) as ex:
            for y, row in ex.map(fetch, todo):
                if row:
                    yrs[str(y)] = [None if v is None else round(v, 2) for v in row]
        if not yrs:
            continue
        ys = sorted(int(y) for y in yrs)
        y0, y1 = ys[0], ys[-1]
        g = [yrs.get(str(y), [None] * NW) for y in range(y0, y1 + 1)]
        with open(path, "w") as f:
            json.dump({"id": sid, "y0": y0, "g": g, "years": yrs}, f, separators=(",", ":"))
        out.append({k: m[k] for k in ("id", "name", "lat", "lon", "elev", "area", "melev", "glac")} | {"y": [y0, y1]})
        print(f"[hydro] {sid} {m['name']}: {y0}-{y1}", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--met", action="store_true", help="zusätzlich Wetterdaten vorrechnen (vom Tool nicht benötigt, es lädt sie live)")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    only = set(x.strip().upper() for x in a.only.split(",") if x.strip()) or None
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "hydro.json")
    old = json.load(open(path)) if os.path.exists(path) else {"hydro": []}
    new = build_hydro(only)
    if only:
        keep = {s["id"]: s for s in old.get("hydro", [])}
        keep.update({s["id"]: s for s in new})
        new = list(keep.values())
    with open(path, "w") as f:
        json.dump({"hydro": sorted(new, key=lambda s: s["id"]), "updated": date.today().isoformat()}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"done: {len(new)} hydro stations")
    if a.met:
        met = build_met(only)
        with open(os.path.join(OUT, "met.json"), "w") as f:
            json.dump(met, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
