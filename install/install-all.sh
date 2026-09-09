#!/bin/bash
# DNS Appliance v2 — instalação completa
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== DNS Appliance v2 — instalação completa ==="
bash "$ROOT/install/01-base.sh"
bash "$ROOT/install/02-technitium.sh"
bash "$ROOT/install/03-portal.sh"
bash "$ROOT/install/04-querylogs-security.sh"
bash "$ROOT/install/05-ha.sh"

if [[ -f /etc/dns-appliance.env ]]; then
  /opt/dns-appliance/bin/dns-apply-config
else
  cp "$ROOT/config/appliance.env.example" /etc/dns-appliance.env.example
  echo "Sem /etc/dns-appliance.env — execute: dns-firstboot"
fi

cat >/etc/motd <<'EOF'

=== DNS Appliance v2 ===
Wizard:     dns-firstboot
Reaplicar:  dns-apply-config
Portal:     https://<FQDN>/portal/
Admin:      https://<FQDN>/admin/  (somente MGMT_CIDRS)
Health:     /portal/health.json

EOF

echo "=== Instalação concluída ==="
