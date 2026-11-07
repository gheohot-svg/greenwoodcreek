# Blog-Agent GREENWOODCREEK – Arbeitsanweisung

Zweimal pro Woche (Montag und Donnerstag) entsteht ein Ratgeber-Artikel für greenwoodcreek.de/aktuelles/. Ziel: mehr Besucher über Google aus München, Heidelberg/Rhein-Neckar, Mannheim/Stuttgart und deutschlandweit, die später Fotos, Filme, Social Media oder Websites buchen.

## Wer wir sind (nur diese Fakten verwenden)
- GREENWOODCREEK Foto- und Videoproduktion, Jan Neumeyer, Sitz München, oft auch in Heidelberg.
- Leistungen: Imagefilme, Hochzeitsfotografie, Produktfotos, Eventfotografie, Porträts, Social-Media-Betreuung, Webdesign.
- Referenzen: Für die Künstler Magic Hoffmann und JUST US produzieren wir Videos und betreuen den kompletten Social-Media-Auftritt.
- Blog-Galerien vorhanden: Wiesn 2026, Zamanda Festival, Geburtstag am Flaucher, Lateinamerikanisches Wochenende.
- Keine Preise, Kundennamen, Auszeichnungen, Teamgrößen oder Zahlen erfinden. Fehlt eine Angabe, weglassen.

## Ablauf (drei Agenten)
1. **Recherche-Agent**: nächstes offenes Thema aus `themen.md` nehmen (oberstes `[ ]`). Per Websuche prüfen: Welche Fragen stellen Leute dazu, was ranken die Top-Ergebnisse, welche aktuellen Fakten (Orte, Regeln, Saison) gehören rein. Ergebnis: Hauptkeyword, 3 bis 5 Nebenkeywords, Gliederung, 3 bis 4 FAQ-Fragen, Quellen.
2. **Schreib-Agent**: Artikel als JSON nach `artikel/<slug>.json` schreiben (Format unten). 900 bis 1400 Wörter, Sie-Form, Deutsch. Konkreter Mehrwert: Tipps, Checklisten, Orte, Abläufe aus Sicht eines Fotografen/Filmemachers. Hauptkeyword in Titel, erstem Absatz und einer H2.
3. **Lektor-Agent**: Skill `stop-slop` anwenden (keine Füllfloskeln, keine Dreierketten, kein „nicht X, sondern Y", keine Gedankenstriche, kein zitatfertiger Schlusssatz). Dann SEO-Check: meta_title max. 60 Zeichen, meta_description 120 bis 155 Zeichen, genau eine H1 (macht das Template), H2/H3 logisch, 2 bis 4 interne Links (Liste unten), keine erfundenen Fakten. Fehler direkt im JSON korrigieren.

Danach: `python3 _blog-agent/build.py _blog-agent/artikel/<slug>.json` ausführen. Bei FEHLER korrigieren und neu bauen. Erfolgreich, dann in `themen.md` das Thema auf `[x] <Datum> /aktuelles/<slug>/` setzen und eine Zeile in `log.md` ergänzen. Dann alle geänderten Dateien committen und nach GitHub (gheohot-svg/greenwoodcreek, Branch main) pushen. Der Server holt neue Commits alle 15 Minuten ab und kopiert nur die geänderten Dateien live. Die Datei `PENDING_DEPLOY` ist nur noch für den alten Mac-Upload da und kann ignoriert werden.

## Interne Links (relativ, mit Schrägstrich am Ende)
/hochzeitsfotograf-muenchen/ · /imagefilm-muenchen/ · /eventfotograf-muenchen/ · /portraitfotograf-muenchen/ · /fotograf-heidelberg/ · /social-media-betreuung-muenchen/ · /webdesign-muenchen/ · /portfolio/ · /leistungen/#kontakt · frühere Artikel unter /aktuelles/<slug>/

Die Artikel dürfen die Leistungsseiten nicht kopieren. Ratgeber beantworten Fragen, die Leistungsseiten verkaufen. Ein Artikel mit Keyword „Hochzeitsfotograf München" wäre Konkurrenz zur eigenen Seite, deshalb Ratgeber-Keywords wählen („Hochzeit Fotolocations München", „Was kostet ein Imagefilm" usw.).

## JSON-Format
{
  "title": "H1 und Überschrift, max. 70 Zeichen",
  "slug": "kleinbuchstaben-mit-bindestrich",
  "date": "YYYY-MM-DD (Tag des Laufs)",
  "category": "Hochzeit | Imagefilm | Produktfotografie | Events | Social Media | Webdesign",
  "meta_title": "max. 60 Zeichen, endet mit | GREENWOODCREEK wenn Platz",
  "meta_description": "120 bis 155 Zeichen",
  "keywords": ["hauptkeyword", "nebenkeyword"],
  "lead": "1 bis 2 Sätze Einleitung, enthält Hauptkeyword",
  "image": "optional: vorhandenes Bild unter /assets/images/..., nur echte Dateien",
  "image_alt": "Beschreibung des Bildes",
  "body_html": "<p>…</p><h2>…</h2>… nur p, h2, h3, ul, ol, li, a, strong",
  "faq": [{"q": "Frage?", "a": "Antwort in 1 bis 3 Sätzen."}]
}
