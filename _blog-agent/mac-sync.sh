#!/bin/bash
# Haelt ~/greenwoodcreek-www auf dem Stand von GitHub. Laeuft alle 15 Minuten (launchd).
cd "$HOME/greenwoodcreek-www" || exit 1
LOG="$HOME/greenwoodcreek-www/_blog-agent/mac-sync.log"
note() { osascript -e "display notification \"$1\" with title \"GREENWOODCREEK Sync\"" 2>/dev/null; }
git fetch -q origin main 2>>"$LOG" || { echo "$(date '+%F %T') GitHub nicht erreichbar" >> "$LOG"; exit 0; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "$(date '+%F %T') PAUSE: lokale Aenderungen an Repo-Dateien:" >> "$LOG"
  git status --short --untracked-files=no >> "$LOG"
  note "Sync pausiert: lokale Aenderungen, siehe _blog-agent/mac-sync.log"
  exit 1
fi
if git merge -q --ff-only origin/main 2>>"$LOG"; then
  echo "$(date '+%F %T') aktualisiert: $(git log -1 --format='%h %s')" >> "$LOG"
else
  echo "$(date '+%F %T') FEHLER beim Aktualisieren" >> "$LOG"; note "Sync fehlgeschlagen, siehe _blog-agent/mac-sync.log"
fi
