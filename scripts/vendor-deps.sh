#!/bin/bash
# Baixa dependências pináveis para vendor/ (rodar em Linux com rede)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V="$ROOT/overlay/opt/dns-appliance/vendor"
mkdir -p "$V"
curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$V/dotnet-install.sh"
sha256sum "$V/dotnet-install.sh" | awk '{print $1}' > "$V/dotnet-install.sh.sha256"
curl -fsSL https://download.technitium.com/dns/install.sh -o "$V/technitium-install.sh"
sha256sum "$V/technitium-install.sh" | awk '{print $1}' > "$V/technitium-install.sh.sha256"
echo "Vendor OK em $V"
ls -lh "$V"
