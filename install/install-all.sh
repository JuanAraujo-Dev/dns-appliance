#!/bin/bash
# Instalação completa da DNS Appliance (rodar como root em Ubuntu 24.04)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== DNS Appliance — instalação completa ==="
bash "$ROOT/install/01-base.sh"
bash "$ROOT/install/02-technitium.sh"
bash "$ROOT/install/03-portal.sh"
bash "$ROOT/install/04-querylogs-security.sh"

# Se já existir env pré-seeded (ISO autoinstall), aplica; senão firstboot no próximo boot
if [[ -f /etc/dns-appliance.env ]]; then
  /opt/dns-appliance/bin/dns-apply-config || true
else
  cp "$ROOT/config/appliance.env.example" /etc/dns-appliance.env.example
  echo "Sem /etc/dns-appliance.env — wizard rodará no first-boot (TTY1) ou execute: dns-firstboot"
fi

# Lembrete no login SSH
cat >/etc/motd <<'EOF'

=== DNS Appliance ===
Wizard:  dns-firstboot
Reaplicar IP/domínio/nome/logo:  dns-apply-config
Portal:  https://<seu-fqdn>/portal/
Admin:   https://<seu-fqdn>/admin/

EOF

echo
echo "=== Instalação concluída ==="
echo "Wizard: dns-firstboot"
echo "Reaplicar: dns-apply-config"
echo "Portal após config: https://<DNS_FQDN>/portal/"
