#!/usr/bin/env python3
"""Schaltet den nächsten vorbereiteten Artikel aus _blog-agent/vorrat/ frei."""
import json, sys, shutil, subprocess, datetime, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
V = HERE / "vorrat"

def main():
    jsons = sorted(V.glob("*.json"))
    if not jsons:
        print("VORRAT LEER"); sys.exit(3)
    # Optional: bestimmten Artikel freischalten (Teil des Dateinamens, z. B. "gruppenfoto")
    if len(sys.argv) > 1:
        wanted = [j for j in jsons if sys.argv[1] in j.name]
        if not wanted:
            print(f"FEHLER: kein Vorrat-Artikel passt zu '{sys.argv[1]}'"); sys.exit(1)
        jp = wanted[0]
    else:
        jp = jsons[0]
    a = json.load(open(jp, encoding="utf-8"))
    slug = a["slug"]
    img = jp.with_suffix(".webp")
    if not img.exists():
        print(f"FEHLER: Bild fehlt: {img.name}"); sys.exit(1)
    today = datetime.date.today().isoformat()
    a["date"] = today
    a["image"] = f"/assets/images/blog/artikel/{slug}.webp"
    foto = a.pop("foto", "Website-Bild")
    dest = ROOT / "assets/images/blog/artikel" / f"{slug}.webp"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(img, dest)
    out = HERE / "artikel" / f"{slug}.json"
    json.dump(a, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    r = subprocess.run([sys.executable, str(HERE / "build.py"), str(out)], cwd=ROOT)
    if r.returncode != 0:
        print("FEHLER: build.py"); sys.exit(1)
    # themen.md: passende offene Zeile abhaken oder neue anhängen
    tp = HERE / "themen.md"
    t = tp.read_text(encoding="utf-8")
    line = f"- [x] {today} /aktuelles/{slug}/ {a['title']} (aus Foto)\n"
    t = t.rstrip("\n") + "\n" + line
    tp.write_text(t, encoding="utf-8")
    kw = (a.get("keywords") or [""])[0]
    with open(HERE / "log.md", "a", encoding="utf-8") as f:
        f.write(f"- {today}: /aktuelles/{slug}/ aus dem Vorrat veröffentlicht (Hauptkeyword: {kw}, Foto: {foto})\n")
    with open(HERE / "bilder.md", "a", encoding="utf-8") as f:
        f.write(f"- {today} {foto} -> /aktuelles/{slug}/\n")
    (V / "veroeffentlicht").mkdir(exist_ok=True)
    shutil.move(str(jp), V / "veroeffentlicht" / jp.name)
    img.unlink()
    print(f"OK {slug} {today} | Vorrat übrig: {len(jsons)-1}")
    print(f"Foto: {foto}")

main()
