#!/bin/bash
# Copia portal, blockpage, binários appliance e templates
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="/opt/jd-dns-appliance"

mkdir -p "$DEST"/{bin,lib,templates,branding,overlay} \
  /var/www/dns-portal /var/www/jd-blockpage /var/www/letsencrypt \
  /etc/nginx/ssl /var/lib/jd-dns-appliance

# Binários + libs + templates
install -m 0755 "$ROOT/overlay/opt/jd-dns-appliance/bin/"* "$DEST/bin/" 2>/dev/null || true
install -m 0644 "$ROOT/overlay/opt/jd-dns-appliance/lib/"* "$DEST/lib/"
cp -a "$ROOT/templates/." "$DEST/templates/"
cp -a "$ROOT/config/appliance.env.example" "$DEST/appliance.env.example"

# Portal
cp -a "$ROOT/overlay/var/www/dns-portal/." /var/www/dns-portal/
# Blockpage
cp -a "$ROOT/overlay/var/www/jd-blockpage/." /var/www/jd-blockpage/
# Logo padrão
if [[ -f /var/www/dns-portal/assets/logo.png ]]; then
  cp -f /var/www/dns-portal/assets/logo.png "$DEST/branding/logo.png"
fi
# Alias logo blockpage
if [[ -f /var/www/jd-blockpage/logo.png ]]; then
  cp -f /var/www/jd-blockpage/logo.png /var/www/jd-blockpage/jdtelecom-logo.png
fi

chown -R www-data:www-data /var/www/dns-portal /var/www/jd-blockpage

# Symlinks CLI
ln -sfn "$DEST/bin/jd-dns-apply-config" /usr/local/sbin/jd-dns-apply-config
ln -sfn "$DEST/bin/jd-dns-firstboot" /usr/local/sbin/jd-dns-firstboot
chmod +x "$DEST/bin/"* "$DEST/lib/"* || true

# Firstboot service
install -m 0644 "$ROOT/firstboot/jd-dns-firstboot.service" /etc/systemd/system/jd-dns-firstboot.service
systemctl daemon-reload
systemctl enable jd-dns-firstboot.service

# Remove default nginx site
rm -f /etc/nginx/sites-enabled/default

echo "03-portal OK"
