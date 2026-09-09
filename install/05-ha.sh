#!/bin/bash
# HA packages already in 01-base; ensure keepalived present
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq keepalived
systemctl enable keepalived || true
echo "05-ha OK"
