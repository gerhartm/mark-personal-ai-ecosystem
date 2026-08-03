# Coolify host-binding override

This Coolify custom Compose override restricts the dashboard, realtime, and terminal ports to server loopback. The explicit Compose `!override` tag replaces the base port list rather than appending to it. The V2 Cloudflare Tunnel can reach the services locally, while the Netcup public IP cannot reach ports `8000`, `6001`, or `6002`.

Authoritative server path: `/data/coolify/source/docker-compose.custom.yml`

Validate with the base files before applying:

```bash
cd /data/coolify/source
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.custom.yml config
```

Coolify's upgrade script automatically includes this custom file and does not overwrite it. Do not remove it until another protected path to the dashboard, realtime service, and terminal has been verified.
