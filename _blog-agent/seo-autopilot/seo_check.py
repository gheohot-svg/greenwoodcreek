#!/usr/bin/env python3
"""GREENWOODCREEK SEO-Check – prüft greenwoodcreek.de technisch und inhaltlich.

Aufruf (im Terminal auf dem Mac):
    python3 ~/greenwoodcreek-www/_seo-autopilot/seo_check.py

Optional:
    --ohne-live        nur lokale Dateien prüfen (kein Internet)
    --ohne-pagespeed   PageSpeed-Messung überspringen
    PAGESPEED_KEY=...  eigener Google-API-Schlüssel (sonst ohne, dann oft Kontingentgrenze)
    MATOMO_URL=... MATOMO_TOKEN=... MATOMO_SITE=1   Matomo-Zahlen der letzten 7 Tage abrufen

Nur Python-Standardbibliothek. Der Bericht landet in _seo-autopilot/berichte/JJJJ-MM-TT.md
"""
import json, os, re, sys, ssl, time, datetime, urllib.request, urllib.error, urllib.parse
from html.parser import HTMLParser
from collections import defaultdict

SITE = "https://greenwoodcreek.de"
_H = os.path.dirname(os.path.abspath(__file__))
# Website-Wurzel finden: der nächste Ordner nach oben, der index.html und sitemap.xml enthält
ROOT = _H
while ROOT != os.path.dirname(ROOT) and not (os.path.exists(os.path.join(ROOT, "index.html")) and os.path.exists(os.path.join(ROOT, "sitemap.xml"))):
    ROOT = os.path.dirname(ROOT)
HERE = os.path.dirname(os.path.abspath(__file__))
NAP = {"Name": "GREENWOODCREEK", "Straße": "Albert-Schweitzer-Straße 56", "PLZ/Ort": "81735 München",
       "Telefon": "+49 151 55828308"}
LEISTUNGEN = ["/eventfotograf-muenchen/", "/portraitfotograf-muenchen/", "/imagefilm-muenchen/",
              "/hochzeitsfotograf-muenchen/", "/fotograf-heidelberg/", "/webdesign-muenchen/",
              "/social-media-betreuung-muenchen/", "/leistungen/"]
SKIP_DIRS = {"assets", "_apple-preview", "_blog-agent", "_seo-autopilot", ".git"}
IMG_MAX, VID_MAX = 500 * 1024, 10 * 1024 * 1024
UA = "GREENWOODCREEK-SEO-Check/1.0"
ARGS = set(sys.argv[1:])
LIVE = "--ohne-live" not in ARGS

findings = defaultdict(list)   # Kategorie -> [(Stufe, Text)]
def add(cat, level, text): findings[cat].append((level, text))

# ---------------------------------------------------------------- HTTP
def _curl(url, method="GET", follow=True, timeout=20):
    """Fallback über das System-curl (nutzt die Zertifikate von macOS)."""
    import subprocess, tempfile
    hdr = tempfile.NamedTemporaryFile(delete=False); hdr.close()
    cmd = ["curl", "-s", "-A", UA, "--max-time", str(timeout), "-D", hdr.name, "-o", "-", "-w", "\n%{http_code} %{url_effective}"]
    if follow: cmd.append("-L")
    if method == "HEAD": cmd.append("-I")
    try:
        r = subprocess.run(cmd + [url], capture_output=True, timeout=timeout + 5)
    except Exception as e:
        return None, url, {}, str(e).encode()
    out = r.stdout
    body, _, tail = out.rpartition(b"\n")
    try: code, eff = tail.decode().split(" ", 1); code = int(code)
    except Exception: return None, url, {}, r.stderr
    headers = {}
    for line in open(hdr.name, encoding="latin-1").read().splitlines():
        if ":" in line:
            k, v = line.split(":", 1); headers[k.strip()] = v.strip()
    os.unlink(hdr.name)
    return (code or None), eff, headers, body

_USE_CURL = False
def http(url, method="GET", follow=True, timeout=20):
    global _USE_CURL
    if _USE_CURL: return _curl(url, method, follow, timeout)
    class NoRedir(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedir)
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.geturl(), dict(r.headers), r.read() if method == "GET" else b""
    except urllib.error.HTTPError as e:
        return e.code, url, dict(e.headers or {}), b""
    except Exception as e:
        import shutil
        if shutil.which("curl"):
            _USE_CURL = True          # z. B. fehlende Zertifikate bei python.org-Python auf dem Mac
            return _curl(url, method, follow, timeout)
        return None, url, {}, str(e).encode()

# ---------------------------------------------------------------- HTML-Parser
class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.desc, self.canonical, self.robots, self.lang = "", None, None, "", None
        self.h1, self.links, self.imgs_no_alt, self.imgs, self.jsonld = [], [], [], 0, []
        self._in = None; self._buf = ""; self.text = []
    def handle_starttag(self, tag, a):
        a = dict(a)
        if tag == "html": self.lang = a.get("lang")
        elif tag == "title": self._in, self._buf = "title", ""
        elif tag == "h1": self._in, self._buf = "h1", ""
        elif tag == "meta":
            n = (a.get("name") or "").lower()
            if n == "description": self.desc = a.get("content", "")
            if n == "robots": self.robots = (a.get("content") or "").lower()
        elif tag == "link" and "canonical" in (a.get("rel") or "").lower(): self.canonical = a.get("href")
        elif tag == "a" and a.get("href"): self.links.append(a["href"])
        elif tag == "img":
            self.imgs += 1
            if a.get("alt") is None or (a.get("alt", "").strip() == "" and a.get("role") != "presentation" and a.get("aria-hidden") != "true"):
                self.imgs_no_alt.append(a.get("src", "?"))
        elif tag == "script" and (a.get("type") or "") == "application/ld+json": self._in, self._buf = "ld", ""
    def handle_endtag(self, tag):
        if self._in == "title" and tag == "title": self.title = self._buf.strip(); self._in = None
        elif self._in == "h1" and tag == "h1": self.h1.append(re.sub(r"\s+", " ", self._buf).strip()); self._in = None
        elif self._in == "ld" and tag == "script": self.jsonld.append(self._buf); self._in = None
    def handle_data(self, d):
        if self._in: self._buf += d
        self.text.append(d)

def parse(html):
    p = Page(); p.feed(html); p.alltext = re.sub(r"\s+", " ", " ".join(p.text)); return p

# ---------------------------------------------------------------- lokale Seiten
def local_pages():
    out = {}
    for dp, dirs, files in os.walk(ROOT):
        rel = os.path.relpath(dp, ROOT)
        if rel.split(os.sep)[0] in SKIP_DIRS: dirs[:] = []; continue
        if "index.html" in files:
            path = "/" if rel == "." else "/" + rel.replace(os.sep, "/") + "/"
            out[path] = os.path.join(dp, "index.html")
    return out

def main():
    today = datetime.date.today().isoformat()
    pages_local = local_pages()
    pages = {}
    for path, f in pages_local.items():
        pages[path] = parse(open(f, encoding="utf-8", errors="replace").read())

    # ---------- 1 Indexierung & Technik (live)
    sitemap_urls = []
    global LIVE
    if LIVE:
        st, _f, _h, _ = http(SITE + "/", timeout=15)
        if st != 200:
            add("Indexierung & Technik", "HINWEIS", f"Live-Prüfung übersprungen: {SITE} von diesem Rechner nicht erreichbar (Status {st}). Ohne Internet prüft das Skript nur die lokalen Dateien. Fehler: {_.decode('utf-8','replace')[:200]}")
            LIVE = False
    if LIVE:
        st, _, _, body = http(SITE + "/robots.txt")
        if st != 200: add("Indexierung & Technik", "KRITISCH", f"robots.txt nicht erreichbar (Status {st})")
        else:
            rb = body.decode("utf-8", "replace")
            if re.search(r"(?im)^disallow:\s*/\s*$", rb): add("Indexierung & Technik", "KRITISCH", "robots.txt sperrt die ganze Website (Disallow: /)")
            if "sitemap" not in rb.lower(): add("Indexierung & Technik", "HINWEIS", "robots.txt nennt keine Sitemap-Zeile")
        st, _, _, body = http(SITE + "/sitemap.xml")
        if st != 200: add("Indexierung & Technik", "KRITISCH", f"sitemap.xml nicht erreichbar (Status {st})")
        else:
            sitemap_urls = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body.decode("utf-8", "replace"))
        for u in sitemap_urls:
            st, final, h, _ = http(u, follow=False)
            if st != 200: add("Indexierung & Technik", "KRITISCH", f"{u} liefert Status {st} (Sitemap-URL muss 200 liefern)")
            xr = (h.get("X-Robots-Tag") or h.get("x-robots-tag") or "").lower()
            if "noindex" in xr: add("Indexierung & Technik", "KRITISCH", f"{u}: X-Robots-Tag noindex")
            time.sleep(0.2)
        for src in ["http://greenwoodcreek.de/", "https://www.greenwoodcreek.de/", "http://www.greenwoodcreek.de/"]:
            st, _, h, _ = http(src, follow=False)
            loc = h.get("Location") or h.get("location") or ""
            if st not in (301, 308) or not loc.startswith(SITE):
                add("Indexierung & Technik", "WICHTIG", f"{src} leitet nicht dauerhaft (301) auf {SITE}/ weiter (Status {st}, Ziel {loc or '–'})")
        st, _, _, _ = http(SITE + "/diese-seite-gibt-es-nicht-xyz/", follow=False)
        if st != 404: add("Indexierung & Technik", "WICHTIG", f"Nicht vorhandene Seiten liefern Status {st} statt 404 (Soft-404)")
    if not sitemap_urls and os.path.exists(os.path.join(ROOT, "sitemap.xml")):
        sitemap_urls_local = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read())
    else:
        sitemap_urls_local = sitemap_urls
    if sitemap_urls_local:
        local_set = {SITE + p for p in pages_local if p not in ("/404/",) and not p.startswith(("/impressum", "/datenschutz", "/nutzungsbedingungen"))}
        for u in sorted(local_set - set(sitemap_urls_local)):
            if "noindex" not in pages.get(u[len(SITE):], Page()).robots:
                add("Indexierung & Technik", "WICHTIG", f"{u} fehlt in der Sitemap")

    for path, p in pages.items():
        url = SITE + path
        if "noindex" in p.robots and path not in ("/404/",): add("Indexierung & Technik", "KRITISCH", f"{path}: meta robots noindex")
        if not p.canonical: add("Indexierung & Technik", "WICHTIG", f"{path}: kein Canonical")
        elif p.canonical.rstrip("/") != url.rstrip("/") and path != "/404/": add("Indexierung & Technik", "WICHTIG", f"{path}: Canonical zeigt auf {p.canonical}")
        if not p.lang: add("Indexierung & Technik", "HINWEIS", f"{path}: <html lang> fehlt")

    # ---------- 2 Inhalte
    titles, descs = defaultdict(list), defaultdict(list)
    for path, p in pages.items():
        if path in ("/404/",): continue
        t, d = p.title, p.desc
        if not t: add("Inhalte", "KRITISCH", f"{path}: kein <title>")
        elif not 30 <= len(t) <= 65: add("Inhalte", "HINWEIS", f"{path}: Title {len(t)} Zeichen (ideal 30–65): „{t}“")
        if not d: add("Inhalte", "WICHTIG", f"{path}: keine Meta-Description")
        elif not 70 <= len(d) <= 165: add("Inhalte", "HINWEIS", f"{path}: Description {len(d)} Zeichen (ideal 70–165)")
        titles[t].append(path); descs[d].append(path)
        if len(p.h1) != 1: add("Inhalte", "WICHTIG", f"{path}: {len(p.h1)} H1-Überschriften (genau 1 empfohlen)")
        if p.imgs_no_alt: add("Inhalte", "HINWEIS", f"{path}: {len(p.imgs_no_alt)} von {p.imgs} Bildern ohne Alt-Text (z. B. {p.imgs_no_alt[0]})")
    for t, ps in titles.items():
        if t and len(ps) > 1: add("Inhalte", "WICHTIG", f"Doppelter Title „{t}“ auf: {', '.join(ps)}")
    for d, ps in descs.items():
        if d and len(ps) > 1: add("Inhalte", "HINWEIS", f"Doppelte Description auf: {', '.join(ps)}")

    # ---------- 3 Strukturierte Daten & NAP
    for path, p in pages.items():
        if path in ("/404/",) or path.startswith(("/impressum", "/datenschutz", "/nutzungsbedingungen")): continue
        if not p.jsonld: add("Strukturierte Daten & Firmendaten", "HINWEIS", f"{path}: keine strukturierten Daten (JSON-LD)")
        for i, raw in enumerate(p.jsonld):
            try: json.loads(raw)
            except Exception as e: add("Strukturierte Daten & Firmendaten", "KRITISCH", f"{path}: JSON-LD Block {i+1} ungültig ({e})")
    for label, val in NAP.items():
        miss = [path for path, p in pages.items() if path != "/404/" and val.lower() not in p.alltext.lower()
                and val.replace(" ", "").lower() not in p.alltext.replace(" ", "").lower()]
        if miss: add("Strukturierte Daten & Firmendaten", "HINWEIS", f"{label} „{val}“ fehlt im Text von: {', '.join(miss[:8])}{' …' if len(miss) > 8 else ''}")

    # ---------- 4 Interne Links
    for path, p in pages.items():
        for h in p.links:
            if h.startswith(("http://", "https://")):
                if not h.startswith(SITE): continue
                h = h[len(SITE):] or "/"
            if not h.startswith("/") or h.startswith(("/assets", "//")): continue
            target = h.split("#")[0].split("?")[0]
            if target and target not in pages_local and not os.path.exists(os.path.join(ROOT, target.lstrip("/"))):
                add("Interne Links", "WICHTIG", f"{path} → {h} (Ziel existiert nicht)")
    incoming = defaultdict(int)
    for path, p in pages.items():
        for h in set(p.links):
            h = h.replace(SITE, "").split("#")[0]
            if h in pages_local and h != path: incoming[h] += 1
    for path in pages_local:
        if path not in ("/404/",) and incoming[path] == 0: add("Interne Links", "WICHTIG", f"{path} wird von keiner anderen Seite verlinkt (verwaiste Seite)")

    # ---------- 5 Blog-Kontrolle
    blog = {p: pg for p, pg in pages.items() if p.startswith("/aktuelles/") and p != "/aktuelles/"}
    for path, p in blog.items():
        targets = {h.replace(SITE, "").split("#")[0] for h in p.links}
        if not targets & set(LEISTUNGEN): add("Blog-Kontrolle", "WICHTIG", f"{path}: verlinkt auf keine Leistungsseite")
    stop = set("der die das und für in im mit von zu ein eine was wie ihr ihre sie wir mehr so tipps guide ratgeber münchen greenwoodcreek | – -".split())
    def kw(t): return {w for w in re.findall(r"[a-zäöüß]{4,}", (t or "").lower()) if w not in stop}
    items = [(path, kw(pg.title + " " + " ".join(pg.h1))) for path, pg in list(blog.items()) + [(l, pages[l]) for l in LEISTUNGEN if l in pages]]
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = items[i][1], items[j][1]
            if a and b and len(a & b) / len(a | b) >= 0.5:
                add("Blog-Kontrolle", "HINWEIS", f"Mögliche Keyword-Kannibalisierung: {items[i][0]} und {items[j][0]} (gemeinsam: {', '.join(sorted(a & b))})")

    # ---------- 6 Ladezeit
    used = set()
    for path, f in pages_local.items():
        used |= set(re.findall(r"assets/[^\"'\s?#)]+", open(f, encoding="utf-8", errors="replace").read()))
    for js in ["assets/js/nav-toggle.js", "assets/js/alt-scene.js", "assets/js/alt-sections.js"]:
        if os.path.exists(os.path.join(ROOT, js)):
            used |= set(re.findall(r"assets/[^\"'\s?#)]+", open(os.path.join(ROOT, js), encoding="utf-8", errors="replace").read()))
    used_names = {os.path.basename(u) for u in used}
    for dp, dirs, files in os.walk(os.path.join(ROOT, "assets")):
        for f in files:
            if f not in used_names and not any(f.startswith(u.rsplit(".", 1)[0]) for u in used_names if "-mobile" not in u and len(u) > 12 and False): continue
            fp = os.path.join(dp, f); size = os.path.getsize(fp); rel = os.path.relpath(fp, ROOT)
            if re.search(r"\.(jpe?g|png|webp|gif)$", f, re.I) and size > IMG_MAX:
                add("Ladezeit", "HINWEIS", f"{rel}: Bild {size//1024} KB (> 500 KB)")
            if re.search(r"\.(mp4|mov|webm)$", f, re.I) and size > VID_MAX:
                add("Ladezeit", "HINWEIS", f"{rel}: Video {size//1024//1024} MB (> 10 MB)")
    psi = {}
    if LIVE and "--ohne-pagespeed" not in ARGS:
        key = os.environ.get("PAGESPEED_KEY", "")
        for path in ["/", "/eventfotograf-muenchen/"]:
            q = urllib.parse.urlencode({"url": SITE + path, "strategy": "mobile", "category": "performance", **({"key": key} if key else {})})
            st, _, _, body = http("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + q, timeout=90)
            if st != 200: add("Ladezeit", "HINWEIS", f"PageSpeed für {path} nicht abrufbar (Status {st}) – ggf. PAGESPEED_KEY setzen"); continue
            d = json.loads(body); lr = d.get("lighthouseResult", {}); au = lr.get("audits", {})
            score = round((lr.get("categories", {}).get("performance", {}).get("score") or 0) * 100)
            lcp = au.get("largest-contentful-paint", {}).get("displayValue", "?"); cls = au.get("cumulative-layout-shift", {}).get("displayValue", "?")
            psi[path] = (score, lcp, cls)
            if score < 50: add("Ladezeit", "WICHTIG", f"{path}: PageSpeed mobil {score}/100 (LCP {lcp}, CLS {cls})")
            elif score < 80: add("Ladezeit", "HINWEIS", f"{path}: PageSpeed mobil {score}/100 (LCP {lcp}, CLS {cls})")

    # ---------- 7 Matomo (optional)
    matomo = None
    mu, mt, ms = os.environ.get("MATOMO_URL"), os.environ.get("MATOMO_TOKEN"), os.environ.get("MATOMO_SITE", "1")
    if mu and mt:
        q = urllib.parse.urlencode({"module": "API", "method": "VisitsSummary.get", "idSite": ms, "period": "range",
                                    "date": "last7", "format": "JSON", "token_auth": mt})
        st, _, _, body = http(mu.rstrip("/") + "/index.php?" + q)
        matomo = json.loads(body) if st == 200 else f"nicht abrufbar (Status {st})"
    elif LIVE:
        st, _, _, body = http(SITE + "/")
        if st == 200 and b"matomo" not in body.lower(): add("Analyse", "HINWEIS", "Matomo-Tracking ist auf der Startseite noch nicht eingebunden (Working Order)")

    # ---------- Bericht
    order = {"KRITISCH": 0, "WICHTIG": 1, "HINWEIS": 2}
    n = {k: sum(1 for v in findings.values() for l, _ in v if l == k) for k in order}
    lines = [f"# SEO-Check greenwoodcreek.de – {today}", "",
             f"Geprüft: {len(pages)} Seiten lokal" + (f", {len(sitemap_urls)} Sitemap-URLs live" if LIVE else " (ohne Live-Prüfung)"),
             f"Ergebnis: {n['KRITISCH']} kritisch · {n['WICHTIG']} wichtig · {n['HINWEIS']} Hinweise", ""]
    if psi:
        lines += ["## PageSpeed mobil", ""] + [f"- {p}: {s}/100 · LCP {l} · CLS {c}" for p, (s, l, c) in psi.items()] + [""]
    if matomo is not None: lines += ["## Matomo (letzte 7 Tage)", "", f"```\n{json.dumps(matomo, ensure_ascii=False, indent=1)[:1500]}\n```", ""]
    for cat in ["Indexierung & Technik", "Inhalte", "Strukturierte Daten & Firmendaten", "Interne Links", "Blog-Kontrolle", "Ladezeit", "Analyse"]:
        lines += [f"## {cat}", ""]
        items = sorted(findings.get(cat, []), key=lambda x: order[x[0]])
        lines += [f"- **{l}** {t}" for l, t in items] or ["- alles in Ordnung"]
        lines.append("")
    lines += ["## Manuell / per Websuche", "", "Siehe `_seo-autopilot/CHECKLISTE.md` (Wettbewerb, Branchenverzeichnisse, Search Console)."]
    os.makedirs(os.path.join(HERE, "berichte"), exist_ok=True)
    out = os.path.join(HERE, "berichte", today + ".md")
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines[:5])); print("Bericht:", out)
    return 1 if n["KRITISCH"] else 0

if __name__ == "__main__":
    sys.exit(main())
