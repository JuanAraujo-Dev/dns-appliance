#!/bin/bash
# Instala .NET 8 + Technitium com versões pinadas quando possível
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOTNET_CHANNEL="${DOTNET_CHANNEL:-8.0}"
TECHNITIUM_INSTALL_URL="${TECHNITIUM_INSTALL_URL:-https://download.technitium.com/dns/install.sh}"
VENDOR_DIR="/opt/dns-appliance/vendor"
mkdir -p "$VENDOR_DIR"

if [[ ! -x /usr/bin/dotnet ]] && [[ ! -x /opt/dotnet/dotnet ]]; then
  if [[ -f "$VENDOR_DIR/dotnet-install.sh" ]]; then
    bash "$VENDOR_DIR/dotnet-install.sh" --channel "$DOTNET_CHANNEL" --install-dir /opt/dotnet
  else
    curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
    # optional checksum file
    if [[ -f "$VENDOR_DIR/dotnet-install.sh.sha256" ]]; then
      echo "$(cat "$VENDOR_DIR/dotnet-install.sh.sha256")  /tmp/dotnet-install.sh" | sha256sum -c -
    fi
    bash /tmp/dotnet-install.sh --channel "$DOTNET_CHANNEL" --install-dir /opt/dotnet
    cp -f /tmp/dotnet-install.sh "$VENDOR_DIR/dotnet-install.sh" || true
  fi
  ln -sfn /opt/dotnet/dotnet /usr/local/bin/dotnet
fi

if [[ ! -d /opt/technitium/dns ]]; then
  if [[ -f "$VENDOR_DIR/technitium-install.sh" ]]; then
    bash "$VENDOR_DIR/technitium-install.sh"
  else
    curl -fsSL "$TECHNITIUM_INSTALL_URL" -o /tmp/technitium-install.sh
    if [[ -f "$VENDOR_DIR/technitium-install.sh.sha256" ]]; then
      echo "$(cat "$VENDOR_DIR/technitium-install.sh.sha256")  /tmp/technitium-install.sh" | sha256sum -c -
    fi
    bash /tmp/technitium-install.sh
    cp -f /tmp/technitium-install.sh "$VENDOR_DIR/technitium-install.sh" || true
  fi
fi

systemctl enable dns
systemctl start dns

for i in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:5380/ >/dev/null 2>&1; then
    echo "02-technitium OK"
    exit 0
  fi
  sleep 2
done

echo "ERROR: Technitium API não respondeu em 127.0.0.1:5380" >&2
exit 1
