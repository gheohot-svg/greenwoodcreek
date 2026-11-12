#!/bin/bash
# GREENWOODCREEK: Kundenkonto-, Bewertungs- und Newsletter-Dienst auf dem Server einrichten.
# Aufruf auf dem Mac (einmalig):  bash ~/greenwoodcreek-www/_blog-agent/bewertungs-dienst/einrichten.sh
# Erneut ausfuehren ist ungefaehrlich (bestehende Daten und Zugangsdaten bleiben erhalten).
set -e
SSH="ssh -p 2230"
HOST="jan@152.53.94.158"

$SSH "$HOST" 'bash -s' <<'REMOTE'
set -e
REPO=~/greenwoodcreek-repo
DIR=$REPO/_blog-agent/bewertungs-dienst
cd "$REPO" && git fetch -q origin main && git reset -q --hard origin/main

echo "1/5 Speicherorte ..."
sudo -n mkdir -p /srv/greenwoodcreek/www/assets/data/live
sudo -n chown jan /srv/greenwoodcreek/www/assets/data/live
[ -f /srv/greenwoodcreek/www/assets/data/live/bewertungen.json ] || echo '{"bewertungen": []}' > /srv/greenwoodcreek/www/assets/data/live/bewertungen.json
chmod 755 /srv/greenwoodcreek/www/assets/data/live; chmod 644 /srv/greenwoodcreek/www/assets/data/live/bewertungen.json

echo "2/5 Zugangsdaten-Datei (nur fuer jan lesbar) ..."
ENV=~/.gwc-dienst.env
if [ ! -f "$ENV" ]; then
  cat > "$ENV" <<'E'
# Hier die Zugangsdaten eintragen, dann: sudo systemctl restart gwc-bewertungen
GWC_BASE_URL=https://greenwoodcreek.de
# Mailversand (z. B. web.de: smtp.web.de, Port 587)
GWC_SMTP_HOST=
GWC_SMTP_PORT=587
GWC_SMTP_USER=
GWC_SMTP_PASS=
GWC_SMTP_FROM=GREENWOODCREEK <neumeyer.jan@web.de>
# Google-Anmeldung (Google Cloud Console > APIs & Dienste > Anmeldedaten > OAuth-Client-ID)
GWC_GOOGLE_CLIENT_ID=
GWC_GOOGLE_CLIENT_SECRET=
E
fi
chmod 600 "$ENV"

echo "3/5 Dienst (systemd) ..."
sudo -n tee /etc/systemd/system/gwc-bewertungen.service >/dev/null <<UNIT
[Unit]
Description=GREENWOODCREEK Bewertungen, Kundenkonto
After=network.target

[Service]
User=jan
EnvironmentFile=/home/jan/.gwc-dienst.env
ExecStart=/usr/bin/python3 -I $DIR/bewertungen_dienst.py
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/greenwoodcreek/www/assets/data/live /home/jan
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now gwc-bewertungen
sudo -n systemctl restart gwc-bewertungen
sleep 1
curl -fsS http://127.0.0.1:8081/api/health >/dev/null && echo "   Dienst laeuft" || { echo "   FEHLER: Dienst startet nicht"; sudo -n journalctl -u gwc-bewertungen -n 20 --no-pager; exit 1; }

echo "4/5 Webserver: /api/ an den Dienst weiterleiten ..."
if command -v nginx >/dev/null && sudo -n nginx -T 2>/dev/null | grep -q greenwoodcreek; then
  CONF=$(sudo -n nginx -T 2>/dev/null | grep -B200 "server_name.*greenwoodcreek" | grep "# configuration file" | tail -1 | awk '{print $4}' | tr -d ':')
  if ! sudo -n grep -q "location /api/" "$CONF"; then
    sudo -n cp "$CONF" "$CONF.vor-api.bak"
    sudo -n python3 - "$CONF" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
block = """
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 16k;
    }
    location /assets/data/live/ {
        add_header Cache-Control "no-cache";
    }
"""
# nach jeder server_name-Zeile fuer greenwoodcreek einsetzen (im Redirect-Block auf Port 80 wirkt "return 301" zuerst)
for m in reversed(list(re.finditer(r"server_name[^;]*greenwoodcreek[^;]*;", s))):
    s = s[:m.end()] + block + s[m.end():]
open(p, "w").write(s)
PY
    if sudo -n nginx -t 2>/dev/null; then sudo -n systemctl reload nginx; echo "   nginx: /api/ eingerichtet"
    else sudo -n cp "$CONF.vor-api.bak" "$CONF"; echo "   FEHLER in nginx-Konfiguration, alte Datei wiederhergestellt"; exit 1; fi
  else echo "   nginx: /api/ war schon eingerichtet"; fi
elif command -v caddy >/dev/null; then
  echo "   Caddy gefunden: bitte in der Caddyfile im greenwoodcreek-Block ergaenzen:  reverse_proxy /api/* 127.0.0.1:8081"
else
  echo "   Webserver nicht automatisch erkannt. Weiterleitung /api/ -> 127.0.0.1:8081 bitte von Claude einrichten lassen."
fi

echo "5/5 Newsletter (prueft alle 15 Minuten auf neue Beitraege) ..."
cat > ~/bin/gwc-newsletter.sh <<NL
#!/bin/bash
set -a; . /home/jan/.gwc-dienst.env; set +a
exec /usr/bin/python3 -I $DIR/newsletter.py
NL
chmod +x ~/bin/gwc-newsletter.sh
~/bin/gwc-newsletter.sh || true
( crontab -l 2>/dev/null | grep -v gwc-newsletter.sh; echo '5,20,35,50 * * * * $HOME/bin/gwc-newsletter.sh >> $HOME/gwc-newsletter.log 2>&1' ) | crontab -

echo
echo "Fertig. Test: curl -s https://greenwoodcreek.de/api/health"
echo "Zugangsdaten eintragen: nano ~/.gwc-dienst.env  und danach  sudo systemctl restart gwc-bewertungen"
REMOTE
