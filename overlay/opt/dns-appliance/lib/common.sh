#!/bin/bash
# Funções comuns — DNS Appliance v2
set -euo pipefail

APPLIANCE_ROOT="${APPLIANCE_ROOT:-/opt/dns-appliance}"
ENV_FILE="${ENV_FILE:-/etc/dns-appliance.env}"
TMPL_DIR="${TMPL_DIR:-$APPLIANCE_ROOT/templates}"
STATE_DIR="/var/lib/dns-appliance"
SYNC_DIR="/var/lib/dns-appliance/sync"
LOG_FILE="/var/log/dns-appliance.log"
BRANDING_DIR="/opt/dns-appliance/branding"

log() { echo "[$(date -Is)] $*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*"; exit 1; }
require_root() { [[ ${EUID:-0} -eq 0 ]] || die "Execute como root"; }

password_strong() {
  local p="$1"
  [[ ${#p} -ge 12 ]] || return 1
  [[ "$p" =~ [A-Z] ]] || return 1
  [[ "$p" =~ [a-z] ]] || return 1
  [[ "$p" =~ [0-9] ]] || return 1
  [[ "$p" =~ [^A-Za-z0-9] ]] || return 1
  [[ "$p" != "Mudar@123" ]] || return 1
  return 0
}

load_env() {
  [[ -f "$ENV_FILE" ]] || die "Arquivo de config ausente: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  : "${COMPANY_NAME:?COMPANY_NAME obrigatório}"
  : "${DNS_FQDN:?DNS_FQDN obrigatório}"
  : "${IPV4_ADDRESS:?IPV4_ADDRESS obrigatório}"
  : "${IPV4_GATEWAY:?IPV4_GATEWAY obrigatório}"
  : "${HOSTNAME:=dns01}"
  : "${ADMIN_USER:=admin}"
  : "${LOGO_FILE:=$BRANDING_DIR/logo.png}"
  : "${ENABLE_LETSENCRYPT:=false}"
  : "${DNS_RESOLVERS:=1.1.1.1,8.8.8.8}"
  : "${QUERYLOG_MAX_DAYS:=30}"
  : "${QUERYLOG_MAX_RECORDS:=1000000}"
  : "${CLIENT_CIDRS:=}"
  : "${MGMT_CIDRS:=}"
  : "${DEPLOY_MODE:=standalone}"
  : "${HA_MODE:=keepalived}"
  : "${VIP_ADDRESS:=}"
  : "${VRRP_ID:=51}"
  : "${VRRP_PRIORITY:=100}"
  : "${CLUSTER_NODE:=node1}"
  : "${BRAND_PRIMARY:=#ff5a00}"
  : "${BRAND_ACCENT:=#ff7a25}"
  : "${SUPPORT_PHONE:=}"
  : "${SUPPORT_URL:=}"
  : "${SUPPORT_EMAIL:=}"
  : "${BLOCK_LEGAL_TEXT:=O acesso a este domínio foi bloqueado pela política de segurança da rede.}"
  : "${ENABLE_DOT:=true}"
  : "${ENABLE_DOH:=true}"
  : "${ENABLE_DNSSEC_VALIDATION:=true}"
  : "${ENABLE_THREAT_FEEDS:=true}"
  : "${CLIENT_RATE_LIMIT_QPS:=100}"
  [[ -n "${ADMIN_PASSWORD:-}" ]] || die "ADMIN_PASSWORD obrigatório em $ENV_FILE"
  password_strong "$ADMIN_PASSWORD" || die "ADMIN_PASSWORD fraca (mín. 12 chars, maiúscula, minúscula, número, símbolo; não use defaults)"
}

detect_iface() {
  if [[ -n "${INTERFACE:-}" ]]; then
    printf '%s' "$INTERFACE"
    return
  fi
  ip -o link show | awk -F': ' '$2 !~ /^(lo|docker|veth|br-|virbr|skydns)/ {print $2; exit}'
}

ipv4_only() { echo "${IPV4_ADDRESS%%/*}"; }

effective_vip() {
  if [[ -n "${VIP_ADDRESS:-}" ]]; then
    echo "${VIP_ADDRESS%%/*}"
  else
    ipv4_only
  fi
}

escape_sed() { printf '%s' "$1" | sed -e 's/[\\/&|]/\\&/g'; }

# Renderiza template {{VAR}} a partir do ambiente atual (+ extras KEY=VAL)
render_template() {
  local src="$1" dst="$2"
  shift 2 || true
  local content exported
  content=$(<"$src")
  mkdir -p "$(dirname "$dst")"

  export COMPANY_NAME DNS_FQDN HOSTNAME LOGO_FILE BRAND_PRIMARY BRAND_ACCENT
  export SUPPORT_PHONE SUPPORT_URL SUPPORT_EMAIL BLOCK_LEGAL_TEXT
  export IPV4 IPV4_CIDR IPV6_CIDR VIP IPV6_LISTEN_80 IPV6_LISTEN_443
  export IPV6_LISTEN_80_DEFAULT IPV6_LISTEN_443_DEFAULT
  export PORTAL_CERT PORTAL_KEY MGMT_ALLOW CLIENT_CIDRS_JSON
  export VRRP_ID VRRP_PRIORITY INTERFACE VIP_ADDRESS CLUSTER_PEER CLUSTER_SECRET
  export BGP_ASN BGP_ROUTER_ID BGP_NEIGHBORS BGP_VIP_PREFIX

  IPV4="$(ipv4_only)"
  IPV4_CIDR="$IPV4_ADDRESS"
  IPV6_CIDR="${IPV6_ADDRESS:-}"
  VIP="$(effective_vip)"
  : "${IPV6_LISTEN_80:=}"
  : "${IPV6_LISTEN_443:=}"
  : "${IPV6_LISTEN_80_DEFAULT:=}"
  : "${IPV6_LISTEN_443_DEFAULT:=}"
  : "${PORTAL_CERT:=/etc/nginx/ssl/portal.crt}"
  : "${PORTAL_KEY:=/etc/nginx/ssl/portal.key}"
  : "${MGMT_ALLOW:=}"
  : "${CLIENT_CIDRS_JSON:=[]}"

  # Substituição segura linha a linha das chaves conhecidas
  local keys=(
    COMPANY_NAME DNS_FQDN HOSTNAME LOGO_FILE BRAND_PRIMARY BRAND_ACCENT
    SUPPORT_PHONE SUPPORT_URL SUPPORT_EMAIL BLOCK_LEGAL_TEXT
    IPV4 IPV4_CIDR IPV6_CIDR VIP
    IPV6_LISTEN_80 IPV6_LISTEN_443 IPV6_LISTEN_80_DEFAULT IPV6_LISTEN_443_DEFAULT
    PORTAL_CERT PORTAL_KEY MGMT_ALLOW CLIENT_CIDRS VRRP_ID VRRP_PRIORITY
    INTERFACE VIP_ADDRESS CLUSTER_PEER BGP_ASN BGP_ROUTER_ID BGP_VIP_PREFIX
  )
  local k v
  for k in "${keys[@]}"; do
    v="${!k:-}"
    content=${content//\{\{$k\}\}/$v}
  done
  printf '%s\n' "$content" >"$dst"
}

ensure_dirs() {
  mkdir -p "$STATE_DIR" "$SYNC_DIR" "$BRANDING_DIR" \
    /var/www/dns-portal /var/www/dns-blockpage /var/www/letsencrypt \
    /etc/nginx/ssl /etc/dns-appliance
}

technitium_token() {
  local login token
  login=$(curl -sS -X POST "http://127.0.0.1:5380/api/user/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "user=${ADMIN_USER}" \
    --data-urlencode "pass=${ADMIN_PASSWORD}" 2>/dev/null || true)
  token=$(printf '%s' "$login" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token') or d.get('response',{}).get('token',''))" 2>/dev/null || true)
  if [[ -z "$token" ]]; then
    curl -sS -X POST "http://127.0.0.1:5380/api/user/create" \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      --data-urlencode "user=${ADMIN_USER}" \
      --data-urlencode "pass=${ADMIN_PASSWORD}" >/dev/null 2>&1 || true
    login=$(curl -sS -X POST "http://127.0.0.1:5380/api/user/login" \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      --data-urlencode "user=${ADMIN_USER}" \
      --data-urlencode "pass=${ADMIN_PASSWORD}" 2>/dev/null || true)
    token=$(printf '%s' "$login" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token') or d.get('response',{}).get('token',''))" 2>/dev/null || true)
  fi
  printf '%s' "$token"
}

is_master() {
  if [[ "${DEPLOY_MODE}" != "cluster" ]]; then
    return 0
  fi
  if [[ -f /var/run/keepalived.state ]]; then
    grep -qi 'STATE=MASTER' /var/run/keepalived.state 2>/dev/null && return 0
    # fallback: arquivo state keepalived
  fi
  if ip -4 addr show | grep -q " $(effective_vip)/"; then
    return 0
  fi
  [[ "${CLUSTER_NODE}" == "node1" ]] && [[ -z "$(ip -4 addr show | grep " $(effective_vip)/" || true)" ]] && return 1
  [[ "${CLUSTER_NODE}" == "node1" ]]
}

cidrs_to_nginx_geo() {
  local cidrs="$1" c
  IFS=',' read -ra arr <<<"$cidrs"
  for c in "${arr[@]}"; do
    c=$(echo "$c" | xargs)
    [[ -n "$c" ]] && echo "    $c 1;"
  done
}
