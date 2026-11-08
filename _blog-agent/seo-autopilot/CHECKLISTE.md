# SEO-Autopilot – Prüfungen, die nicht im Skript stecken

Diese Punkte erledigt der Autopilot per Websuche bzw. du mit wenigen Klicks. Das Skript `seo_check.py` deckt alles Technische ab.

## 1. Keywords & Wettbewerb (täglich, wechselnd 3–5 Begriffe)

Kernkeywords – der Autopilot sucht reihum und notiert: wer steht oben, welche Seitentypen/Inhalte fehlen uns?

| Keyword | Unsere Zielseite |
|---|---|
| Hochzeitsfotograf München | /hochzeitsfotograf-muenchen/ |
| Hochzeitsvideograf München | /hochzeitsfotograf-muenchen/ |
| Imagefilm München | /imagefilm-muenchen/ |
| Imagefilm Kosten | /aktuelles/imagefilm-kosten/ |
| Eventfotograf München | /eventfotograf-muenchen/ |
| Porträtfotograf München | /portraitfotograf-muenchen/ |
| Fotograf Heidelberg | /fotograf-heidelberg/ |
| Videograf Heidelberg / Mannheim | /fotograf-heidelberg/ |
| Webdesign München Fotograf | /webdesign-muenchen/ |
| Social Media Betreuung München | /social-media-betreuung-muenchen/ |
| Produktfotografie München | /produktfotografie-muenchen/ |

## 2. Lokale Signale & Branchenverzeichnisse (monatlich)

Firmendaten müssen überall gleich sein: **GREENWOODCREEK Foto- und Videoproduktion · Albert-Schweitzer-Straße 56 · 81735 München · +49 151 55828308 · https://greenwoodcreek.de/**

- [ ] Google-Unternehmensprofil (bestätigt? Daten identisch?)
- [ ] Bing Places
- [ ] Apple Maps (Apple Business Connect)
- [ ] Gelbe Seiten
- [ ] Das Örtliche
- [ ] 11880.com
- [ ] Yelp
- [ ] ProvenExpert (Bewertungen sammeln)
- [ ] Instagram-/YouTube-Profil verlinkt auf die Website

Der Autopilot sucht per Websuche nach „GREENWOODCREEK München“ und meldet Einträge mit abweichenden Daten.

## 3. Google Search Console (wöchentlich, Export von dir)

Wenn der Autopilot danach fragt, bitte herunterladen und in den Chat ziehen:

1. **Leistung → Suchergebnisse**, Zeitraum „Letzte 28 Tage“, oben rechts **Exportieren → CSV** (enthält Suchanfragen, Seiten, Länder, Geräte).
2. **Indexierung → Seiten**, **Exportieren → CSV**.

Daraus wertet er aus: Keywords auf Position 5–20 („fast Seite 1“), Seiten mit vielen Impressionen und wenig Klicks (Title/Description verbessern), nicht indexierte Seiten.

## 4. Bing Webmaster Tools (einmalig)

- [ ] Unter bing.com/webmasters mit dem Google-Konto anmelden → „Aus Google Search Console importieren“. Dauert 5 Minuten, bringt Bing, DuckDuckGo und ChatGPT-Suche.

## 5. Matomo (nach Installation, wöchentlich)

Das Skript liest die Besucherzahlen automatisch, wenn diese Werte gesetzt sind:

```bash
export MATOMO_URL="https://analytics.greenwoodcreek.de"   # Adresse deiner Matomo-Installation
export MATOMO_TOKEN="..."                                  # Matomo → Persönlich → Sicherheit → Auth-Token
export MATOMO_SITE=1
```

Danach im Bericht auswerten: Einstiegsseiten, Absprungrate, Formular-Conversions (Ziele: Kontaktformular, Telefon, E-Mail).
