# Instalar no Proxmox

O passo a passo **completo** (gerar ISO, criar VM, wizard, DNS, reconfigurar, troubleshooting) está no [README.md](../README.md) na raiz do repositório.

## Atalho — Opção A (ISO)

1. `sudo bash autoinstall/build-iso.sh` → `dist/dns-appliance-ubuntu2404.iso`
2. Upload da ISO no Proxmox → Create VM (2+ vCPU, 2–4 GB RAM, ≥32 GB disco)
3. Boot → Autoinstall → **remover ISO do Boot Order**
4. Console → wizard (nome, FQDN, IP, logo, admin)
5. Apontar DNS A/AAAA do FQDN → IP da VM
6. Acessar `https://FQDN/portal/` e `https://FQDN/admin/`

Login SO inicial (ISO): `dnsadmin` / `Mudar@123` — troque no wizard.

## Atalho — Opção B (sem ISO)

```bash
git clone https://github.com/JuanAraujo-Dev/dns-appliance.git /opt/dns-appliance-src
bash /opt/dns-appliance-src/install/install-all.sh
dns-firstboot
```

## Reconfigurar

```bash
dns-firstboot --force
# ou
nano /etc/dns-appliance.env && dns-apply-config
```
