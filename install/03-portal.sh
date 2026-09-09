#!/bin/bash
# Copia portal, blockpage, bins, templates, units
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="/opt/dns-appliance"

mkdir -p "$DEST"/{bin,lib,templates,branding,vendor,overlay} \
  /var/www/dns-portal /var/www/dns-blockpage /var/www/letsencrypt \
  /etc/nginx/ssl /var/lib/dns-appliance/sync /var/lib/dns-appliance/feeds

install -m 0755 "$ROOT/overlay/opt/dns-appliance/bin/"* "$DEST/bin/"
install -m 0644 "$ROOT/overlay/opt/dns-appliance/lib/"* "$DEST/lib/"
cp -a "$ROOT/templates/." "$DEST/templates/"
cp -a "$ROOT/config/appliance.env.example" "$DEST/appliance.env.example"
cp -a "$ROOT/overlay/opt/dns-appliance/branding/." "$DEST/branding/" 2>/dev/null || true
if [[ -d "$ROOT/overlay/opt/dns-appliance/vendor" ]]; then
  cp -a "$ROOT/overlay/opt/dns-appliance/vendor/." "$DEST/vendor/" || true
fi

cp -a "$ROOT/overlay/var/www/dns-portal/." /var/www/dns-portal/
# seed index from template if present
if [[ -f "$ROOT/templates/portal-index.html.tmpl" ]]; then
  sed -e 's/{{COMPANY_NAME}}/DNS Appliance/g' \
      -e 's/{{DNS_FQDN}}/dns.example.com/g' \
      -e 's/{{BRAND_PRIMARY}}/#ff5a00/g' \
      -e 's/{{BRAND_ACCENT}}/#ff7a25/g' \
      -e 's/{{SUPPORT_PHONE}}//g' \
      -e 's/{{SUPPORT_URL}}//g' \
      -e 's/{{SUPPORT_EMAIL}}//g' \
      -e 's/{{BLOCK_LEGAL_TEXT}}/Acesso bloqueado./g' \
      "$ROOT/templates/portal-index.html.tmpl" > /var/www/dns-portal/index.html
fi
if [[ -f "$ROOT/templates/blockpage-index.html.tmpl" ]]; then
  sed -e 's/{{COMPANY_NAME}}/DNS Appliance/g' \
      -e 's/{{BRAND_PRIMARY}}/#ff5a00/g' \
      -e 's/{{SUPPORT_PHONE}}//g' \
      -e 's/{{SUPPORT_URL}}//g' \
      -e 's/{{SUPPORT_EMAIL}}//g' \
      -e 's/{{BLOCK_LEGAL_TEXT}}/Acesso bloqueado./g' \
      "$ROOT/templates/blockpage-index.html.tmpl" > /var/www/dns-blockpage/index.html
fi
cp -f "$DEST/branding/logo.svg" /var/www/dns-portal/assets/logo.svg 2>/dev/null || true
cp -f "$DEST/branding/logo.svg" /var/www/dns-blockpage/logo.svg 2>/dev/null || true

chown -R www-data:www-data /var/www/dns-portal /var/www/dns-blockpage

ln -sfn "$DEST/bin/dns-apply-config" /usr/local/sbin/dns-apply-config
ln -sfn "$DEST/bin/dns-firstboot" /usr/local/sbin/dns-firstboot
ln -sfn "$DEST/bin/dns-ha-configure" /usr/local/sbin/dns-ha-configure
ln -sfn "$DEST/bin/chk_dns" /usr/local/sbin/chk_dns
chmod +x "$DEST/bin/"*

# systemd units
install -m 0644 "$ROOT/firstboot/dns-firstboot.service" /etc/systemd/system/dns-firstboot.service
install -m 0644 "$ROOT/firstboot/dns-appliance-health.service" /etc/systemd/system/dns-appliance-health.service
install -m 0644 "$ROOT/firstboot/dns-appliance-health.timer" /etc/systemd/system/dns-appliance-health.timer
install -m 0644 "$ROOT/firstboot/dns-appliance-sync.service" /etc/systemd/system/dns-appliance-sync.service
install -m 0644 "$ROOT/firstboot/dns-appliance-sync.timer" /etc/systemd/system/dns-appliance-sync.timer
install -m 0644 "$ROOT/firstboot/dns-feed-update.service" /etc/systemd/system/dns-feed-update.service
install -m 0644 "$ROOT/firstboot/dns-feed-update.timer" /etc/systemd/system/dns-feed-update.timer
install -m 0644 "$ROOT/firstboot/dns-sync-agent.service" /etc/systemd/system/dns-sync-agent.service

systemctl daemon-reload
systemctl enable dns-firstboot.service
systemctl enable dns-appliance-health.timer
systemctl enable dns-sync-agent.service

rm -f /etc/nginx/sites-enabled/default
echo "03-portal OK"
