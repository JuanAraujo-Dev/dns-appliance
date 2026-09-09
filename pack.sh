#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VER=$(tr -d '\r\n' < "$ROOT/VERSION" 2>/dev/null || echo "2.0.0")
OUT="$ROOT/dist/dns-appliance-${VER}.tar.gz"
mkdir -p "$ROOT/dist"
tar -C "$(dirname "$ROOT")" \
  --exclude='dns-appliance/dist' \
  --exclude='jd-dns-appliance/dist' \
  --exclude='*/.git' \
  -czf "$OUT" "$(basename "$ROOT")"
ls -lh "$OUT"
echo "Pacote: $OUT"
