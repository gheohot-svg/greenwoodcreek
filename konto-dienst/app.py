#!/usr/bin/env python3
"""GREENWOODCREEK – Kundenkonto (nur Standardbibliothek, SQLite).

Ablauf: E-Mail eingeben -> 6-stelliger Code per Mail -> Passwort festlegen -> angemeldet.
Danach Anmeldung mit E-Mail + Passwort. Alternativ "Mit Google anmelden" (bestätigte
Google-Adresse ersetzt den Mail-Code). "Passwort vergessen" läuft wieder über einen Code.

Lauscht nur auf 127.0.0.1; Caddy leitet /api/konto/* hierher.
Konfiguration (Umgebung / /etc/gwc-konto.env, nur root lesbar):
    GWC_SMTP_USER, GWC_SMTP_PASS      web.de-Postfach (wie gwc-kontakt)
    GWC_GOOGLE_ID, GWC_GOOGLE_SECRET  OAuth-Client (optional; ohne bleibt der Google-Knopf aus)
    GWC_DEV=1                         Codes ins Log statt Mail (nur lokal testen)
"""
import base64, hashlib, hmac, json, os, re, secrets, smtplib, sqlite3, ssl, sys, threading, time
import urllib.parse, urllib.request
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("GWC_HOST", "127.0.0.1")
PORT = int(os.environ.get("GWC_PORT", "8789"))
DB_PATH = os.environ.get("GWC_DB", "/srv/greenwoodcreek/konto/konto.db")
SITE = os.environ.get("GWC_SITE", "https://greenwoodcreek.de")
SMTP_HOST = os.environ.get("GWC_SMTP_HOST", "smtp.web.de")
SMTP_PORT = int(os.environ.get("GWC_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("GWC_SMTP_USER", "")
SMTP_PASS = os.environ.get("GWC_SMTP_PASS", "")
FROM_NAME = os.environ.get("GWC_FROM_NAME", "GREENWOODCREEK")
GOOGLE_ID = os.environ.get("GWC_GOOGLE_ID", "")
GOOGLE_SECRET = os.environ.get("GWC_GOOGLE_SECRET", "")
DEV = os.environ.get("GWC_DEV") == "1"
SECURE_COOKIE = not DEV

CODE_TTL = 15 * 60
MAX_TRIES = 5
SESSION_DAYS = 30
SETUP_TTL = 30 * 60            # so lange darf man nach dem Code ein Passwort setzen
MAX_BODY = 4 * 1024
PW_MIN = 10
PER_IP_HOUR, PER_ADDR_HOUR, GLOBAL_DAY = 30, 3, 300   # IP-Grenze großzügig: hinter NPM sehen alle dieselbe IP

EMAIL_RE = re.compile(r"^[^@\s<>\"',;]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")
_lock = threading.Lock()
_ip, _addr, _all = {}, {}, []
_db_lock = threading.Lock()


def log(msg):
    print(msg, file=sys.stderr, flush=True)   # nie Adressen, Codes oder Passwörter loggen


# ---------- Datenbank ----------
def db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with _db_lock, db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT DEFAULT '',
            pw TEXT DEFAULT '', created INTEGER, verified INTEGER DEFAULT 0, via TEXT DEFAULT 'mail');
        CREATE TABLE IF NOT EXISTS codes(
            email TEXT PRIMARY KEY, hash TEXT, expires INTEGER, tries INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sessions(
            token TEXT PRIMARY KEY, user_id INTEGER, stage TEXT, expires INTEGER);
        CREATE TABLE IF NOT EXISTS oauth_state(state TEXT PRIMARY KEY, expires INTEGER, weiter TEXT);
        """)
    try:
        os.chmod(DB_PATH, 0o600)
    except OSError:
        pass


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()


def pw_hash(pw):
    salt = secrets.token_bytes(16)
    d = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "s1$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(d).decode()


def pw_check(pw, stored):
    try:
        _, s, d = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=base64.b64decode(s), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(d))
    except Exception:
        return False


DUMMY_HASH = pw_hash("dummy-gegen-timing")


# ---------- Rate-Limit ----------
def allowed(ip, addr):
    now = time.time()
    with _lock:
        global _all
        _all = [t for t in _all if now - t < 86400]
        li = [t for t in _ip.get(ip, []) if now - t < 3600]
        la = [t for t in _addr.get(addr, []) if now - t < 3600]
        if len(_all) >= GLOBAL_DAY or len(li) >= PER_IP_HOUR or len(la) >= PER_ADDR_HOUR:
            return False
        li.append(now); la.append(now); _all.append(now)
        _ip[ip], _addr[addr] = li, la
        return True


_login_fail = {}


def login_ok_to_try(key):
    now = time.time()
    with _lock:
        l = [t for t in _login_fail.get(key, []) if now - t < 900]
        _login_fail[key] = l
        return len(l) < 10


def login_failed(key):
    with _lock:
        _login_fail.setdefault(key, []).append(time.time())


# ---------- Mail ----------
def send_code(to, code):
    if DEV:
        log(f"DEV-CODE für {to}: {code}")
        return True
    if not (SMTP_USER and SMTP_PASS):
        log("konto: keine SMTP-Zugangsdaten – Code nicht gesendet")
        return False
    msg = EmailMessage()
    msg["Subject"] = f"Ihr Code für das GREENWOODCREEK-Kundenkonto: {code}"
    msg["From"] = formataddr((FROM_NAME, SMTP_USER))
    msg["To"] = to
    msg["Reply-To"] = SMTP_USER
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="greenwoodcreek.de")
    msg["Auto-Submitted"] = "auto-generated"
    msg.set_content(
        f"Hallo,\n\nIhr Bestätigungscode für das Kundenkonto bei GREENWOODCREEK lautet:\n\n    {code}\n\n"
        "Der Code ist 15 Minuten gültig. Geben Sie ihn auf der Seite ein, auf der Sie ihn angefordert haben.\n"
        "Wenn Sie das nicht waren, können Sie diese Mail ignorieren.\n\n"
        f"Ihr Team von GREENWOODCREEK\n{SITE}\n")
    msg.add_alternative(f"""<!doctype html><html lang="de"><body style="margin:0;background:#000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#0b0b0b;border:1px solid #262626;border-radius:20px">
<tr><td style="padding:28px 32px 8px;color:#f1ece6;font:bold 20px/1.2 'Arial Black',Arial,sans-serif;letter-spacing:1px">GREENWOODCREEK</td></tr>
<tr><td style="padding:12px 32px 4px;color:#f1ece6;font:15px/1.6 Arial,sans-serif">Ihr Bestätigungscode für das Kundenkonto:</td></tr>
<tr><td align="center" style="padding:10px 32px 18px"><span style="display:inline-block;padding:12px 26px;border:2px dashed #e4442a;border-radius:10px;color:#fff;font:bold 32px/1 'Arial Black',Arial,sans-serif;letter-spacing:8px">{code}</span></td></tr>
<tr><td style="padding:0 32px 28px;color:#9a938c;font:13px/1.6 Arial,sans-serif">Der Code ist 15 Minuten gültig. Wenn Sie das nicht waren, können Sie diese Mail ignorieren.</td></tr>
</table></td></tr></table></body></html>""", subtype="html")
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
            s.starttls(context=ssl.create_default_context())
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
        return True
    except Exception as e:
        log(f"konto: Versand fehlgeschlagen: {type(e).__name__}")
        return False


# ---------- Logik ----------
def new_session(c, user_id, stage):
    tok = secrets.token_urlsafe(32)
    ttl = SETUP_TTL if stage == "setpw" else SESSION_DAYS * 86400
    c.execute("INSERT INTO sessions VALUES(?,?,?,?)", (sha(tok), user_id, stage, int(time.time()) + ttl))
    return tok


def session_of(c, handler):
    ck = handler.headers.get("Cookie", "")
    m = re.search(r"(?:^|;\s*)gwc_konto=([\w-]+)", ck)
    if not m:
        return None
    row = c.execute("SELECT s.token, s.stage, s.expires, u.* FROM sessions s JOIN users u ON u.id=s.user_id "
                    "WHERE s.token=?", (sha(m.group(1)),)).fetchone()
    if not row or row["expires"] < time.time():
        return None
    return row


def cookie(tok, days=SESSION_DAYS):
    parts = [f"gwc_konto={tok}", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={days * 86400}"]
    if SECURE_COOKIE:
        parts.append("Secure")
    return "; ".join(parts)


def clear_cookie():
    return "gwc_konto=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + ("; Secure" if SECURE_COOKIE else "")


def safe_weiter(w):
    return w if isinstance(w, str) and re.match(r"^/[A-Za-z0-9/_\-.?=&%#]*$", w) and not w.startswith("//") else "/konto/"


def display_name(row):
    return row["name"] or row["email"].split("@")[0]


class H(BaseHTTPRequestHandler):
    server_version = "gwc-konto"
    sys_version = ""

    def log_message(self, *a):
        pass

    def ip(self):
        return self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()

    def send(self, code, obj=None, cookies=(), location=None):
        body = json.dumps(obj if obj is not None else {}).encode() if location is None else b""
        self.send_response(code)
        if location:
            self.send_header("Location", location)
        else:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for c in cookies:
            self.send_header("Set-Cookie", c)
        self.end_headers()
        self.wfile.write(body)

    def fail(self, code, msg):
        self.send(code, {"ok": False, "fehler": msg})

    def body(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > MAX_BODY:
                return None
            d = json.loads(self.rfile.read(n) or b"{}")
            return d if isinstance(d, dict) else None
        except Exception:
            return None

    def csrf_ok(self):
        if self.headers.get("X-GWC") != "1":
            return False
        o = self.headers.get("Origin")
        return o is None or o.rstrip("/") == SITE or (DEV and o.startswith("http://localhost"))

    # ----- GET -----
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p = u.path.replace("/api/konto/", "", 1).strip("/")
        q = urllib.parse.parse_qs(u.query)
        try:
            if p == "optionen":
                return self.send(200, {"ok": True, "google": bool(GOOGLE_ID and GOOGLE_SECRET)})
            if p == "ich":
                with _db_lock, db() as c:
                    s = session_of(c, self)
                if s and s["stage"] == "setpw":
                    return self.send(401, {"ok": False, "stufe": "passwort", "email": s["email"],
                                           "fehler": "Bitte noch ein Passwort festlegen."})
                if not s or s["stage"] != "full":
                    return self.fail(401, "Nicht angemeldet.")
                return self.send(200, {"ok": True, "name": display_name(s), "email": s["email"]})
            if p == "google/start":
                return self.google_start(q)
            if p == "google/callback":
                return self.google_callback(q)
            return self.fail(404, "Unbekannt.")
        except Exception as e:
            log(f"konto: Fehler GET {p}: {type(e).__name__}: {e}")
            return self.fail(500, "Interner Fehler.")

    # ----- POST -----
    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path.replace("/api/konto/", "", 1).strip("/")
        if not self.csrf_ok():
            return self.fail(403, "Anfrage abgelehnt.")
        d = self.body()
        if d is None:
            return self.fail(400, "Ungültige Anfrage.")
        try:
            fn = {"code-anfordern": self.code_anfordern, "code-pruefen": self.code_pruefen,
                  "passwort": self.passwort, "anmelden": self.anmelden, "abmelden": self.abmelden}.get(p)
            if not fn:
                return self.fail(404, "Unbekannt.")
            return fn(d)
        except Exception as e:
            log(f"konto: Fehler POST {p}: {type(e).__name__}: {e}")
            return self.fail(500, "Interner Fehler.")

    def code_anfordern(self, d):
        email = str(d.get("email", "")).strip().lower()
        if d.get("website"):                          # Honeypot
            return self.send(200, {"ok": True})
        if not EMAIL_RE.match(email):
            return self.fail(400, "Bitte eine gültige E-Mail-Adresse eingeben.")
        if not allowed(self.ip(), email):
            return self.fail(429, "Zu viele Anfragen. Bitte später erneut versuchen.")
        code = f"{secrets.randbelow(10**6):06d}"
        with _db_lock, db() as c:
            c.execute("INSERT INTO codes VALUES(?,?,?,0) ON CONFLICT(email) DO UPDATE SET "
                      "hash=excluded.hash, expires=excluded.expires, tries=0",
                      (email, sha(code + email), int(time.time()) + CODE_TTL))
        if not send_code(email, code):
            return self.fail(503, "Der E-Mail-Versand ist gerade nicht verfügbar. Bitte später erneut versuchen.")
        return self.send(200, {"ok": True})

    def code_pruefen(self, d):
        email = str(d.get("email", "")).strip().lower()
        code = re.sub(r"\D", "", str(d.get("code", "")))
        if not EMAIL_RE.match(email) or len(code) != 6:
            return self.fail(400, "Bitte den 6-stelligen Code eingeben.")
        with _db_lock, db() as c:
            row = c.execute("SELECT * FROM codes WHERE email=?", (email,)).fetchone()
            if not row or row["expires"] < time.time() or row["tries"] >= MAX_TRIES:
                return self.fail(400, "Der Code ist abgelaufen. Bitte einen neuen Code anfordern.")
            if not hmac.compare_digest(row["hash"], sha(code + email)):
                c.execute("UPDATE codes SET tries=tries+1 WHERE email=?", (email,))
                return self.fail(400, "Der Code stimmt nicht.")
            c.execute("DELETE FROM codes WHERE email=?", (email,))
            c.execute("INSERT OR IGNORE INTO users(email, created, verified, via) VALUES(?,?,1,'mail')",
                      (email, int(time.time())))
            c.execute("UPDATE users SET verified=1 WHERE email=?", (email,))
            uid = c.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
            tok = new_session(c, uid, "setpw")        # erst Passwort festlegen, dann voll angemeldet
        return self.send(200, {"ok": True, "weiter": "passwort"}, [cookie(tok, 1)])

    def passwort(self, d):
        pw = str(d.get("passwort", ""))
        if len(pw) < PW_MIN or len(pw) > 200:
            return self.fail(400, f"Das Passwort braucht mindestens {PW_MIN} Zeichen.")
        with _db_lock, db() as c:
            s = session_of(c, self)
            if not s or s["stage"] not in ("setpw", "full"):
                return self.fail(401, "Bitte zuerst den Code bestätigen.")
            if s["stage"] == "full" and not d.get("neu"):
                return self.fail(400, "Ungültige Anfrage.")
            c.execute("UPDATE users SET pw=? WHERE id=?", (pw_hash(pw), s["id"]))
            c.execute("DELETE FROM sessions WHERE user_id=?", (s["id"],))   # alte Sitzungen beenden
            tok = new_session(c, s["id"], "full")
        return self.send(200, {"ok": True, "name": display_name(s)}, [cookie(tok)])

    def anmelden(self, d):
        email = str(d.get("email", "")).strip().lower()
        pw = str(d.get("passwort", ""))
        key = self.ip() + "|" + email
        if not EMAIL_RE.match(email) or not pw:
            return self.fail(400, "Bitte E-Mail und Passwort eingeben.")
        if not login_ok_to_try(key):
            return self.fail(429, "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.")
        with _db_lock, db() as c:
            u = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            good = pw_check(pw, u["pw"] if u and u["pw"] else DUMMY_HASH) and bool(u and u["pw"])
            if not good:
                login_failed(key)
                return self.fail(401, "E-Mail oder Passwort stimmt nicht. Noch kein Passwort? Dann zuerst einen Code anfordern.")
            tok = new_session(c, u["id"], "full")
        return self.send(200, {"ok": True}, [cookie(tok)])

    def abmelden(self, d):
        with _db_lock, db() as c:
            m = re.search(r"gwc_konto=([\w-]+)", self.headers.get("Cookie", ""))
            if m:
                c.execute("DELETE FROM sessions WHERE token=?", (sha(m.group(1)),))
        return self.send(200, {"ok": True}, [clear_cookie()])

    # ----- Google -----
    def google_start(self, q):
        if not (GOOGLE_ID and GOOGLE_SECRET):
            return self.send(302, location="/konto/?google=aus")
        state = secrets.token_urlsafe(24)
        weiter = safe_weiter((q.get("weiter") or ["/konto/"])[0])
        with _db_lock, db() as c:
            c.execute("DELETE FROM oauth_state WHERE expires<?", (int(time.time()),))
            c.execute("INSERT INTO oauth_state VALUES(?,?,?)", (sha(state), int(time.time()) + 600, weiter))
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
            "client_id": GOOGLE_ID, "redirect_uri": SITE + "/api/konto/google/callback",
            "response_type": "code", "scope": "openid email profile", "state": state, "prompt": "select_account"})
        return self.send(302, location=url)

    def google_callback(self, q):
        state = (q.get("state") or [""])[0]
        code = (q.get("code") or [""])[0]
        with _db_lock, db() as c:
            row = c.execute("SELECT * FROM oauth_state WHERE state=?", (sha(state),)).fetchone()
            if row:
                c.execute("DELETE FROM oauth_state WHERE state=?", (sha(state),))
        if not row or row["expires"] < time.time() or not code:
            return self.send(302, location="/konto/?google=fehler")
        try:
            data = urllib.parse.urlencode({
                "code": code, "client_id": GOOGLE_ID, "client_secret": GOOGLE_SECRET,
                "redirect_uri": SITE + "/api/konto/google/callback", "grant_type": "authorization_code"}).encode()
            tok = json.load(urllib.request.urlopen(urllib.request.Request(
                "https://oauth2.googleapis.com/token", data=data), timeout=15))
            info = json.load(urllib.request.urlopen(urllib.request.Request(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": "Bearer " + tok["access_token"]}), timeout=15))
        except Exception as e:
            log(f"konto: Google-Austausch fehlgeschlagen: {type(e).__name__}")
            return self.send(302, location="/konto/?google=fehler")
        email = str(info.get("email", "")).strip().lower()
        if not EMAIL_RE.match(email) or info.get("email_verified") is not True:
            return self.send(302, location="/konto/?google=fehler")
        with _db_lock, db() as c:
            c.execute("INSERT OR IGNORE INTO users(email, name, created, verified, via) VALUES(?,?,?,1,'google')",
                      (email, str(info.get("name", ""))[:80], int(time.time())))
            u = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if not u["name"] and info.get("name"):
                c.execute("UPDATE users SET name=? WHERE id=?", (str(info["name"])[:80], u["id"]))
            stage = "full" if u["pw"] else "setpw"      # Google ersetzt den Mail-Code
            t = new_session(c, u["id"], stage)
        dest = row["weiter"] if stage == "full" else "/konto/?weiter=" + urllib.parse.quote(row["weiter"])
        return self.send(302, cookies=[cookie(t, 1 if stage == "setpw" else SESSION_DAYS)], location=dest)


def main():
    init_db()
    srv = ThreadingHTTPServer((HOST, PORT), H)
    log(f"gwc-konto läuft auf {HOST}:{PORT} (Google: {'an' if GOOGLE_ID else 'aus'}, SMTP: {'an' if SMTP_USER else 'aus'})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
