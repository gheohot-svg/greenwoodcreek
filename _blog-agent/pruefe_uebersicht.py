#!/usr/bin/env python3
"""Bricht ab (Exit 1), wenn ein Artikel aus der Sitemap auf /aktuelles/ nicht verlinkt ist.
Aufruf aus der Repo-Wurzel: python3 _blog-agent/pruefe_uebersicht.py
Hintergrund: Ein Nicht-Blog-Commit hat am 23.11.2026 aktuelles/index.html mit einem alten Stand ueberschrieben."""
import re, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
sitemap = (root/"sitemap.xml").read_text(encoding="utf-8")
slugs = set(re.findall(r"<loc>https://greenwoodcreek\.de/aktuelles/([a-z0-9-]+)/</loc>", sitemap))
uebersicht = (root/"aktuelles"/"index.html").read_text(encoding="utf-8")
fehlen = sorted(s for s in slugs if f'href="/aktuelles/{s}/"' not in uebersicht)
if fehlen:
    print("STOPP: Auf /aktuelles/ fehlen Teaser fuer:", *fehlen, sep="\n  ")
    sys.exit(1)
print(f"OK: alle {len(slugs)} Artikel sind auf /aktuelles/ verlinkt.")
