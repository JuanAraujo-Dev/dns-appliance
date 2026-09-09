#!/bin/bash
# Empacota o projeto em .tar.gz para copiar ao builder / Proxmox
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VER=$(tr -d '\r\n' < "$ROOT/VERSION" 2>/dev/null || echo "1.0.0")
OUT="$ROOT/dist/jd-dns-appliance-${VER}.tar.gz"
mkdir -p "$ROOT/dist"
tar -C "$(dirname "$ROOT")" \
  --exclude='jd-dns-appliance/dist' \
  --exclude='jd-dns-appliance/.git' \
  -czf "$OUT" "$(basename "$ROOT")"
ls -lh "$OUT"
echo "Pacote: $OUT"
