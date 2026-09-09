# DNS Appliance

Appliance **DNS completa** para provedores ISP: Technitium DNS Server + portal de gestão + página de bloqueio + segurança, pronta para instalar no **Proxmox**.

No primeiro boot (ou via wizard depois) você altera:

- **IP** (IPv4/CIDR, gateway, IPv6 opcional)
- **Domínio** (FQDN do portal/admin)
- **Nome** do provedor (textos do portal e blockpage)
- **Imagem/logo** (PNG)

> A ISO (~3 GB) **não** fica neste repositório (limite do GitHub). Gere com o script abaixo ou use a instalação sem ISO.

---

## Índice

1. [O que está incluído](#1-o-que-está-incluído)
2. [Requisitos](#2-requisitos)
3. [Opção A — Gerar a ISO e instalar no Proxmox](#3-opção-a--gerar-a-iso-e-instalar-no-proxmox) *(recomendada)*
4. [Opção B — Ubuntu limpo + scripts (sem ISO)](#4-opção-b--ubuntu-limpo--scripts-sem-iso)
5. [Wizard de configuração](#5-wizard-de-configuração)
6. [Pós-instalação](#6-pós-instalação)
7. [Reconfigurar IP / domínio / nome / logo](#7-reconfigurar-ip--domínio--nome--logo)
8. [Portas e firewall](#8-portas-e-firewall)
9. [Credenciais](#9-credenciais)
10. [Estrutura do repositório](#10-estrutura-do-repositório)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. O que está incluído

| Componente | Função |
|------------|--------|
| **Technitium DNS Server** | DNS recursivo, bloqueio `CustomAddress` |
| **Query Logs (SQLite)** | Quem consultou o quê (até 30 dias / 1M registros) |
| **Nginx** | `/portal`, `/admin`, `/api`, redirect `/` → portal |
| **Portal web** | Dashboard, Logs, Top Clientes/Domínios, Bloqueios |
| **Página de bloqueio** | HTTP/HTTPS no IP do provedor |
| **nftables + Fail2ban** | Firewall básico + proteção SSH |
| **First-boot wizard** | IP, domínio, nome, logo, admin, Let's Encrypt |

---

## 2. Requisitos

### Na VM (Proxmox)

| Item | Mínimo | Recomendado |
|------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Disco | 32 GB | 50 GB+ (SSD) |
| Rede | bridge com IP do provedor | IP público + DNS apontando para ele |
| SO base (Opção B) | Ubuntu 24.04 LTS | — |

### Portas que precisam chegar na VM

| Porta | Uso |
|-------|-----|
| **53/udp + 53/tcp** | DNS recursivo (clientes) |
| **80/tcp** | HTTP + ACME (Let's Encrypt) |
| **443/tcp** | Portal / Admin HTTPS |
| **22/tcp** | SSH (protegido por Fail2ban) |

### Para gerar a ISO (Opção A)

- Máquina Linux (Ubuntu 22.04/24.04) com ~**5 GB** livres
- Pacotes: `xorriso`, `isolinux`/`syslinux`, `wget`/`curl`, `gzip`, `cpio` (o script tenta instalar o necessário)

---

## 3. Opção A — Gerar a ISO e instalar no Proxmox

### 3.1 Clonar este repositório

```bash
git clone https://github.com/JuanAraujo-Dev/dns-appliance.git
cd dns-appliance
```

### 3.2 Gerar a ISO

```bash
sudo bash autoinstall/build-iso.sh
```

Saída esperada:

```text
dist/dns-appliance-ubuntu2404.iso
```

### 3.3 Enviar a ISO para o Proxmox

Pelo painel web:

1. **Datacenter → Storage (ex.: local) → ISO Images → Upload**
2. Selecione `dns-appliance-ubuntu2404.iso`

Ou via SCP (no nó Proxmox):

```bash
scp dist/dns-appliance-ubuntu2404.iso root@PROXMOX:/var/lib/vz/template/iso/
```

### 3.4 Criar a VM

No Proxmox → **Create VM**:

1. **General:** nome (ex.: `dns01`), ID livre  
2. **OS:** Linux 6.x / Ubuntu 24.04 — ISO: `dns-appliance-ubuntu2404.iso`  
3. **System:** defaults (QEMU Agent opcional)  
4. **Disks:** ≥ 32 GB, preferencialmente em storage SSD  
5. **CPU:** ≥ 2 sockets/cores  
6. **Memory:** ≥ 2048 MB (4096 recomendado)  
7. **Network:** bridge do provedor (`vmbr0` etc.), modelo VirtIO  
8. Confirme e **Start**

### 3.5 Instalação automática

- A VM inicia pela ISO e o **Ubuntu Autoinstall** roda sem perguntas.  
- Aguarde o reboot.  
- **Importante:** depois de instalado, edite a VM → **Options → Boot Order** e **remova a ISO** (ou desmarque) para não reinstalar.

### 3.6 Wizard no console

1. Abra **Console** (noVNC / xterm.js) da VM.  
2. Login inicial do SO: usuário `dnsadmin` / senha `Mudar@123` (troque no wizard).  
3. O first-boot wizard deve iniciar sozinho; se não:

```bash
sudo dns-firstboot
```

Preencha:

| Campo | Exemplo |
|-------|---------|
| Nome do provedor | `MeuProvedor Telecom` |
| Domínio FQDN | `dns01.meuprovedor.com.br` |
| IP/CIDR | `203.0.113.10/24` |
| Gateway | `203.0.113.1` |
| IPv6 (opcional) | conforme o provedor |
| Usuário admin | `admin` |
| Senha admin | senha forte |
| Logo PNG | caminho do arquivo (ex.: `/tmp/logo.png`) |
| Let's Encrypt | sim/não (precisa FQDN apontando para o IP) |

### 3.7 DNS externo

No painel DNS do domínio do provedor, crie um registro **A** (e **AAAA** se tiver IPv6):

```text
dns01.meuprovedor.com.br  →  IP_DA_VM
```

### 3.8 Acessar

- Portal: `https://dns01.meuprovedor.com.br/portal/`  
- Admin Technitium: `https://dns01.meuprovedor.com.br/admin/`  
- API (via Nginx): `https://dns01.meuprovedor.com.br/api/`  

Aponte os clientes (resolvers) para o **IP da VM** na porta **53**.

---

## 4. Opção B — Ubuntu limpo + scripts (sem ISO)

Útil se você já tem template Ubuntu 24.04 no Proxmox.

### 4.1 Criar VM Ubuntu 24.04

Instale Ubuntu Server 24.04 normalmente (ou cloud-init). Garanta rede e SSH.

### 4.2 Copiar o projeto e instalar

Do seu PC (com o clone do repo):

```bash
scp -r dns-appliance root@IP_DA_VM:/opt/dns-appliance-src
ssh root@IP_DA_VM
cd /opt/dns-appliance-src
bash install/install-all.sh
dns-firstboot
```

Ou só com git na VM:

```bash
apt update && apt install -y git
git clone https://github.com/JuanAraujo-Dev/dns-appliance.git /opt/dns-appliance-src
bash /opt/dns-appliance-src/install/install-all.sh
dns-firstboot
```

Siga o mesmo [wizard](#5-wizard-de-configuração) e o [DNS externo](#37-dns-externo).

---

## 5. Wizard de configuração

O wizard grava `/etc/dns-appliance.env` e aplica:

- Hostname / FQDN  
- Endereço de rede  
- Branding (nome + logo) no portal e na blockpage  
- Nginx (vhosts portal + blockpage)  
- Conta admin Technitium  
- Bloqueio `CustomAddress` apontando para o IP da página de bloqueio  
- Certificado Let's Encrypt (se habilitado)

Comandos:

```bash
dns-firstboot              # primeira vez / interativo
dns-firstboot --force      # repetir wizard completo
dns-apply-config           # reaplica a partir do .env atual
```

Arquivo de exemplo no repo: [`config/appliance.env.example`](config/appliance.env.example).

---

## 6. Pós-instalação

Checklist rápido:

1. [ ] Trocar senha do usuário `dnsadmin` (SO)  
2. [ ] Confirmar portal em `/portal/` e admin em `/admin/`  
3. [ ] Testar DNS: `dig @IP_DA_VM google.com`  
4. [ ] Bloquear um domínio de teste no portal → **Bloqueios**  
5. [ ] Confirmar que o cliente recebe a página de bloqueio  
6. [ ] Revisar Fail2ban: `fail2ban-client status sshd`  
7. [ ] Backup do `/etc/dns-appliance.env` e do volume de dados do Technitium  

---

## 7. Reconfigurar IP / domínio / nome / logo

### Wizard completo de novo

```bash
sudo dns-firstboot --force
```

### Só editar e reaplicar

```bash
sudo nano /etc/dns-appliance.env
sudo dns-apply-config
```

### Só trocar o logo

```bash
sudo cp /caminho/novo-logo.png /opt/dns-appliance/branding/logo.png
sudo dns-apply-config
```

Atualize o registro DNS externo se mudar o IP ou o FQDN.

---

## 8. Portas e firewall

- **nftables** libera 22, 53, 80, 443 (e o necessário para DNS).  
- **Technitium** escuta API em `127.0.0.1:5380` — **não** exponha essa porta; use só via Nginx `/admin` e `/api`.  
- **Fail2ban** protege SSH contra força bruta.

Se o provedor tiver firewall externo (painel/cloud), libere as mesmas portas até a VM.

---

## 9. Credenciais

| Onde | Usuário | Senha |
|------|---------|-------|
| SO (instalação via ISO) | `dnsadmin` | `Mudar@123` *(trocar no wizard)* |
| Portal / Technitium | definida no wizard | definida no wizard |

**Troque todas as senhas no primeiro acesso.** Não publique senhas reais em issues ou forks.

---

## 10. Estrutura do repositório

```text
dns-appliance/
├── autoinstall/          # user-data + build-iso.sh → gera a ISO
├── config/               # appliance.env.example
├── firstboot/            # unit systemd do wizard
├── install/              # 01-base … 04-security + install-all.sh
├── overlay/              # portal, blockpage, bins (dns-*)
├── templates/            # nginx portal/blockpage
├── proxmox/INSTALACAO.md # resumo Proxmox
├── pack.sh               # empacota tar.gz leve (sem ISO)
├── VERSION
└── README.md             # este passo a passo
```

Pacote leve (sem ISO):

```bash
bash pack.sh
# → dist/dns-appliance-VERSION.tar.gz
```

---

## 11. Troubleshooting

| Problema | O que verificar |
|----------|-----------------|
| ISO reinstala em loop | Remova a ISO do Boot Order da VM |
| Wizard não abre | `sudo systemctl status dns-firstboot`; `sudo dns-firstboot` |
| Portal 502 | `systemctl status dns`; Nginx → Technitium `127.0.0.1:5380` |
| Sem HTTPS / LE falha | FQDN aponta para o IP? Porta 80 aberta? |
| DNS não responde | `ss -ulnp \| grep :53`; firewall do provedor liberando 53? |
| Logo não aparece | PNG em `/opt/dns-appliance/branding/logo.png` + `dns-apply-config` |
| Título “blocked” / CSS antigo | Hard refresh (Ctrl+Shift+R) no navegador |

Logs úteis:

```bash
journalctl -u dns -u nginx -u dns-firstboot -e
tail -f /var/log/nginx/error.log
```

---

## Licença / uso

Uso interno para provedores. Ajuste branding, senhas e certificados antes de produção.

Se abrir issue ou PR, descreva o ambiente (Proxmox versão, Ubuntu, se usou ISO ou Opção B).
