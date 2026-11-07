#!/bin/bash
# GREENWOODCREEK: einmalige Einrichtung des automatischen Blog-Abrufs auf dem Server.
# Aufruf auf dem Mac:  bash ~/greenwoodcreek-www/_blog-agent/server-setup.sh
set -e
SSH="ssh -p 2230"
HOST="jan@152.53.94.158"
REPO="git@github-gwc:gheohot-svg/greenwoodcreek.git"

echo "1/3 Lege auf dem Server einen Lese-Schluessel fuer GitHub an ..."
$SSH "$HOST" 'bash -s' <<'EOF'
set -e
mkdir -p ~/.ssh && chmod 700 ~/.ssh
[ -f ~/.ssh/gwc_deploy ] || ssh-keygen -q -t ed25519 -N "" -f ~/.ssh/gwc_deploy -C "gwc-deploy@server"
grep -q "Host github-gwc" ~/.ssh/config 2>/dev/null || printf 'Host github-gwc\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/gwc_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
chmod 600 ~/.ssh/config
ssh-keyscan -q github.com >> ~/.ssh/known_hosts 2>/dev/null
echo
echo "================ DIESEN SCHLUESSEL KOPIEREN ================"
cat ~/.ssh/gwc_deploy.pub
echo "============================================================"
EOF
echo
echo "Jetzt auf GitHub: Repo greenwoodcreek > Settings > Deploy keys > Add deploy key"
echo "Titel: Server, Schluessel einfuegen, 'Allow write access' NICHT anhaken, speichern."
read -p "Wenn erledigt, Enter druecken ... "

echo "2/3 Klone das Repo und richte den Abruf alle 15 Minuten ein ..."
$SSH "$HOST" "REPO='$REPO' bash -s" <<'EOF'
set -e
[ -d ~/greenwoodcreek-repo/.git ] || git clone -q "$REPO" ~/greenwoodcreek-repo
mkdir -p ~/bin
cat > ~/bin/gwc-pull.sh <<'PULL'
#!/bin/bash
# Holt neue Commits und kopiert NUR die geaenderten Dateien in den Webroot.
cd ~/greenwoodcreek-repo || exit 1
OLD=$(git rev-parse HEAD)
git fetch -q origin main || { echo "$(date '+%F %T') fetch fehlgeschlagen"; exit 1; }
NEW=$(git rev-parse origin/main)
[ "$OLD" = "$NEW" ] && exit 0
git reset -q --hard origin/main
git diff --name-only --diff-filter=ACMR "$OLD" "$NEW" \
  | grep -vE '^(_blog-agent/|_apple-preview/|deploy\.sh$|\.git)' > /tmp/gwc-files.txt || true
if [ -s /tmp/gwc-files.txt ]; then
  sudo -n rsync -rlt --files-from=/tmp/gwc-files.txt ./ /srv/greenwoodcreek/www/ \
    && sudo -n chmod -R a+rX /srv/greenwoodcreek/www \
    && echo "$(date '+%F %T') $NEW: $(wc -l < /tmp/gwc-files.txt) Dateien live" \
    || echo "$(date '+%F %T') FEHLER beim Kopieren (sudo?)"
fi
PULL
chmod +x ~/bin/gwc-pull.sh
if [ ! -f ~/.gwc-initial-sync ]; then
  cd ~/greenwoodcreek-repo && sudo -n rsync -rlt aktuelles sitemap.xml /srv/greenwoodcreek/www/ \
    && sudo -n chmod -R a+rX /srv/greenwoodcreek/www && touch ~/.gwc-initial-sync \
    && echo "Blogbereich und Sitemap einmalig live gestellt"
fi
( crontab -l 2>/dev/null | grep -v gwc-pull.sh; echo '*/15 * * * * $HOME/bin/gwc-pull.sh >> $HOME/gwc-pull.log 2>&1' ) | crontab -
sudo -n true 2>/dev/null && echo "sudo ohne Passwort: OK" || echo "ACHTUNG: sudo fragt nach Passwort, bitte Claude Bescheid geben"
EOF
echo "3/3 Fertig. Der Server prueft jetzt alle 15 Minuten auf neue Artikel."
echo "Protokoll ansehen: $SSH $HOST tail ~/gwc-pull.log"
