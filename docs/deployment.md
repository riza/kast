# Production Deployment

Three deployment models are supported:

| | Option A · Cloudflare ★ | Option B · Let's Encrypt | Option C · Reverse Proxy |
|---|---|---|---|
| **TLS handled by** | Cloudflare edge | Kast (ACME auto-cert) | nginx / Caddy / Traefik |
| **Certificate** | Cloudflare Origin Cert (free, 15 yr) | Let's Encrypt (auto-renewed) | Your own / Caddy auto |
| **Port 443 open?** | Yes (Cloudflare → origin) | Yes (internet → origin) | Yes (internet → proxy) |
| **Setup effort** | Minimal | Minimal | Moderate |
| **`trust_proxy`** | `true` | `false` | `true` |
| **Best for** | Cloudflare-managed domains | VPS with direct internet access | Existing proxy infrastructure |

---

## Option A — Cloudflare + Origin Certificate ★

The simplest production setup for Cloudflare users. Cloudflare issues a free origin certificate valid for **15 years** — no renewal, no ACME challenges, no port 443 required on the firewall for cert issuance.

**1. Create a Cloudflare Origin Certificate**

In the Cloudflare dashboard: **SSL/TLS → Origin Server → Create Certificate**.
Accept the defaults (RSA, 15-year validity), add your hostname(s), and click Create.
Download both files:

- **Origin Certificate** → save as `certs/origin.pem`
- **Private Key** → save as `certs/origin.key`

Place them in a `certs/` directory at the root of the repo (next to `docker-compose.yml`).

**2. Configure your `.env`**

```bash
KAST_PUBLIC_URL=https://radio.example.com
KAST_CORS_ORIGINS=https://radio.example.com
KAST_SSL_ENABLED=true
KAST_SSL_CERT_FILE=/app/certs/origin.pem
KAST_SSL_KEY_FILE=/app/certs/origin.key
KAST_TRUST_PROXY=true
```

**3. Uncomment port 443 and the cert volume in `docker-compose.yml`**

```yaml
ports:
  - "8080:8080"
  - "443:443"       # ← uncomment
volumes:
  # ...
  - ./certs:/app/certs:ro   # ← uncomment
```

**4. Set Cloudflare SSL mode to Full (strict)**

In the Cloudflare dashboard: **SSL/TLS → Overview → Full (strict)**.

**5. Restart**

```bash
docker compose down && docker compose up -d
```

---

## Option B — Direct + Let's Encrypt

Kast obtains and renews TLS certificates automatically via ACME HTTP-01. Port 443 must be reachable from the internet; Cloudflare proxying (orange cloud) must be **off** for the domain.

In your `.env`:

```bash
KAST_PUBLIC_URL=https://radio.example.com
KAST_SSL_ENABLED=true
KAST_SSL_DOMAINS=radio.example.com
```

Uncomment port 443 in `docker-compose.yml`:

```yaml
ports:
  - "8080:8080"
  - "443:443"
```

Kast fetches the certificate on first startup and renews it automatically. The HTTP listener on `:8080` becomes a permanent redirect to HTTPS.

Alternatively, configure directly in `kast.toml`:

```toml
[ssl]
enabled   = true
auto_cert = true
domains   = ["radio.example.com"]
cert_dir  = "./data/certs"
```

---

## Option C — Reverse Proxy (nginx / Caddy)

Let your reverse proxy handle TLS termination and pass plain HTTP to Kast. Set `KAST_TRUST_PROXY=true` so Kast reads the real client IP from `X-Forwarded-For`.

**Caddy** (automatic HTTPS, simplest):

```caddyfile
radio.example.com {
    reverse_proxy localhost:8080
}
```

**nginx** (snippet):

```nginx
server {
    listen 443 ssl;
    server_name radio.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

In `.env`:

```bash
KAST_TRUST_PROXY=true
```
