#!/usr/bin/env python3
"""GREENWOODCREEK Newsletter: schickt neue Blogbeitraege an Konto-Inhaber mit Newsletter-Haeckchen.

Aufruf per Cron (z. B. alle 15 Minuten, kurz nach dem Abruf der Website):
    python3 newsletter.py            # versenden
    python3 newsletter.py --trocken  # nur anzeigen, nichts senden/speichern

- Quelle sind die LIVE gestellten Beitraege (Webroot), nicht das Repo: es geht nie eine Mail raus,
  bevor der Beitrag online ist.
- Erster Lauf: alle vorhandenen Beitraege werden nur als "bereits bekannt" vermerkt (kein Mailversand an Altbeitraegen).
- Pro Beitrag und Empfaenger wird genau einmal gesendet (Zustand in STATE_FILE, auch nach Abbruch).
- Jede Mail enthaelt einen persoenlichen Abmelde-Link und den List-Unsubscribe-Header.
"""
import html, json, os, re, secrets, smtplib, sqlite3, sys, time
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import konto

POSTS_DIR = os.environ.get("GWC_POSTS", "/srv/greenwoodcreek/www/aktuelles")
STATE_FILE = os.environ.get("GWC_NL_STATE", os.path.expanduser("~/gwc-newsletter-state.json"))
BASE = konto.BASE_URL.rstrip("/")


def meta(src, prop):
    m = re.search(r'<meta content="([^"]*)" property="%s"' % re.escape(prop), src) or \
        re.search(r'<meta property="%s" content="([^"]*)"' % re.escape(prop), src)
    return html.unescape(m.group(1)).strip() if m else ""


def posts():
    out = []
    if not os.path.isdir(POSTS_DIR):
        return out
    for slug in os.listdir(POSTS_DIR):
        f = os.path.join(POSTS_DIR, slug, "index.html")
        if not os.path.isfile(f):
            continue
        src = open(f, encoding="utf-8", errors="replace").read()
        title = meta(src, "og:title") or (re.search(r"<title>([^<]*)", src) or [None, slug])[1]
        title = re.sub(r"\s*[|–-]\s*GREENWOODCREEK.*$", "", html.unescape(title)).strip()
        out.append({"slug": slug, "title": title, "text": meta(src, "og:description"),
                    "image": meta(src, "og:image"), "url": "%s/aktuelles/%s/" % (BASE, slug), "mtime": os.path.getmtime(f)})
    return sorted(out, key=lambda p: p["mtime"])


def subscribers():
    con = konto._db()
    rows = con.execute("SELECT id,email,name,abmelde_token FROM users WHERE newsletter=1 AND verified=1").fetchall()
    res = []
    for r in rows:
        tok = r["abmelde_token"]
        if not tok:
            tok = secrets.token_urlsafe(24)
            con.execute("UPDATE users SET abmelde_token=? WHERE id=?", (tok, r["id"]))
            con.commit()
        res.append({"id": r["id"], "email": r["email"], "name": r["name"], "unsub": "%s/konto/?abbestellen=%s" % (BASE, tok)})
    return res


def render(p, sub):
    e = html.escape
    name = e(sub["name"].split(" ")[0])
    img = ('<tr><td><a href="%s"><img src="%s" alt="%s" width="600" style="display:block;width:100%%;max-width:600px;height:auto;border:0"></a></td></tr>'
           % (e(p["url"]), e(p["image"]), e(p["title"]))) if p["image"] else ""
    body = f"""<!doctype html><html lang="de"><body style="margin:0;padding:0;background:#0b0b0b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#141414;font-family:Helvetica,Arial,sans-serif;color:#f1ece6">
<tr><td style="padding:22px 28px;background:#000;font-size:20px;letter-spacing:.18em;font-weight:700;color:#f1ece6">GREENWOODCREEK</td></tr>
{img}
<tr><td style="padding:28px 28px 8px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#e4442a">Neu im Blog</td></tr>
<tr><td style="padding:0 28px;font-size:26px;line-height:1.25;font-weight:700"><a href="{e(p['url'])}" style="color:#f1ece6;text-decoration:none">{e(p['title'])}</a></td></tr>
<tr><td style="padding:14px 28px 4px;font-size:16px;line-height:1.6;color:rgba(241,236,230,.82)">Hallo {name},<br><br>{e(p['text'])}</td></tr>
<tr><td style="padding:22px 28px 34px"><a href="{e(p['url'])}" style="display:inline-block;background:#a5220f;color:#f1ece6;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:3px">Beitrag lesen</a></td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid rgba(241,236,230,.14);font-size:12px;line-height:1.6;color:rgba(241,236,230,.6)">
Sie erhalten diese E-Mail, weil Sie in Ihrem Kundenkonto den Newsletter abonniert haben.<br>
<a href="{e(sub['unsub'])}" style="color:rgba(241,236,230,.85)">Newsletter abbestellen</a> · <a href="{BASE}/impressum/" style="color:rgba(241,236,230,.85)">Impressum</a> · <a href="{BASE}/datenschutz/" style="color:rgba(241,236,230,.85)">Datenschutz</a><br><br>
GREENWOODCREEK Foto- und Videoproduktion · Jan Neumeyer · Albert-Schweitzer-Straße 56 · 81735 München</td></tr>
</table></td></tr></table></body></html>"""
    text = (f"Hallo {sub['name'].split(' ')[0]},\n\nNeu im Blog: {p['title']}\n\n{p['text']}\n\nBeitrag lesen: {p['url']}\n\n"
            f"--\nSie erhalten diese E-Mail, weil Sie im Kundenkonto den Newsletter abonniert haben.\n"
            f"Abbestellen: {sub['unsub']}\nImpressum: {BASE}/impressum/\n"
            "GREENWOODCREEK Foto- und Videoproduktion, Jan Neumeyer, Albert-Schweitzer-Straße 56, 81735 München\n")
    return text, body


def send_all(msgs):
    """Eine SMTP-Verbindung fuer alle Mails; gibt die Menge der erfolgreich versendeten IDs zurueck."""
    ok = set()
    with smtplib.SMTP(konto.SMTP_HOST, konto.SMTP_PORT, timeout=30) as s:
        if konto.SMTP_TLS:
            s.starttls()
        if konto.SMTP_USER:
            s.login(konto.SMTP_USER, konto.SMTP_PASS)
        for uid, m in msgs:
            try:
                s.send_message(m)
                ok.add(uid)
                time.sleep(0.3)
            except Exception as ex:
                print("  Fehler bei Empfaenger %s: %s" % (uid, type(ex).__name__))
    return ok


def main():
    dry = "--trocken" in sys.argv
    konto.init_db()
    found = posts()
    state = None
    try:
        state = json.load(open(STATE_FILE, encoding="utf-8"))
    except (OSError, ValueError):
        pass
    if state is None:
        state = {"fertig": [p["slug"] for p in found], "teilweise": {}}
        if not dry:
            json.dump(state, open(STATE_FILE, "w", encoding="utf-8"), indent=1)
        print("Erster Lauf: %d vorhandene Beitraege als bekannt vermerkt, nichts gesendet." % len(found))
        return
    neu = [p for p in found if p["slug"] not in state["fertig"]]
    if not neu:
        return
    subs = subscribers()
    for p in neu:
        done = set(state["teilweise"].get(p["slug"], []))
        todo = [s for s in subs if s["id"] not in done]
        print("Neuer Beitrag %s: %d Empfaenger offen" % (p["slug"], len(todo)))
        if dry:
            continue
        if todo and not konto.smtp_enabled():
            print("  SMTP nicht konfiguriert, Beitrag bleibt offen.")
            continue
        msgs = []
        for s in todo:
            text, body = render(p, s)
            m = EmailMessage()
            m["From"], m["To"], m["Subject"] = konto.SMTP_FROM, s["email"], "Neu im Blog: " + p["title"]
            m["Date"], m["Message-ID"] = formatdate(localtime=True), make_msgid(domain="greenwoodcreek.de")
            m["List-Unsubscribe"] = "<%s>" % s["unsub"]
            m.set_content(text)
            m.add_alternative(body, subtype="html")
            msgs.append((s["id"], m))
        if msgs:
            try:
                done |= send_all(msgs)
            except Exception as ex:
                print("  SMTP-Fehler:", type(ex).__name__)
        if all(s["id"] in done for s in subs):
            state["fertig"].append(p["slug"])
            state["teilweise"].pop(p["slug"], None)
        else:
            state["teilweise"][p["slug"]] = sorted(done)
        json.dump(state, open(STATE_FILE, "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
