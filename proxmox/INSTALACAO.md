# Instalar no Proxmox — DNS Appliance v2

Passo a passo completo: [README.md](../README.md).

## ISO

```bash
sudo bash autoinstall/build-iso.sh
# dist/dns-appliance-ubuntu2404-v2.0.0.iso
```

Upload → VM (2+ vCPU, 2–4 GB, ≥32 GB) → boot → remover ISO → `dns-firstboot`.

## Cluster (2 nós)

1. Node1: modo `cluster-node1`, defina VIP + secret + IP do node2  
2. Node2: modo `cluster-node2`, mesmo VIP/secret + IP do node1  
3. Clientes DNS → **VIP**  
4. Teste failover: `systemctl stop keepalived` no MASTER  

## Smoke

```bash
sudo bash /opt/dns-appliance-src/tests/smoke.sh
```
