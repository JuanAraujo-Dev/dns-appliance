#!/bin/bash
# Funções comuns da JD DNS Appliance
set -euo pipefail

APPLIANCE_ROOT="${APPLIANCE_ROOT:-/opt/jd-dns-appliance}"
ENV_FILE="${ENV_FILE:-/etc/jd-dns-appliance.env}"
OVERLAY_SRC="${OVERLAY_SRC:-$APPLIANCE_ROOT/overlay}"
TMPL_DIR="${TMPL_DIR:-$APPLIANCE_ROOT/templates}"
STATE_DIR="/var/lib/jd-dns-appliance"
LOG_FILE="/var/log/jd-dns-appliance.log"

log() { echo "[$(date -Is)] $*" | tee -a "$LOG_FILE"; }

die() { log "ERROR: $*"; exit 1; }

require_root() {
  [[ $EUID -eq 0 ]] || die "Execute como root"
}

load_env() {
  [[ -f "$ENV_FILE" ]] || die "Arquivo de config ausente: $ENV_FILE"
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  : "${COMPANY_NAME:?}"
  : "${DNS_FQDN:?}"
  : "${IPV4_ADDRESS:?}"
  : "${IPV4_GATEWAY:?}"
  : "${HOSTNAME:=dns01}"
  : "${ADMIN_USER:=admin}"
  : "${ADMIN_PASSWORD:=Mudar@123}"
  : "${LOGO_FILE:=/opt/jd-dns-appliance/branding/logo.png}"
  : "${ENABLE_LETSENCRYPT:=false}"
  : "${DNS_RESOLVERS:=1.1.1.1,8.8.8.8}"
  : "${QUERYLOG_MAX_DAYS:=30}"
  : "${QUERYLOG_MAX_RECORDS:=1000000}"
}

detect_iface() {
  if [[ -n "${INTERFACE:-}" ]]; then
    echo "$INTERFACE"
    return
  fi
  ip -o link show | awk -F': ' '$2 !~ /^(lo|docker|veth|br-|virbr)/ {print $2; exit}'
}

ipv4_only() {
  echo "${IPV4_ADDRESS%%/*}"
}

render_template() {
  local src="$1" dst="$2"
  local company domain ipv4 ipv4cidr ipv6 host logo
  company=$(printf '%s' "$COMPANY_NAME" | sed 's/[&\\/]/\\&/g')
  domain=$(printf '%s' "$DNS_FQDN" | sed 's/[&\\/]/\\&/g')
  ipv4=$(ipv4_only | sed 's/[&\\/]/\\&/g')
  ipv4cidr=$(printf '%s' "$IPV4_ADDRESS" | sed 's/[&\\/]/\\&/g')
  ipv6=$(printf '%s' "${IPV6_ADDRESS:-}" | sed 's/[&\\/]/\\&/g')
  host=$(printf '%s' "$HOSTNAME" | sed 's/[&\\/]/\\&/g')
  logo=$(printf '%s' "${LOGO_FILE}" | sed 's/[&\\/]/\\&/g')
  mkdir -p "$(dirname "$dst")"
  sed \
    -e "s|{{COMPANY_NAME}}|$company|g" \
    -e "s|{{DNS_FQDN}}|$domain|g" \
    -e "s|{{IPV4}}|$ipv4|g" \
    -e "s|{{IPV4_CIDR}}|$ipv4cidr|g" \
    -e "s|{{IPV6_CIDR}}|$ipv6|g" \
    -e "s|{{HOSTNAME}}|$host|g" \
    -e "s|{{LOGO_FILE}}|$logo|g" \
    "$src" > "$dst"
}

ensure_dirs() {
  mkdir -p "$STATE_DIR" /var/www/dns-portal /var/www/jd-blockpage /var/www/letsencrypt \
    /etc/nginx/ssl /opt/jd-dns-appliance/branding
}
