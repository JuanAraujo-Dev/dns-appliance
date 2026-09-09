#!/bin/bash
# Query Logs (Sqlite) + defaults de segurança DNS
set -euo pipefail

APPS_DIR="/etc/dns/apps"
QL_DIR="$APPS_DIR/Query Logs (Sqlite)"

# Se o app já veio com o Technitium, só garante config
if [[ -d "$QL_DIR" ]]; then
  cat > "$QL_DIR/dnsApp.config" <<'EOF'
{"enableLogging":true,"maxQueueSize":500000,"maxLogDays":30,"maxLogRecords":1000000,"enableVacuum":false,"useInMemoryDb":false,"sqliteDbPath":"querylogs.db","connectionString":"Data Source='{sqliteDbPath}'; Cache=Shared;"}
EOF
  chown -R dns-server:dns-server "$QL_DIR" 2>/dev/null || true
fi

# Hardening leve: Technitium escuta API só em localhost via nginx (já é o caso no portal).
# Firewall básico com nftables — permite SSH, DNS, HTTP/HTTPS
if command -v nft >/dev/null; then
  cat >/etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    iif lo accept
    ip protocol icmp accept
    ip6 nexthdr icmpv6 accept
    tcp dport { 22, 80, 443 } accept
    udp dport { 53 } accept
    tcp dport { 53 } accept
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
  }
  chain output {
    type filter hook output priority 0; policy accept;
  }
}
EOF
  systemctl enable nftables
  nft -f /etc/nftables.conf || true
fi

systemctl restart dns || true
echo "04-querylogs-security OK"
