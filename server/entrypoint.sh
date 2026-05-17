#!/bin/sh
set -e

CONFIG=/app/config/kast.toml

# ── Ensure data directories exist and are writable ─────────────────────────
# Named volumes created by Docker get the base image permissions (777), but
# bind mounts (docker-compose) inherit the host's ownership. Attempt to fix
# permissions and warn if a directory is still not writable.
for d in data/music data/hls data/mounts data/playlists; do
    mkdir -p "/app/$d" 2>/dev/null || true
    chmod 777 "/app/$d" 2>/dev/null || true
    if [ ! -w "/app/$d" ]; then
        echo "[kast] WARNING: /app/$d is not writable!"
        echo "[kast]   If you are using bind mounts, run on the host:"
        echo "[kast]     chmod 777 $(pwd)/$d"
        echo "[kast]   or match the container uid (1001) to the host directory owner."
    fi
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

exec "$@"
