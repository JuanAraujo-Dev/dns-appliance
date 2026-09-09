#!/bin/bash
# Smoke tests — executar na VM após dns-firstboot
set -euo pipefail
ENV=/etc/dns-appliance.env
[[ -f "$ENV" ]] || { echo "FAIL: sem $ENV"; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV"; set +a

VIP="${VIP_ADDRESS%%/*}"
NODE="${IPV4_ADDRESS%%/*}"
TARGET="${VIP:-$NODE}"
PASS=0
FAIL=0

check() {
  local name="$1"; shift
  if "$@"; then echo "PASS: $name"; PASS=$((PASS+1)); else echo "FAIL: $name"; FAIL=$((FAIL+1)); fi
}

check "dns.service active" systemctl is-active --quiet dns
check "nginx active" systemctl is-active --quiet nginx
check "portal index" curl -kfsS "https://${DNS_FQDN}/portal/" -o /dev/null
check "health json" curl -kfsS "https://${DNS_FQDN}/portal/health.json" -o /dev/null
check "local dig" dig +time=2 +tries=1 @127.0.0.1 example.com A >/dev/null

# ACL: consulta de IP fora de CLIENT_CIDRS deve falhar no firewall OU ser recusada
# (smoke leve: nft lista contém dport 53)
check "nft has dns rules or closed default" bash -c "nft list ruleset | grep -q 'dport.*53' || nft list ruleset | grep -q 'policy drop'"

if [[ "${DEPLOY_MODE}" == "cluster" ]]; then
  check "keepalived active" systemctl is-active --quiet keepalived
  check "vip configured in env" bash -c "[[ -n \"$VIP\" ]]"
fi

if [[ "${ENABLE_DOH,,}" == "true" ]]; then
  check "doh location exists" bash -c "grep -q dns-query /etc/nginx/sites-available/dns-portal"
fi

# Admin deve estar protegido por geo (arquivo contém dns_mgmt_ok)
check "admin lockdown present" bash -c "grep -q dns_mgmt_ok /etc/nginx/sites-available/dns-portal"

echo
echo "Resultado: $PASS pass, $FAIL fail"
[[ "$FAIL" -eq 0 ]]
