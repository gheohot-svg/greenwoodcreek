#!/usr/bin/env python3
"""Baut den Suchindex fuer die Blog-Suche auf /aktuelles/ (Pagefind).
Aufruf aus beliebigem Ordner: python3 _blog-agent/suchindex.py
Wird von build.py nach jedem Artikel automatisch aufgerufen.

Indexiert werden nur Seiten mit data-pagefind-body, also die Blogartikel
unter /aktuelles/<slug>/. Ergebnis: Ordner /pagefind/ in der Repo-Wurzel,
der mit committet und vom Server wie jede andere Datei ausgeliefert wird.

Pagefind einmalig installieren:  pip3 install "pagefind[bin]"
(ohne Python-Paket wird ersatzweise "npx pagefind" versucht)."""
import pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "pagefind"
ARGS = ["--site", str(ROOT), "--glob", "aktuelles/*/index.html",
        "--output-path", str(OUT), "--force-language", "de"]

def kandidaten():
    try:
        import pagefind  # noqa: F401  (pip-Paket "pagefind[bin]")
        yield [sys.executable, "-m", "pagefind"]
    except ImportError:
        pass
    if shutil.which("pagefind"):
        yield ["pagefind"]
    if shutil.which("npx"):
        yield ["npx", "-y", "pagefind@1.6.0"]

def main():
    for cmd in kandidaten():
        # Alten Index entfernen, damit keine verwaisten Dateien liegen bleiben
        if OUT.exists():
            shutil.rmtree(OUT)
        r = subprocess.run(cmd + ARGS, cwd=ROOT, capture_output=True, text=True)
        if r.returncode == 0:
            seiten = next((l for l in r.stdout.splitlines() if l.strip().startswith("Indexed") and "pages" in l), "").strip()
            print("Suchindex aktualisiert:", seiten or "OK")
            return 0
        print("Pagefind-Fehler:", (r.stderr or r.stdout).strip()[-500:])
    print('WARNUNG: Suchindex NICHT aktualisiert. Pagefind fehlt: pip3 install "pagefind[bin]"')
    return 2

if __name__ == "__main__":
    sys.exit(main())
