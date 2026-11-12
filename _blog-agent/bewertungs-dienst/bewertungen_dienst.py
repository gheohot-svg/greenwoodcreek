#!/usr/bin/env python3
"""GREENWOODCREEK Bewertungs-Dienst.

Nimmt Bewertungen von der Website entgegen (POST /api/bewertung, JSON) und
veroeffentlicht sie sofort in der Live-Datei, die die Seite anzeigt.
Nur Python-Standardbibliothek. Lauscht nur auf 127.0.0.1 (Webserver leitet /api/ weiter).

Automatik:
- Normale Bewertungen erscheinen sofort.
- Verdaechtige (Links, HTML, Doppelte) werden NICHT veroeffentlicht, sondern
  in PENDING_FILE abgelegt (ausserhalb des Webroots).
- Rate-Limit pro Absender (nur im Arbeitsspeicher, IPs werden nie gespeichert).
"""
import json, os, re, sys, tempfile, threading, time
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("GWC_BW_PORT", "8081"))
LIVE_FILE = os.environ.get("GWC_BW_LIVE", "/srv/greenwoodcreek/www/assets/data/live/bewertungen.json")
PENDING_FILE = os.environ.get("GWC_BW_PENDING", os.path.expanduser("~/gwc-bewertungen-pending.json"))
MAX_PER_IP_HOUR = 3
MAX_PER_DAY = 40

lock = threading.Lock()
hits = {}          # ip -> [timestamps]
day_counter = {"d": date.today(), "n": 0}

SUSPICIOUS = re.compile(r"(https?://|www\.|<|>|\[url|@\w+\.\w{2,}|\.(com|de|net|org|ru|xyz)\b)", re.I)
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_atomic(path, data, mode=0o644):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def clean(s, limit):
    s = CTRL.sub("", str(s or "")).strip()
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s[:limit]


def rate_ok(ip):
    now = time.time()
    with lock:
        if day_counter["d"] != date.today():
            day_counter["d"], day_counter["n"] = date.today(), 0
        if day_counter["n"] >= MAX_PER_DAY:
            return False
        recent = [t for t in hits.get(ip, []) if now - t < 3600]
        if len(recent) >= MAX_PER_IP_HOUR:
            hits[ip] = recent
            return False
        recent.append(now)
        hits[ip] = recent
        day_counter["n"] += 1
        return True


class Handler(BaseHTTPRequestHandler):
    server_version = "gwc-bw"

    def log_message(self, fmt, *args):   # keine IPs ins Log
        sys.stderr.write("%s %s\n" % (time.strftime("%F %T"), fmt % args[:0] if False else self.requestline.split(" ")[0] + " " + self.path))

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/bewertung":
            return self._json(404, {"ok": False})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n <= 0 or n > 10000:
                return self._json(413, {"ok": False})
            d = json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {"ok": False})

        if d.get("website"):                       # Honeypot: stillschweigend "ok"
            return self._json(200, {"ok": True, "status": "veroeffentlicht"})

        ip = (self.headers.get("X-Real-IP") or self.client_address[0])
        if not rate_ok(ip):
            return self._json(429, {"ok": False, "fehler": "Zu viele Bewertungen. Bitte später erneut versuchen."})

        name = clean(d.get("name"), 80)
        text = clean(d.get("text"), 1500)
        try:
            sterne = int(d.get("sterne"))
        except (TypeError, ValueError):
            sterne = 0
        if not (1 <= sterne <= 5) or not name or len(text) < 10 or d.get("einwilligung") is not True:
            return self._json(400, {"ok": False, "fehler": "Bitte alle Felder ausfüllen und der Veröffentlichung zustimmen."})

        eintrag = {"name": name, "sterne": sterne, "text": text, "datum": date.today().isoformat()}
        with lock:
            live = load(LIVE_FILE, {"bewertungen": []})
            items = live.setdefault("bewertungen", [])
            if any(i.get("text") == text and i.get("name") == name for i in items):
                return self._json(200, {"ok": True, "status": "veroeffentlicht"})
            if SUSPICIOUS.search(name) or SUSPICIOUS.search(text):
                pend = load(PENDING_FILE, [])
                pend.append(eintrag)
                save_atomic(PENDING_FILE, pend, 0o600)
                return self._json(200, {"ok": True, "status": "geprueft"})
            items.append(eintrag)
            save_atomic(LIVE_FILE, live)
        return self._json(200, {"ok": True, "status": "veroeffentlicht"})

    def do_GET(self):
        self._json(200, {"ok": True}) if self.path == "/api/health" else self._json(404, {"ok": False})


if __name__ == "__main__":
    if not os.path.exists(LIVE_FILE):
        save_atomic(LIVE_FILE, {"bewertungen": []})
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
