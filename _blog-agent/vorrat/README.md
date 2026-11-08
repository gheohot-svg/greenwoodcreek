# Vorrat (vorbereitete Artikel)

Hier liegen fertig geschriebene Artikel, die noch NICHT online sind. `_blog-agent/` wird vom Server nicht ausgeliefert.

Je Artikel zwei Dateien mit gleichem Namen und laufender Nummer vorne, z. B.:
- `01-thema-slug.json`  (Format wie `artikel/*.json`; `date` wird beim Freischalten auf heute gesetzt; optional `"foto": "Dateiname.jpg"`)
- `01-thema-slug.webp`  (fertig verkleinert, ohne Metadaten)

Freischalten (immer der Artikel mit der kleinsten Nummer):
    python3 _blog-agent/publish_next.py

Das Skript setzt das Datum, kopiert das Bild nach `assets/images/blog/artikel/<slug>.webp`, trägt `image` ein,
baut den Artikel mit `build.py`, hakt das Thema in `themen.md` ab und ergänzt `log.md` und `bilder.md`.
Danach committen und auf main pushen.
