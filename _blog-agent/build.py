#!/usr/bin/env python3
"""GREENWOODCREEK Blog-Builder.
Aufruf: python3 _blog-agent/build.py _blog-agent/artikel/<slug>.json
Erzeugt /aktuelles/<slug>/index.html, ergaenzt die Teaser-Liste und das
JSON-LD auf /aktuelles/ und traegt die URL in sitemap.xml ein.
Idempotent: ein zweiter Lauf mit gleichem Slug ersetzt den Artikel."""
import json, sys, re, html, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://greenwoodcreek.de"
MONATE = ["Januar","Februar","März","April","Mai","Juni","Juli","August",
          "September","Oktober","November","Dezember"]

def fail(msg):
    print("FEHLER:", msg); sys.exit(1)

def de_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day}. {MONATE[d.month-1]} {d.year}"

def main(path):
    a = json.load(open(path, encoding="utf-8"))
    for k in ["title","slug","date","category","meta_title","meta_description","lead","body_html"]:
        if not a.get(k): fail(f"Feld '{k}' fehlt")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", a["slug"]): fail("Slug nur a-z, 0-9, Bindestrich")
    if len(a["meta_title"]) > 65: fail("meta_title > 65 Zeichen")
    if not 110 <= len(a["meta_description"]) <= 160: fail("meta_description muss 110-160 Zeichen haben")
    if "—" in a["body_html"] + a["lead"]: fail("Gedankenstrich (—) im Text, bitte entfernen")
    slug, url = a["slug"], f"{BASE}/aktuelles/{a['slug']}/"
    image = a.get("image") or "/assets/images/blog/wiesn-2026/wiesn-2026-01.webp"
    image_abs = image if image.startswith("http") else BASE + image

    listing_p = ROOT/"aktuelles"/"index.html"
    src = listing_p.read_text(encoding="utf-8")
    head_end = src.index("</head>")
    body_open = src.index("<body>")
    main_start = src.index('<main class="gwc-main"')
    main_end = src.index("</main>") + len("</main>")

    # ---- Head des Artikels -------------------------------------------
    head = src[:head_end]
    head = re.sub(r"<script type=\"application/ld\+json\">.*?</script>", "", head, flags=re.S)
    head = head.replace('href="../', 'href="../../').replace('src="../', 'src="../../')
    esc = lambda s: html.escape(s, quote=True)
    head = re.sub(r"<title>.*?</title>", f"<title>{esc(a['meta_title'])}</title>", head, flags=re.S)
    def setmeta(h, attr, key, val):
        return re.sub(rf'<meta content="[^"]*" {attr}="{re.escape(key)}"/>',
                      f'<meta content="{esc(val)}" {attr}="{key}"/>', h)
    for attr,key,val in [("name","description",a["meta_description"]),
                         ("property","og:title",a["meta_title"]),
                         ("property","og:description",a["meta_description"]),
                         ("property","og:image",image_abs),("property","og:url",url),
                         ("property","og:type","article"),
                         ("name","twitter:title",a["meta_title"]),
                         ("name","twitter:description",a["meta_description"]),
                         ("name","twitter:image",image_abs)]:
        head = setmeta(head, attr, key, val)
    head = re.sub(r'<link href="[^"]*" rel="canonical"/>', f'<link href="{url}" rel="canonical"/>', head)
    head = head.replace('data-wf-page="aktuelles"', f'data-wf-page="aktuelles-{slug}"')
    graph = [
      {"@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":1,"name":"Startseite","item":BASE+"/"},
        {"@type":"ListItem","position":2,"name":"Aktuelles","item":BASE+"/aktuelles/"},
        {"@type":"ListItem","position":3,"name":a["title"],"item":url}]},
      {"@type":"BlogPosting","@id":url+"#artikel","headline":a["title"],"url":url,
       "datePublished":a["date"],"dateModified":a["date"],"image":image_abs,
       "description":a["meta_description"],"inLanguage":"de-DE",
       "keywords":", ".join(a.get("keywords",[])),
       "author":{"@id":BASE+"/uber-uns/#jan-neumeyer","@type":"Person","name":"Jan Neumeyer"},
       "publisher":{"@id":BASE+"/#business"},"mainEntityOfPage":url}]
    faq = a.get("faq") or []
    if faq:
        graph.append({"@type":"FAQPage","mainEntity":[
            {"@type":"Question","name":q["q"],"acceptedAnswer":{"@type":"Answer","text":q["a"]}} for q in faq]})
    ld = json.dumps({"@context":"https://schema.org","@graph":graph}, ensure_ascii=False)
    head += f'<script type="application/ld+json">{ld}</script>'
    head += '<link href="../../assets/css/gwc-article.css?v=1" rel="stylesheet" type="text/css"/>'

    # ---- Body ----------------------------------------------------------
    pre_main = src[body_open:main_start].replace('href="../','href="../../').replace('src="../','src="../../')
    post_main = src[main_end:].replace('href="../','href="../../').replace('src="../','src="../../')
    faq_html = ""
    if faq:
        faq_html = '<section class="gwc-article-faq"><h2>Häufige Fragen</h2>' + "".join(
            f'<details><summary>{esc(q["q"])}</summary><p>{esc(q["a"])}</p></details>' for q in faq) + "</section>"
    hero_img = ""
    if a.get("image"):
        hero_img = (f'<figure class="gwc-article-figure"><img src="{esc(image)}" alt="{esc(a.get("image_alt",a["title"]))}" '
                    f'loading="eager" decoding="async"/></figure>')
    cta = ('<aside class="gwc-article-cta"><p>Sie planen ein Projekt in München, Heidelberg oder Umgebung?</p>'
           '<a class="gwc-article-btn" href="/leistungen/#kontakt">Unverbindlich anfragen</a></aside>')
    main_html = (
      '<main class="gwc-main" id="main" tabindex="-1"><div class="gwc-blog-page gwc-article-page">'
      '<section class="gwc-blog-hero"><div class="gwc-blog-inner">'
      f'<p class="gwc-blog-kicker"><a href="/aktuelles/">Aktuelles</a></p>'
      f'<h1 class="gwc-article-title">{esc(a["title"])}</h1>'
      f'<p class="gwc-post-meta gwc-article-meta"><time datetime="{a["date"]}">{de_date(a["date"])}</time> · {esc(a["category"])} · Jan Neumeyer</p>'
      f'<p class="gwc-blog-lead">{esc(a["lead"])}</p></div></section>'
      '<section class="gwc-blog-list"><div class="gwc-blog-inner gwc-article-body">'
      f'{hero_img}{a["body_html"]}{faq_html}{cta}'
      '<p class="gwc-article-back"><a href="/aktuelles/">Alle Beiträge</a></p>'
      '</div></section></div></main>')
    out = head + "</head>" + pre_main + main_html + post_main
    d = ROOT/"aktuelles"/slug; d.mkdir(parents=True, exist_ok=True)
    (d/"index.html").write_text(out, encoding="utf-8")

    # ---- Teaser auf /aktuelles/ ---------------------------------------
    marker_s, marker_e = f"<!--gwc-teaser:{slug}-->", f"<!--/gwc-teaser:{slug}-->"
    src = re.sub(re.escape(marker_s)+r".*?"+re.escape(marker_e), "", src, flags=re.S)
    teaser = (f'{marker_s}<article class="gwc-post gwc-post-teaser" id="{slug}"><header class="gwc-post-header"><div>'
              f'<p class="gwc-post-meta"><time datetime="{a["date"]}">{de_date(a["date"])}</time> · {esc(a["category"])}</p>'
              f'<h2 class="gwc-post-title"><a href="/aktuelles/{slug}/">{esc(a["title"])}</a></h2></div>'
              f'<p class="gwc-post-text">{esc(a["meta_description"])} <a class="gwc-post-more" href="/aktuelles/{slug}/">Weiterlesen</a></p>'
              f'</header></article>{marker_e}')
    anchor = '<section class="gwc-blog-list"><div class="gwc-blog-inner">'
    if anchor not in src: fail("Teaser-Anker auf /aktuelles/ nicht gefunden")
    src = src.replace(anchor, anchor + teaser, 1)
    # JSON-LD der Uebersicht
    m = re.search(r'<script type="application/ld\+json">(.*?)</script>', src, flags=re.S)
    data = json.loads(m.group(1))
    for node in data["@graph"]:
        if node.get("@type") == "Blog":
            node["blogPost"] = [p for p in node.get("blogPost",[]) if p.get("url") != url]
            node["blogPost"].insert(0, {"@type":"BlogPosting","@id":url+"#artikel","headline":a["title"],
                "url":url,"datePublished":a["date"],"image":image_abs,"description":a["meta_description"],
                "inLanguage":"de-DE","author":{"@id":BASE+"/uber-uns/#jan-neumeyer","@type":"Person","name":"Jan Neumeyer"},
                "publisher":{"@id":BASE+"/#business"}})
    src = src[:m.start(1)] + json.dumps(data, ensure_ascii=False) + src[m.end(1):]
    listing_p.write_text(src, encoding="utf-8")

    # ---- Sitemap -------------------------------------------------------
    sm_p = ROOT/"sitemap.xml"; sm = sm_p.read_text(encoding="utf-8")
    sm = re.sub(r"\s*<url>\s*<loc>"+re.escape(url)+r"</loc>.*?</url>", "", sm, flags=re.S)
    entry = (f"  <url>\n    <loc>{url}</loc>\n    <lastmod>{a['date']}</lastmod>\n"
             f"    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>\n")
    sm = sm.replace("</urlset>", entry + "</urlset>")
    sm = re.sub(r"(<loc>https://greenwoodcreek.de/aktuelles/</loc>\s*<lastmod>)[^<]*", rf"\g<1>{a['date']}", sm)
    sm_p.write_text(sm, encoding="utf-8")
    # Upload-Signal fuer den Mac
    (ROOT/"_blog-agent"/"PENDING_DEPLOY").write_text(f"{a['date']} {slug}\n", encoding="utf-8")
    update_home()
    print("OK:", url)

def update_home():
    """Startseite: Bereich 'Aktuelles' zeigt die neuesten Artikel mit Bild,
    aufgefuellt mit den urspruenglichen Fotostrecken (max. 3 Karten)."""
    home_p = ROOT/"index.html"; s = home_p.read_text(encoding="utf-8")
    open_tag = '<div class="gwc-news-grid">'
    if open_tag not in s: fail("News-Grid auf der Startseite nicht gefunden")
    start = s.index(open_tag) + len(open_tag)
    end = s.index("</div>", s.rindex("</a>", start, s.index("</section>", start)))
    grid = s[start:end]
    static_p = ROOT/"_blog-agent"/"home-static.html"
    if not static_p.exists():
        static_p.write_text(re.sub(r"<!--gwc-home:[^>]*-->.*?<!--/gwc-home-->", "", grid, flags=re.S), encoding="utf-8")
    static_cards = re.findall(r'<a class="gwc-news-card".*?</a>', static_p.read_text(encoding="utf-8"), flags=re.S)
    log = (ROOT/"_blog-agent"/"log.md").read_text(encoding="utf-8")
    arts = []
    for f in (ROOT/"_blog-agent"/"artikel").glob("*.json"):
        a = json.load(open(f, encoding="utf-8"))
        if a.get("image"):
            pos = log.find("/aktuelles/%s/" % a["slug"])
            arts.append((a["date"], pos if pos >= 0 else 10**9, a))
    arts.sort(key=lambda t: (t[0], t[1]), reverse=True)
    esc = lambda x: html.escape(x, quote=True)
    cards = []
    for _, _, a in arts[:3]:
        cards.append(f'<!--gwc-home:{a["slug"]}--><a class="gwc-news-card" href="/aktuelles/{a["slug"]}/">'
            f'<span class="gwc-news-img"><img src="{esc(a["image"].lstrip("/"))}" alt="{esc(a.get("image_alt", a["title"]))}" '
            f'loading="lazy" decoding="async"/></span><time class="gwc-news-date" datetime="{a["date"]}">{de_date(a["date"])}</time>'
            f'<h3 class="gwc-news-name">{esc(a["title"])}</h3></a><!--/gwc-home-->')
    cards += static_cards[:max(0, 3-len(cards))]
    home_p.write_text(s[:start] + "".join(cards) + s[end:], encoding="utf-8")
    print("Startseite aktualisiert:", len(arts[:3]), "neue Artikel")

if __name__ == "__main__":
    if sys.argv[1:] == ["--home"]: update_home(); sys.exit(0)
    if len(sys.argv) != 2: fail("Pfad zur Artikel-JSON angeben")
    main(sys.argv[1])
