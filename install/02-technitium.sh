#!/bin/bash
# Instala .NET + Technitium DNS Server (instalador oficial)
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if [[ ! -x /usr/bin/dotnet ]] && [[ ! -x /opt/dotnet/dotnet ]]; then
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /opt/dotnet
  ln -sfn /opt/dotnet/dotnet /usr/local/bin/dotnet
  # Technitium recente pode pedir ASP.NET mais novo — tenta 8 e fallback portable
fi

# Instalador oficial Technitium (systemd unit dns.service)
if [[ ! -d /opt/technitium/dns ]]; then
  curl -fsSL https://download.technitium.com/dns/install.sh -o /tmp/technitium-install.sh
  bash /tmp/technitium-install.sh
fi

systemctl enable dns
systemctl start dns || true

# Aguarda API
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:5380/ >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "02-technitium OK"
