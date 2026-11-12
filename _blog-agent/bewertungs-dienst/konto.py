"""Kundenkonto fuer greenwoodcreek.de (nur Standardbibliothek).

- Passwoerter: scrypt mit Salt, nie im Klartext gespeichert.
- Sitzung: zufaelliges Token im HttpOnly/Secure/SameSite-Cookie, in der DB nur als SHA-256-Hash.
- E-Mail-Bestaetigung und Passwort-Reset per Mail, sobald SMTP konfiguriert ist
  (Umgebungsvariablen GWC_SMTP_HOST, _PORT, _USER, _PASS, _FROM). Ohne SMTP sind neue Konten sofort aktiv.
- Datenbank liegt ausserhalb des Webroots (GWC_DB, Standard ~/gwc-konten.sqlite3, Rechte 600).
- IP-Adressen werden nur fuer das Rate-Limit im Arbeitsspeicher gehalten.
"""
import base64, hashlib, hmac, json, os, re, secrets, smtplib, sqlite3, threading, time
import urllib.parse, urllib.request
from email.message import EmailMessage

DB_PATH = os.environ.get("GWC_DB", os.path.expanduser("~/gwc-konten.sqlite3"))
BASE_URL = os.environ.get("GWC_BASE_URL", "https://greenwoodcreek.de")
SMTP_HOST = os.environ.get("GWC_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("GWC_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("GWC_SMTP_USER", "")
SMTP_PASS = os.environ.get("GWC_SMTP_PASS", "")
SMTP_FROM = os.environ.get("GWC_SMTP_FROM", "")
SMTP_TLS = os.environ.get("GWC_SMTP_TLS", "1") != "0"
GOOGLE_ID = os.environ.get("GWC_GOOGLE_CLIENT_ID", "")
GOOGLE_SECRET = os.environ.get("GWC_GOOGLE_CLIENT_SECRET", "")
GOOGLE_AUTH_URL = os.environ.get("GWC_GOOGLE_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth")
GOOGLE_TOKEN_URL = os.environ.get("GWC_GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token")
SESSION_DAYS = 30
COOKIE = "gwc_session"
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$")

_lock = threading.Lock()
_limits = {}


def google_enabled():
    return bool(GOOGLE_ID and GOOGLE_SECRET)


def smtp_enabled():
    return bool(SMTP_HOST and SMTP_FROM)


def _db():
    new = not os.path.exists(DB_PATH)
    con = sqlite3.connect(DB_PATH)
    if new:
        os.chmod(DB_PATH, 0o600)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _lock, _db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users(
          id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          pw TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(
          h TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS tokens(
          h TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);
        """)
        cols = {r[1] for r in con.execute("PRAGMA table_info(users)")}
        for name, ddl in (("google_sub", "TEXT"), ("newsletter", "INTEGER NOT NULL DEFAULT 0"),
                          ("newsletter_seit", "TEXT"), ("abmelde_token", "TEXT")):
            if name not in cols:
                con.execute("ALTER TABLE users ADD COLUMN %s %s" % (name, ddl))
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_google ON users(google_sub)")


def _h(t):
    return hashlib.sha256(t.encode()).hexdigest()


def hash_pw(pw):
    salt = secrets.token_bytes(16)
    d = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "scrypt$%s$%s" % (salt.hex(), d.hex())


def verify_pw(pw, stored):
    try:
        _, salt, d = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc.hex(), d)
    except (ValueError, TypeError):
        return False


_DUMMY = None


def _dummy_verify(pw):
    global _DUMMY
    if _DUMMY is None:
        _DUMMY = hash_pw("dummy")
    verify_pw(pw, _DUMMY)


def limited(key, n, window):
    """True, wenn das Limit ueberschritten ist."""
    now = time.time()
    with _lock:
        recent = [t for t in _limits.get(key, []) if now - t < window]
        if len(recent) >= n:
            _limits[key] = recent
            return True
        recent.append(now)
        _limits[key] = recent
        return False


def _send(to, subject, body):
    if not smtp_enabled():
        return
    def run():
        try:
            m = EmailMessage()
            m["From"], m["To"], m["Subject"] = SMTP_FROM, to, subject
            m.set_content(body)
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                if SMTP_TLS:
                    s.starttls()
                if SMTP_USER:
                    s.login(SMTP_USER, SMTP_PASS)
                s.send_message(m)
        except Exception as e:          # Mail ist best effort
            print("Mailfehler:", type(e).__name__)
    threading.Thread(target=run, daemon=True).start()


def _new_token(con, user_id, kind, hours):
    t = secrets.token_urlsafe(32)
    con.execute("INSERT INTO tokens VALUES(?,?,?,?)", (_h(t), user_id, kind, int(time.time() + hours * 3600)))
    return t


def _cookie(token, max_age):
    return "%s=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Lax" % (COOKIE, token, max_age)


def user_from_token(token):
    if not token:
        return None
    with _lock, _db() as con:
        r = con.execute("SELECT u.id,u.name,u.email,u.newsletter FROM sessions s JOIN users u ON u.id=s.user_id "
                        "WHERE s.h=? AND s.expires>?", (_h(token), int(time.time()))).fetchone()
        return dict(r) if r else None


def _pw_ok(pw):
    return isinstance(pw, str) and 10 <= len(pw) <= 200


def handle(path, data, ip, token):
    """-> (status, objekt, set_cookie_oder_None)"""
    p = path.rstrip("/")
    if p.endswith("/ich"):
        u = user_from_token(token)
        return (200, {"ok": True, "name": u["name"], "email": u["email"], "newsletter": bool(u["newsletter"])}, None) if u else (401, {"ok": False}, None)

    if p.endswith("/optionen"):
        return 200, {"ok": True, "google": google_enabled()}, None

    if p.endswith("/registrieren"):
        if limited("reg:" + ip, 5, 3600):
            return 429, {"ok": False, "fehler": "Zu viele Versuche. Bitte später erneut versuchen."}, None
        email = str(data.get("email", "")).strip().lower()
        name = re.sub(r"\s+", " ", str(data.get("name", ""))).strip()[:80]
        pw = data.get("passwort")
        if not EMAIL_RE.match(email) or len(email) > 254 or not name:
            return 400, {"ok": False, "fehler": "Bitte Name und eine gültige E-Mail-Adresse angeben."}, None
        if not _pw_ok(pw):
            return 400, {"ok": False, "fehler": "Das Passwort muss mindestens 10 Zeichen lang sein."}, None
        if data.get("einwilligung") is not True:
            return 400, {"ok": False, "fehler": "Bitte stimmen Sie der Datenschutzerklärung zu."}, None
        verified = 0 if smtp_enabled() else 1
        with _lock, _db() as con:
            if con.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                return 409, {"ok": False, "fehler": "Diese E-Mail-Adresse ist bereits registriert."}, None
            news = 1 if data.get("newsletter") is True else 0
            cur = con.execute("INSERT INTO users(email,name,pw,verified,created,newsletter,newsletter_seit,abmelde_token) "
                              "VALUES(?,?,?,?,date('now'),?,?,?)",
                              (email, name, hash_pw(pw), verified, news, time.strftime("%Y-%m-%d %H:%M:%S") if news else None,
                               secrets.token_urlsafe(24)))
            if not verified:
                t = _new_token(con, cur.lastrowid, "verify", 48)
                _send(email, "Bitte bestätigen Sie Ihr Kundenkonto bei GREENWOODCREEK",
                      "Hallo %s,\n\nbitte bestätigen Sie Ihre E-Mail-Adresse:\n%s/konto/?bestaetigen=%s\n\n"
                      "Der Link ist 48 Stunden gültig. Wenn Sie kein Konto angelegt haben, ignorieren Sie diese Mail.\n\n"
                      "GREENWOODCREEK" % (name, BASE_URL, t))
        return 200, {"ok": True, "status": "aktiv" if verified else "bestaetigen"}, None

    if p.endswith("/bestaetigen"):
        t = str(data.get("token", ""))
        with _lock, _db() as con:
            r = con.execute("SELECT user_id FROM tokens WHERE h=? AND kind='verify' AND expires>?",
                            (_h(t), int(time.time()))).fetchone()
            if not r:
                return 400, {"ok": False, "fehler": "Der Link ist ungültig oder abgelaufen."}, None
            con.execute("UPDATE users SET verified=1 WHERE id=?", (r["user_id"],))
            con.execute("DELETE FROM tokens WHERE h=?", (_h(t),))
        return 200, {"ok": True}, None

    if p.endswith("/anmelden"):
        email = str(data.get("email", "")).strip().lower()
        pw = str(data.get("passwort", ""))[:200]
        if limited("login-ip:" + ip, 15, 600) or limited("login:" + email, 6, 600):
            return 429, {"ok": False, "fehler": "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen."}, None
        with _lock, _db() as con:
            u = con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not u:
            _dummy_verify(pw)
            return 401, {"ok": False, "fehler": "E-Mail-Adresse oder Passwort ist falsch."}, None
        if not verify_pw(pw, u["pw"]):
            return 401, {"ok": False, "fehler": "E-Mail-Adresse oder Passwort ist falsch."}, None
        if not u["verified"]:
            return 403, {"ok": False, "fehler": "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse (Link in der Mail)."}, None
        t = secrets.token_urlsafe(32)
        with _lock, _db() as con:
            con.execute("DELETE FROM sessions WHERE expires<?", (int(time.time()),))
            con.execute("INSERT INTO sessions VALUES(?,?,?)", (_h(t), u["id"], int(time.time() + SESSION_DAYS * 86400)))
        return 200, {"ok": True, "name": u["name"]}, _cookie(t, SESSION_DAYS * 86400)

    if p.endswith("/abmelden"):
        if token:
            with _lock, _db() as con:
                con.execute("DELETE FROM sessions WHERE h=?", (_h(token),))
        return 200, {"ok": True}, _cookie("", 0)

    if p.endswith("/loeschen"):
        u = user_from_token(token)
        if not u:
            return 401, {"ok": False}, None
        with _lock, _db() as con:
            row = con.execute("SELECT pw FROM users WHERE id=?", (u["id"],)).fetchone()
        if not row or not verify_pw(str(data.get("passwort", ""))[:200], row["pw"]):
            return 403, {"ok": False, "fehler": "Das Passwort stimmt nicht."}, None
        with _lock, _db() as con:
            for tbl in ("sessions", "tokens"):
                con.execute("DELETE FROM %s WHERE user_id=?" % tbl, (u["id"],))
            con.execute("DELETE FROM users WHERE id=?", (u["id"],))
        return 200, {"ok": True}, _cookie("", 0)

    if p.endswith("/passwort-vergessen"):
        email = str(data.get("email", "")).strip().lower()
        if limited("forgot-ip:" + ip, 5, 3600) or limited("forgot:" + email, 3, 3600):
            return 429, {"ok": False, "fehler": "Zu viele Versuche. Bitte später erneut versuchen."}, None
        with _lock, _db() as con:
            u = con.execute("SELECT id,name FROM users WHERE email=?", (email,)).fetchone()
            if u:
                t = _new_token(con, u["id"], "reset", 2)
                _send(email, "Passwort zurücksetzen bei GREENWOODCREEK",
                      "Hallo %s,\n\nmit diesem Link legen Sie ein neues Passwort fest (2 Stunden gültig):\n"
                      "%s/konto/?zuruecksetzen=%s\n\nWenn Sie das nicht angefordert haben, ignorieren Sie diese Mail.\n\n"
                      "GREENWOODCREEK" % (u["name"], BASE_URL, t))
        return 200, {"ok": True}, None          # immer gleiche Antwort

    if p.endswith("/passwort-neu"):
        t, pw = str(data.get("token", "")), data.get("passwort")
        if not _pw_ok(pw):
            return 400, {"ok": False, "fehler": "Das Passwort muss mindestens 10 Zeichen lang sein."}, None
        with _lock, _db() as con:
            r = con.execute("SELECT user_id FROM tokens WHERE h=? AND kind='reset' AND expires>?",
                            (_h(t), int(time.time()))).fetchone()
            if not r:
                return 400, {"ok": False, "fehler": "Der Link ist ungültig oder abgelaufen."}, None
            con.execute("UPDATE users SET pw=?, verified=1 WHERE id=?", (hash_pw(pw), r["user_id"]))
            con.execute("DELETE FROM sessions WHERE user_id=?", (r["user_id"],))
            con.execute("DELETE FROM tokens WHERE user_id=?", (r["user_id"],))
        return 200, {"ok": True}, None

    if p.endswith("/newsletter"):
        u = user_from_token(token)
        if not u:
            return 401, {"ok": False}, None
        an = 1 if data.get("an") is True else 0
        with _lock, _db() as con:
            con.execute("UPDATE users SET newsletter=?, newsletter_seit=? WHERE id=?",
                        (an, time.strftime("%Y-%m-%d %H:%M:%S") if an else None, u["id"]))
        return 200, {"ok": True, "newsletter": bool(an)}, None

    if p.endswith("/newsletter-abbestellen"):
        t = str(data.get("token", ""))[:100]
        with _lock, _db() as con:
            cur = con.execute("UPDATE users SET newsletter=0, newsletter_seit=NULL WHERE abmelde_token=? AND ?!=''", (t, t))
        return (200, {"ok": True}, None) if cur.rowcount else (400, {"ok": False, "fehler": "Der Abmelde-Link ist ungültig."}, None)

    return 404, {"ok": False}, None


# ---------------------------------------------------------------- Google-Anmeldung (OpenID Connect, Code-Flow mit PKCE)
_oauth = {}
OAUTH_COOKIE = "gwc_oauth"


def _redirect_uri():
    return BASE_URL + "/api/konto/google/callback"


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def google_start():
    """-> (302, Ziel-URL, [Cookies])"""
    if not google_enabled():
        return 302, "/konto/?fehler=google", []
    state, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    now = time.time()
    with _lock:
        for k in [k for k, v in _oauth.items() if v[1] < now]:
            del _oauth[k]
        _oauth[state] = (verifier, now + 600)
    q = urllib.parse.urlencode({
        "client_id": GOOGLE_ID, "redirect_uri": _redirect_uri(), "response_type": "code",
        "scope": "openid email profile", "state": state, "prompt": "select_account",
        "code_challenge": _b64(hashlib.sha256(verifier.encode()).digest()), "code_challenge_method": "S256"})
    cookie = "%s=%s; Path=/api/konto/google; Max-Age=600; HttpOnly; Secure; SameSite=Lax" % (OAUTH_COOKIE, state)
    return 302, GOOGLE_AUTH_URL + "?" + q, [cookie]


def _fail():
    return 302, "/konto/?fehler=google", ["%s=; Path=/api/konto/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax" % OAUTH_COOKIE]


def google_callback(query, oauth_cookie):
    """-> (302, Ziel-URL, [Cookies])"""
    q = urllib.parse.parse_qs(query)
    state, code = (q.get("state") or [""])[0], (q.get("code") or [""])[0]
    with _lock:
        entry = _oauth.pop(state, None)
    if not google_enabled() or not code or not entry or entry[1] < time.time() or not oauth_cookie \
            or not hmac.compare_digest(oauth_cookie, state):
        return _fail()
    try:
        body = urllib.parse.urlencode({
            "code": code, "client_id": GOOGLE_ID, "client_secret": GOOGLE_SECRET, "redirect_uri": _redirect_uri(),
            "grant_type": "authorization_code", "code_verifier": entry[0]}).encode()
        req = urllib.request.Request(GOOGLE_TOKEN_URL, data=body, method="POST",
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(req, timeout=15) as r:
            tok = json.loads(r.read().decode())
        payload = tok["id_token"].split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except Exception:
        return _fail()
    # id_token kommt direkt vom Token-Endpunkt ueber TLS; Pflichtfelder trotzdem pruefen
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com") or claims.get("aud") != GOOGLE_ID \
            or int(claims.get("exp", 0)) < time.time() or claims.get("email_verified") not in (True, "true") \
            or not claims.get("sub") or not EMAIL_RE.match(str(claims.get("email", ""))):
        return _fail()
    email = str(claims["email"]).lower()
    name = re.sub(r"\s+", " ", str(claims.get("name") or email.split("@")[0])).strip()[:80]
    with _lock, _db() as con:
        u = con.execute("SELECT * FROM users WHERE google_sub=?", (claims["sub"],)).fetchone()
        if not u:
            u = con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if u:   # bestehendes Konto verknuepfen; war es unbestaetigt, wird das Passwort gesperrt
                con.execute("UPDATE users SET google_sub=?, verified=1, pw=CASE WHEN verified=0 THEN '' ELSE pw END WHERE id=?",
                            (claims["sub"], u["id"]))
                uid = u["id"]
            else:
                uid = con.execute("INSERT INTO users(email,name,pw,verified,created,google_sub,abmelde_token) "
                                  "VALUES(?,?,?,1,date('now'),?,?)",
                                  (email, name, "", claims["sub"], secrets.token_urlsafe(24))).lastrowid
        else:
            uid = u["id"]
        t = secrets.token_urlsafe(32)
        con.execute("DELETE FROM sessions WHERE expires<?", (int(time.time()),))
        con.execute("INSERT INTO sessions VALUES(?,?,?)", (_h(t), uid, int(time.time() + SESSION_DAYS * 86400)))
    return 302, "/konto/", [_cookie(t, SESSION_DAYS * 86400),
                            "%s=; Path=/api/konto/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax" % OAUTH_COOKIE]
