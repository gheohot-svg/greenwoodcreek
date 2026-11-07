#!/bin/bash
# Wird von launchd jeden Montag um 10:15 aufgerufen. Laedt nur hoch, wenn ein neuer Artikel wartet.
DIR="$HOME/greenwoodcreek-www/_blog-agent"
LOG="$DIR/deploy.log"
[ -s "$DIR/PENDING_DEPLOY" ] || { echo "$(date '+%F %T') nichts zu tun" >> "$LOG"; exit 0; }
SLUG=$(awk '{print $2}' "$DIR/PENDING_DEPLOY")
if bash "$HOME/greenwoodcreek-www/deploy.sh" >> "$LOG" 2>&1; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://greenwoodcreek.de/aktuelles/$SLUG/")
  echo "$(date '+%F %T') hochgeladen: /aktuelles/$SLUG/ -> $CODE" >> "$LOG"
  [ "$CODE" = "200" ] && rm -f "$DIR/PENDING_DEPLOY"
  osascript -e "display notification \"/aktuelles/$SLUG/ ist online ($CODE)\" with title \"GREENWOODCREEK Blog\"" 2>/dev/null
else
  echo "$(date '+%F %T') FEHLER beim Upload" >> "$LOG"
  osascript -e 'display notification "Upload fehlgeschlagen, siehe _blog-agent/deploy.log" with title "GREENWOODCREEK Blog"' 2>/dev/null
fi
