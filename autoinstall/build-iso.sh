#!/bin/bash
# Gera ISO Ubuntu 24.04 Autoinstall — DNS Appliance v2
# Uso: sudo bash autoinstall/build-iso.sh [/caminho/base.iso]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER=$(tr -d '\r\n' < "$ROOT/VERSION" 2>/dev/null || echo "2.0.0")
WORKDIR="${WORKDIR:-/tmp/dns-iso-build}"
OUTDIR="$ROOT/dist"
OUT_ISO="$OUTDIR/dns-appliance-ubuntu2404-v${VER}.iso"
BASE_ISO="${1:-}"
UBUNTU_ISO_URL="https://releases.ubuntu.com/24.04/ubuntu-24.04.3-live-server-amd64.iso"

need() { command -v "$1" >/dev/null || { echo "Instale: $1"; exit 1; }; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq xorriso isolinux syslinux-utils p7zip-full wget rsync genisoimage

need xorriso
need wget

# Vendor optional installers into overlay for offline-ish builds
bash "$ROOT/scripts/vendor-deps.sh" || true

mkdir -p "$OUTDIR" "$WORKDIR"
cd "$WORKDIR"
rm -rf iso extract
mkdir -p iso extract

if [[ -z "$BASE_ISO" ]]; then
  BASE_ISO="$WORKDIR/ubuntu-24.04-live-server-amd64.iso"
  if [[ ! -f "$BASE_ISO" ]]; then
    echo "Baixando Ubuntu 24.04 live-server..."
    wget -O "$BASE_ISO" "$UBUNTU_ISO_URL"
  fi
fi
[[ -f "$BASE_ISO" ]] || { echo "ISO base não encontrada: $BASE_ISO"; exit 1; }

# Checksum se disponível
if [[ -f "$ROOT/autoinstall/ubuntu-base.sha256" ]]; then
  (cd "$(dirname "$BASE_ISO")" && sha256sum -c "$ROOT/autoinstall/ubuntu-base.sha256") || {
    echo "WARN: checksum da ISO base não confere / não casou o nome — continuando com aviso" >&2
  }
fi

echo "Extraindo ISO base..."
7z x -oextract "$BASE_ISO" >/dev/null || xorriso -osirrox on -indev "$BASE_ISO" -extract / extract
rsync -a extract/ iso/

mkdir -p iso/nocloud iso/dns-appliance
cp -f "$ROOT/autoinstall/user-data" iso/nocloud/user-data
cp -f "$ROOT/autoinstall/meta-data" iso/nocloud/meta-data
rsync -a --exclude dist --exclude '.git' "$ROOT/" iso/dns-appliance/

GRUB_CFG="iso/boot/grub/grub.cfg"
if [[ -f "$GRUB_CFG" ]] && ! grep -q 'autoinstall' "$GRUB_CFG"; then
  sed -i 's|---|autoinstall ds=nocloud\\;s=/cdrom/nocloud/ ---|g' "$GRUB_CFG"
fi
for f in iso/isolinux/txt.cfg iso/isolinux/isolinux.cfg; do
  if [[ -f "$f" ]] && ! grep -q autoinstall "$f"; then
    sed -i 's|---|autoinstall ds=nocloud;s=/cdrom/nocloud/ ---|g' "$f"
  fi
done

VOLID="DNS-APP"
echo "Gerando ISO ($VOLID)..."
if [[ -f /usr/lib/grub/i386-pc/boot_hybrid.img ]]; then
  xorriso -as mkisofs \
    -r -V "$VOLID" \
    -o "$OUT_ISO" \
    -J -joliet-long \
    -b boot/grub/i386-pc/eltorito.img \
    -c boot.catalog \
    -no-emul-boot -boot-load-size 4 -boot-info-table \
    --grub2-boot-info \
    --grub2-mbr /usr/lib/grub/i386-pc/boot_hybrid.img \
    -eltorito-alt-boot \
    -e EFI/boot/bootx64.efi \
    -no-emul-boot \
    -isohybrid-gpt-basdat \
    iso/
else
  xorriso -as mkisofs -r -V "$VOLID" -o "$OUT_ISO" -J -joliet-long iso/
fi

(cd "$OUTDIR" && sha256sum "$(basename "$OUT_ISO")" > "$(basename "$OUT_ISO").sha256")
# symlink friendly name
ln -sfn "$(basename "$OUT_ISO")" "$OUTDIR/dns-appliance-ubuntu2404.iso"
ls -lh "$OUT_ISO" "$OUT_ISO.sha256"
echo "ISO pronta: $OUT_ISO"
