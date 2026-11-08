# SEO-Autopilot – Kurzanleitung

**Prüfung starten** (Terminal auf dem Mac):

```bash
python3 ~/greenwoodcreek-www/_blog-agent/seo-autopilot/seo_check.py
```

Der Bericht landet in `~/greenwoodcreek-www/_blog-agent/seo-autopilot/berichte/<Datum>.md`.

Optionen: `--ohne-live` (nur lokale Dateien), `--ohne-pagespeed` (schneller). Für PageSpeed ohne Kontingentgrenze: `PAGESPEED_KEY=<Google-API-Schlüssel>` voranstellen.

**Was das Skript prüft**

- Indexierung & Technik: robots.txt, Sitemap (vollständig, alle URLs Status 200), noindex/X-Robots-Tag, Canonicals, Weiterleitungen http/www → https://greenwoodcreek.de, echte 404-Fehlerseite
- Inhalte: Title- und Description-Länge, Dubletten, genau eine H1, Alt-Texte
- Strukturierte Daten: JSON-LD gültig, Firmendaten (Name, Adresse, Telefon) überall gleich
- Interne Links: kaputte Links, verwaiste Seiten ohne interne Verlinkung
- Blog-Kontrolle: jeder Artikel verlinkt eine Leistungsseite, mögliche Keyword-Kannibalisierung
- Ladezeit: PageSpeed mobil (Startseite + Eventfotografie), verwendete Bilder > 500 KB, Videos > 10 MB
- Analyse: Matomo eingebunden? Mit Zugangsdaten auch Besucherzahlen der letzten 7 Tage

Alles, was nur per Websuche oder mit deinen Exporten geht (Wettbewerb, Branchenverzeichnisse, Search Console, Bing), steht in `CHECKLISTE.md`.

Der Ordner wird von `deploy.sh` **nicht** hochgeladen.
