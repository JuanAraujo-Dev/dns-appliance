#!/bin/bash
# Query Logs defaults (nftables final vem do dns-apply-config)
set -euo pipefail

QL_DIR='/etc/dns/apps/Query Logs (Sqlite)'
if [[ -d "$QL_DIR" ]]; then
  cat > "$QL_DIR/dnsApp.config" <<'EOF'
{"enableLogging":true,"maxQueueSize":500000,"maxLogDays":30,"maxLogRecords":1000000,"enableVacuum":false,"useInMemoryDb":false,"sqliteDbPath":"querylogs.db","connectionString":"Data Source='{sqliteDbPath}'; Cache=Shared;"}
EOF
  chown -R dns-server:dns-server "$QL_DIR" 2>/dev/null || true
fi

# Baseline nftables (fechado) até o wizard aplicar CLIENT_CIDRS
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
    # DNS fechado por padrão até CLIENT_CIDRS
  }
  chain forward { type filter hook forward priority 0; policy drop; }
  chain output { type filter hook output priority 0; policy accept; }
}
EOF
systemctl enable nftables
nft -f /etc/nftables.conf
systemctl restart dns
echo "04-querylogs-security OK"
