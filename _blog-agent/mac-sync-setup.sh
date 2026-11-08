#!/bin/bash
# Einmalig auf dem Mac ausfuehren: bash ~/greenwoodcreek-www/_blog-agent/mac-sync-setup.sh
set -e
DIR="$HOME/greenwoodcreek-www"
KEY="$HOME/.ssh/gwc_mac_sync"
PLIST="$HOME/Library/LaunchAgents/de.greenwoodcreek.macsync.plist"

echo "1/4 Lese-Schluessel fuer GitHub ..."
mkdir -p ~/.ssh && chmod 700 ~/.ssh
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -f "$KEY" -C "gwc-mac-sync"
grep -q "Host github-gwc-mac" ~/.ssh/config 2>/dev/null || printf '\nHost github-gwc-mac\n  HostName github.com\n  User git\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$KEY" >> ~/.ssh/config
chmod 600 ~/.ssh/config
ssh-keyscan -q github.com >> ~/.ssh/known_hosts 2>/dev/null
echo; echo "================ DIESEN SCHLUESSEL KOPIEREN ================"
cat "$KEY.pub"
echo "============================================================"
echo "GitHub: Repo greenwoodcreek > Settings > Deploy keys > Add deploy key"
echo "Titel: Mac, Schluessel einfuegen, 'Allow write access' NICHT anhaken, speichern."
read -p "Wenn erledigt, Enter druecken ... "

cd "$DIR"
if [ ! -d .git ]; then
  BK="$HOME/greenwoodcreek-backup-$(date +%Y%m%d-%H%M)"
  echo "2/4 Sicherungskopie nach $BK ..."
  cp -Rp "$DIR" "$BK"
  echo "3/4 Ordner mit GitHub verbinden ..."
  git init -q -b main
  git remote add origin git@github-gwc-mac:gheohot-svg/greenwoodcreek.git
  git fetch -q origin main
  git reset -q origin/main
  git checkout -q -- .
  git branch -q -u origin/main
else
  echo "2/4 und 3/4: Ordner ist schon verbunden."
  git fetch -q origin main
fi
chmod +x _blog-agent/mac-sync.sh

echo "4/4 Automatischen Abgleich alle 15 Minuten einrichten ..."
launchctl bootout "gui/$(id -u)/de.greenwoodcreek.blogdeploy" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/de.greenwoodcreek.blogdeploy.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>de.greenwoodcreek.macsync</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/_blog-agent/mac-sync.sh</string></array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/de.greenwoodcreek.macsync" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
bash _blog-agent/mac-sync.sh || true
echo
echo "Fertig. Stand im Ordner: $(git log -1 --format='%h %s')"
echo "Protokoll: $DIR/_blog-agent/mac-sync.log"
