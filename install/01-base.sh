#!/bin/bash
# Instala base Ubuntu: pacotes do DNS appliance
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  ca-certificates curl wget gnupg lsb-release \
  nginx nftables fail2ban certbot python3-certbot-nginx \
  openssl whiptail jq unzip tar \
  net-tools dnsutils \
  software-properties-common

systemctl enable nginx nftables fail2ban
systemctl start nftables || true

# Fail2ban SSH
cat >/etc/fail2ban/jail.d/jd-dns.conf <<'EOF'
[DEFAULT]
banaction = nftables
banaction_allports = nftables[type=allports]
backend = systemd

[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl restart fail2ban || true

echo "01-base OK"
