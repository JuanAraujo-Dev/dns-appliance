#!/bin/bash
# Gera ISO Ubuntu 24.04 Autoinstall com a DNS Appliance embutida.
# Execute em Linux (Debian/Ubuntu) com ~5GB livres.
#
# Uso:
#   sudo bash autoinstall/build-iso.sh
#   sudo bash autoinstall/build-iso.sh /caminho/ubuntu-24.04.x-live-server-amd64.iso
#
# Saída: dist/dns-appliance-ubuntu2404.iso
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="${WORKDIR:-/tmp/dns-iso-build}"
OUTDIR="$ROOT/dist"
OUT_ISO="$OUTDIR/dns-appliance-ubuntu2404.iso"
BASE_ISO="${1:-}"

need() { command -v "$1" >/dev/null || { echo "Instale: $1"; exit 1; }; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq xorriso isolinux syslinux-utils p7zip-full wget rsync genisoimage || true

need xorriso
need wget

mkdir -p "$OUTDIR" "$WORKDIR"
cd "$WORKDIR"
rm -rf iso extract
mkdir -p iso extract

if [[ -z "$BASE_ISO" ]]; then
  BASE_ISO="$WORKDIR/ubuntu-24.04-live-server-amd64.iso"
  if [[ ! -f "$BASE_ISO" ]]; then
    echo "Baixando Ubuntu 24.04 live-server..."
    wget -O "$BASE_ISO" \
      "https://releases.ubuntu.com/24.04/ubuntu-24.04.3-live-server-amd64.iso" \
      || wget -O "$BASE_ISO" \
      "https://cdimage.ubuntu.com/ubuntu-server/noble/daily-live/current/noble-live-server-amd64.iso"
  fi
fi

[[ -f "$BASE_ISO" ]] || { echo "ISO base não encontrada: $BASE_ISO"; exit 1; }

echo "Extraindo ISO base..."
7z x -oextract "$BASE_ISO" >/dev/null || xorriso -osirrox on -indev "$BASE_ISO" -extract / extract

# Copia árvore
rsync -a extract/ iso/

# Autoinstall + appliance payload
mkdir -p iso/nocloud iso/dns-appliance
cp -f "$ROOT/autoinstall/user-data" iso/nocloud/user-data
cp -f "$ROOT/autoinstall/meta-data" iso/nocloud/meta-data
# cloud-init exige user-data sem comentário quebrado — ok
rsync -a --exclude dist --exclude '.git' "$ROOT/" iso/dns-appliance/

# GRUB: autoinstall via nocloud na mídia
GRUB_CFG="iso/boot/grub/grub.cfg"
if [[ -f "$GRUB_CFG" ]]; then
  # Prefixa kernel params no menu principal
  if ! grep -q 'autoinstall' "$GRUB_CFG"; then
    sed -i 's|---|autoinstall ds=nocloud\\;s=/cdrom/nocloud/ ---|g' "$GRUB_CFG" || true
  fi
fi

# Também tenta isolinux
for f in iso/isolinux/txt.cfg iso/isolinux/isolinux.cfg; do
  if [[ -f "$f" ]] && ! grep -q autoinstall "$f"; then
    sed -i 's|---|autoinstall ds=nocloud;s=/cdrom/nocloud/ ---|g' "$f" || true
  fi
done

echo "Gerando ISO..."
# Volume ID típico Ubuntu
VOLID="JD-DNS-APP"
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
  iso/ 2>/dev/null \
|| xorriso -as mkisofs -r -V "$VOLID" -o "$OUT_ISO" -J -joliet-long iso/

ls -lh "$OUT_ISO"
echo
echo "ISO pronta: $OUT_ISO"
echo "No Proxmox: Datacenter → local → ISO Images → Upload"
echo "Crie VM → Boot ISO → instala Ubuntu automaticamente → wizard no console (TTY1)"
