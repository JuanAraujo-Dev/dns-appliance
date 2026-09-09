# DNS Appliance v2

Appliance **white-label** de DNS recursivo para provedores ISP — Technitium + portal + blockpage + **HA/Anycast**, instalável no Proxmox.

## Diferenciais

- **Não é open resolver** — só `CLIENT_CIDRS` consultam
- **HA active-active** — VIP Keepalived (padrão) ou BGP/FRR
- **White-label** — nome, cores, logo, FQDN, VIP, suporte, textos legais
- **Portal seguro offline** — sem CDN, sem token em links de UI, XSS mitigado
- **DoH / DoT**, DNSSEC validate, feeds de ameaça, blockpage no VIP
- **ISO reprodutível** — install falha se algo quebrar; artefato versionado + sha256

## Requisitos da VM (por nó)

| Item | Mínimo | Recomendado |
|------|--------|-------------|
| CPU | 2 vCPU | 4 |
| RAM | 2 GB | 4 GB |
| Disco | 32 GB | 50 GB+ SSD |
| Nós HA | 1 (standalone) | **2** |

Portas: **53/udp+tcp**, **853/tcp** (DoT), **80/443**, **22** (MGMT), **5389** (sync cluster).

## Instalação rápida (ISO)

```bash
git clone https://github.com/JuanAraujo-Dev/dns-appliance.git
cd dns-appliance
sudo bash autoinstall/build-iso.sh
# → dist/dns-appliance-ubuntu2404-v2.0.0.iso (+ .sha256)
```

1. Upload da ISO no Proxmox → Create VM → boot ISO  
2. Após install, **remova a ISO do Boot Order**  
3. Console TTY1 → `dns-firstboot` (standalone ou cluster-node1/2)  
4. Apontar FQDN (A/AAAA) e clientes para o **VIP** (ou IP do nó em standalone)  
5. Smoke: `sudo bash /opt/dns-appliance-src/tests/smoke.sh`

Login SO inicial da ISO: `dnsadmin` — **troque no wizard**.

## Wizard — o que configurar

- Nome, cores, logo, FQDN, IP do nó, gateway  
- `CLIENT_CIDRS` (quem consulta) e `MGMT_CIDRS` (quem acessa `/admin`)  
- Modo **standalone** ou **cluster** (VIP, peer, `CLUSTER_SECRET`, Keepalived ou BGP)  
- Admin forte, Let's Encrypt, DoH/DoT, feeds  

Reaplicar:

```bash
dns-firstboot --force
# ou
nano /etc/dns-appliance.env && dns-apply-config
```

## Cluster HA

```text
Clientes → VIP (Keepalived/VRRP ou BGP) → Nó1 / Nó2 (Technitium)
MASTER exporta política → BACKUP importa (dns-appliance-sync)
CustomAddress de bloqueio = VIP
```

Node1: prioridade VRRP alta. Node2: peer IP + mesmo VIP/secret.

## Sem ISO

```bash
git clone https://github.com/JuanAraujo-Dev/dns-appliance.git /opt/dns-appliance-src
bash /opt/dns-appliance-src/install/install-all.sh
dns-firstboot
```

## URLs

- Portal: `https://FQDN/portal/`  
- Admin: `https://FQDN/admin/` (somente MGMT)  
- DoH: `https://FQDN/dns-query`  
- DoT: `FQDN:853`  
- Health: `/portal/health.json`  

## Estrutura

```text
autoinstall/   ISO Ubuntu autoinstall
install/       01..05 + install-all.sh
overlay/       bins, portal, branding
templates/     nginx, nftables, portal/blockpage
firstboot/     systemd units/timers
tests/smoke.sh
scripts/vendor-deps.sh
```

## Segurança (checklist)

1. Senhas fortes (wizard rejeita defaults)  
2. `CLIENT_CIDRS` cobrindo só a rede do provedor  
3. `MGMT_CIDRS` restrito (NOC/VPN)  
4. Remover ISO do boot  
5. Rodar `tests/smoke.sh`  

Detalhes Proxmox: [proxmox/INSTALACAO.md](proxmox/INSTALACAO.md) · Changelog: [CHANGELOG.md](CHANGELOG.md)
