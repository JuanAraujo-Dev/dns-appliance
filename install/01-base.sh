#!/bin/bash
# Pacotes base + keepalived + ferramentas HA
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq \
  nginx nftables fail2ban certbot python3-certbot-nginx \
  curl wget openssl whiptail jq unzip dnsutils ca-certificates \
  keepalived python3 rsync tar gzip

systemctl enable nginx nftables fail2ban

# Fail2ban SSH + nginx limit (auth probes)
cat >/etc/fail2ban/jail.d/dns-appliance.conf <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
backend = systemd
maxretry = 5
bantime = 1h
banaction = nftables-multiport

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 8
bantime = 30m
banaction = nftables-multiport
EOF

systemctl restart fail2ban || true
echo "01-base OK"
