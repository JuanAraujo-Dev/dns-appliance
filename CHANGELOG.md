# Changelog

## 2.0.0 — White-label ISP + HA/Anycast

- Fundação: install falha alto (sem `|| true`), ISO volume `DNS-APP`, VERSION pinada, logo SVG, health timer
- Segurança: `CLIENT_CIDRS` / `MGMT_CIDRS`, nftables fechado por padrão, admin lockdown, senha forte obrigatória, DNSSEC on
- HA: Keepalived VIP + `chk_dns`, sync MASTER→BACKUP (AES + agent :5389), modo BGP/FRR opcional
- Política: feeds StevenBlack → blocked zones, audit log, blockpage HTTP white-label no VIP
- Encrypted DNS: DoT :853 + DoH `/dns-query`
- Portal v2: sem CDN, charts-lite, token em sessionStorage/Authorization, DOM seguro, views Cluster/ACL/DoH
- QA: `tests/smoke.sh`, ISO `dns-appliance-ubuntu2404-vX.Y.Z.iso` + `.sha256`

## 1.0.0

- MVP Technitium + portal + blockpage + firstboot + ISO autoinstall
