#!/bin/bash
# GREENWOODCREEK – Website hochladen. Aufruf: bash ~/greenwoodcreek-www/deploy.sh
set -e
SRC="$HOME/greenwoodcreek-www/"
SSH="ssh -p 2230"
HOST="jan@152.53.94.158"
echo "1/3 Lade Dateien hoch ..."
rsync -rltvz --no-perms --no-owner --no-group \
  --exclude 'deploy.sh' --exclude '_apple-preview' --exclude '_blog-agent' --exclude '.DS_Store' \
  --exclude 'aktuelles/' --exclude 'sitemap.xml' \
  --rsync-path="sudo rsync" -e "$SSH" "$SRC" "$HOST:/srv/greenwoodcreek/www/"
echo "2/3 Setze Leserechte ..."
$SSH "$HOST" "sudo chmod -R a+rX /srv/greenwoodcreek/www"
echo "3/3 Pruefe die Live-Seiten ..."
for u in "" hochzeitsfotograf-muenchen/ fotograf-heidelberg/ webdesign-muenchen/ social-media-betreuung-muenchen/ assets/video/australien-portfolio-mobile.mp4; do
  printf "%-32s %s\n" "/$u" "$(curl -s -o /dev/null -w '%{http_code}' "https://greenwoodcreek.de/$u")"
done
echo "Fertig. 200 = online."
