#!/bin/sh
set -e

CONFIG=/app/config/kast.toml

# ── Ensure data directories exist and are writable ─────────────────────────
# Running as root at this point; chown to kast so named volumes (which copy
# image ownership on first creation) are always usable. chmod 777 keeps
# bind-mounted host directories writable regardless of host uid mismatch.
for d in config data data/music data/hls data/mounts data/playlists; do
    mkdir -p "/app/$d" 2>/dev/null || true
    chown -R kast:kast "/app/$d" 2>/dev/null || true
    chmod -R 777 "/app/$d" 2>/dev/null || true
done

# Create config from example on first run
if [ ! -f "$CONFIG" ]; then
    echo "[kast] No config found — creating from example..."
    cp /app/kast.example.toml "$CONFIG"
fi

# Replace a TOML string field value in-place.
set_toml_string() {
    local key="$1" val="$2"
    sed -i "s|^${key} *= *\"[^\"]*\"|${key} = \"${val}\"|" "$CONFIG"
}

# Auto-generate api_key if still at the default placeholder
if grep -q '"CHANGE_ME_BEFORE_PRODUCTION"' "$CONFIG"; then
    if [ -n "$KAST_API_KEY" ]; then
        GEN_KEY="$KAST_API_KEY"
    else
        GEN_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
        echo "[kast] =================================================="
        echo "[kast]  Generated API key: $GEN_KEY"
        echo "[kast]  Use for external API access:"
        echo "[kast]  curl -H 'Authorization: Bearer $GEN_KEY' ..."
        echo "[kast]  Dashboard login uses username + password instead."
        echo "[kast] =================================================="
    fi
    set_toml_string "api_key" "$GEN_KEY"
fi

# Auto-generate jwt_secret if empty
if grep -qE '^jwt_secret = ""' "$CONFIG"; then
    if [ -n "$KAST_JWT_SECRET" ]; then
        GEN_JWT="$KAST_JWT_SECRET"
    else
        GEN_JWT=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    fi
    set_toml_string "jwt_secret" "$GEN_JWT"
fi

# Apply optional env var overrides
if [ -n "$KAST_PUBLIC_URL" ]; then
    set_toml_string "public_url" "$KAST_PUBLIC_URL"
fi

if [ -n "$KAST_CORS_ORIGINS" ]; then
    sed -i "s|^cors_origins = \[.*\]|cors_origins = [\"${KAST_CORS_ORIGINS}\"]|" "$CONFIG"
fi

if [ -n "$KAST_TRUST_PROXY" ]; then
    sed -i "s|^trust_proxy = false|trust_proxy = true|" "$CONFIG"
fi

if [ "$KAST_SSL_ENABLED" = "true" ]; then
    sed -i "s|^enabled = false|enabled = true|" "$CONFIG"
fi

if [ -n "$KAST_SSL_CERT_FILE" ]; then
    set_toml_string "cert_file" "$KAST_SSL_CERT_FILE"
fi

if [ -n "$KAST_SSL_KEY_FILE" ]; then
    set_toml_string "key_file" "$KAST_SSL_KEY_FILE"
fi

if [ -n "$KAST_SSL_DOMAINS" ]; then
    DOMAIN_ARRAY=$(python3 -c "import sys, json; print(json.dumps([x.strip() for x in sys.argv[1].split(',')]))" "$KAST_SSL_DOMAINS")
    sed -i "s|^domains = \[.*\]|domains = ${DOMAIN_ARRAY}|" "$CONFIG"
fi

if [ -n "$KAST_WEBRTC_NAT_IPS" ]; then
    NAT_ARRAY=$(python3 -c "import sys, json; print(json.dumps([x.strip() for x in sys.argv[1].split(',')]))" "$KAST_WEBRTC_NAT_IPS")
    sed -i "s|^nat_ips = \[.*\]|nat_ips = ${NAT_ARRAY}|" "$CONFIG"
fi

if [ -n "$KAST_WEBRTC_UDP_PORT_MIN" ]; then
    sed -i "s|^udp_port_min = .*|udp_port_min = ${KAST_WEBRTC_UDP_PORT_MIN}|" "$CONFIG"
fi

if [ -n "$KAST_WEBRTC_UDP_PORT_MAX" ]; then
    sed -i "s|^udp_port_max = .*|udp_port_max = ${KAST_WEBRTC_UDP_PORT_MAX}|" "$CONFIG"
fi

# Drop to non-root user and start the server.
exec su-exec kast:1001 "$@"
