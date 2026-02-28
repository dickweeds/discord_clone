#!/usr/bin/env bash
set -euo pipefail

# Require Docker Compose V2 >= 2.20
DC_VERSION=$(docker compose version --short 2>/dev/null || echo "0.0.0")
DC_MAJOR=$(echo "$DC_VERSION" | cut -d. -f1)
DC_MINOR=$(echo "$DC_VERSION" | cut -d. -f2)
if [ "$DC_MAJOR" -lt 2 ] || { [ "$DC_MAJOR" -eq 2 ] && [ "$DC_MINOR" -lt 20 ]; }; then
  echo "FATAL: Docker Compose V2 >= 2.20 required (found $DC_VERSION)"
  exit 1
fi

DEPLOY_DIR="/home/ubuntu/discord_clone"
DRAIN_TIMEOUT="${DRAIN_TIMEOUT:-30}"
IMAGE_TAG="${1:?Usage: deploy.sh <image-tag>}"
export IMAGE_TAG

cd "$DEPLOY_DIR"

# Fetch secrets from SSM into shell variables (scoped to this script's process only)
echo "Fetching secrets from SSM Parameter Store..."
JWT_ACCESS_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/JWT_ACCESS_SECRET" --with-decryption --query "Parameter.Value" --output text)
JWT_REFRESH_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/JWT_REFRESH_SECRET" --with-decryption --query "Parameter.Value" --output text)
TURN_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/TURN_SECRET" --with-decryption --query "Parameter.Value" --output text)
GROUP_ENCRYPTION_KEY=$(aws ssm get-parameter --name "/discord-clone/prod/GROUP_ENCRYPTION_KEY" --with-decryption --query "Parameter.Value" --output text)
DATABASE_URL=$(aws ssm get-parameter --name "/discord-clone/prod/DATABASE_URL" --with-decryption --query "Parameter.Value" --output text)
GHCR_TOKEN=$(aws ssm get-parameter --name "/discord-clone/prod/GHCR_TOKEN" --with-decryption --query "Parameter.Value" --output text)

# Authenticate with GHCR to pull private images
echo "$GHCR_TOKEN" | docker login ghcr.io -u AidenWoodside --password-stdin

# Pass secrets as environment overrides — Docker stores them in the container config
# No file on disk, no env_file directive needed
export JWT_ACCESS_SECRET JWT_REFRESH_SECRET TURN_SECRET GROUP_ENCRYPTION_KEY DATABASE_URL

# Template coturn config with TURN_SECRET from SSM
COTURN_TEMPLATE="$DEPLOY_DIR/docker/coturn/turnserver.prod.conf.template"
COTURN_CONF="$DEPLOY_DIR/docker/coturn/turnserver.prod.conf"
if [ -f "$COTURN_TEMPLATE" ]; then
  sed "s|static-auth-secret=.*|static-auth-secret=$TURN_SECRET|" "$COTURN_TEMPLATE" > "$COTURN_CONF"
fi

# 1. Determine active slot by inspecting running containers (not a file)
if docker compose ps app-blue --status running -q 2>/dev/null | grep -q .; then
  ACTIVE="blue"; ACTIVE_PORT=3001
  NEW="green"; NEW_PORT=3002
elif docker compose ps app-green --status running -q 2>/dev/null | grep -q .; then
  ACTIVE="green"; ACTIVE_PORT=3002
  NEW="blue"; NEW_PORT=3001
else
  echo "No active slot detected — cold start, defaulting to blue"
  ACTIVE="none"
  NEW="blue"; NEW_PORT=3001
fi
echo "Active: $ACTIVE -> Deploying: $NEW"

# 2. Pull only the target slot image
docker compose pull "app-$NEW"

# 3. Start new slot (no traffic routed yet — nginx still points at old slot)
docker compose --profile deploy up -d "app-$NEW"

# 4. Health check new slot
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$NEW_PORT/api/health" > /dev/null 2>&1; then
    echo "app-$NEW healthy (attempt $i)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "FAILED: app-$NEW unhealthy after 60s"
    docker compose stop "app-$NEW"
    exit 1
  fi
  sleep 2
done

# 5. Run database migrations on new slot against Supabase (old slot still serves traffic)
# Both slots can safely connect to Supabase concurrently — Postgres handles concurrent access.
if ! docker compose exec -T "app-$NEW" node dist/scripts/migrate.js 2>&1; then
  echo "FATAL: database migration failed on app-$NEW (Supabase)"
  docker compose stop "app-$NEW"
  exit 1
fi

# 6. Drain old slot — signal clients to reconnect
if [ "$ACTIVE" != "none" ]; then
  echo "Draining app-$ACTIVE (${DRAIN_TIMEOUT}s window)..."
  curl -sf -X POST -H "X-Drain-Token: $JWT_ACCESS_SECRET" \
    "http://127.0.0.1:$ACTIVE_PORT/api/drain" > /dev/null 2>&1 || true

  # Wait for connections to drain (poll every 2s, up to DRAIN_TIMEOUT)
  DRAIN_START=$(date +%s)
  while true; do
    ELAPSED=$(( $(date +%s) - DRAIN_START ))
    if [ "$ELAPSED" -ge "$DRAIN_TIMEOUT" ]; then
      echo "Drain timeout reached — proceeding with switchover"
      break
    fi
    CONNS=$(curl -sf -H "X-Drain-Token: $JWT_ACCESS_SECRET" \
      "http://127.0.0.1:$ACTIVE_PORT/api/drain" 2>/dev/null \
      | jq -r '.connections // "unknown"' 2>/dev/null || echo "unknown")
    if [ "$CONNS" = "0" ]; then
      echo "All connections drained"
      break
    fi
    echo "  $CONNS connections remaining (${ELAPSED}s elapsed)"
    sleep 2
  done
fi

# 7. Switch nginx upstream via template (not in-place sed)
NGINX_CONF="$DEPLOY_DIR/docker/nginx/nginx.conf"
NGINX_TEMPLATE="$DEPLOY_DIR/docker/nginx/nginx.conf.template"
cp "$NGINX_CONF" "$NGINX_CONF.bak"
sed "s/{{UPSTREAM}}/app-$NEW:$NEW_PORT/" "$NGINX_TEMPLATE" > "$NGINX_CONF"

# 8. Validate nginx config before reload
if ! docker compose exec -T nginx nginx -t 2>&1; then
  echo "FATAL: nginx config validation failed — restoring backup"
  cp "$NGINX_CONF.bak" "$NGINX_CONF"
  docker compose stop "app-$NEW"
  exit 1
fi

# 9. Reload nginx
if ! docker compose exec -T nginx nginx -s reload 2>&1; then
  echo "FATAL: nginx reload failed — restoring backup"
  cp "$NGINX_CONF.bak" "$NGINX_CONF"
  docker compose exec -T nginx nginx -s reload || true
  docker compose stop "app-$NEW"
  exit 1
fi

# 10. Post-switchover verification — verify nginx can reach new slot via Docker DNS
sleep 2
if ! docker compose exec -T nginx wget --spider -q "http://app-$NEW:$NEW_PORT/api/health" 2>&1; then
  echo "WARNING: post-switchover health check via nginx->app-$NEW failed — verify manually"
fi

# 11. Stop old slot
if [ "$ACTIVE" != "none" ]; then
  docker compose stop "app-$ACTIVE"
fi

# 12. Prune old Docker images (keep last 7 days)
docker image prune -af --filter "until=168h" 2>/dev/null || true

# 13. Cleanup
rm -f "$NGINX_CONF.bak"
echo "Deploy complete: app-$NEW ($IMAGE_TAG)"
