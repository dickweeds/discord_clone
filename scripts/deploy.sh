#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${1:?Usage: deploy.sh <image-tag>}"
export IMAGE_TAG
DEPLOY_DIR="/home/ubuntu/discord_clone"
cd "$DEPLOY_DIR"

# 1. Fetch secrets from SSM Parameter Store
echo "Fetching secrets from SSM Parameter Store..."
JWT_ACCESS_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/JWT_ACCESS_SECRET" --with-decryption --query "Parameter.Value" --output text)
JWT_REFRESH_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/JWT_REFRESH_SECRET" --with-decryption --query "Parameter.Value" --output text)
TURN_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/TURN_SECRET" --with-decryption --query "Parameter.Value" --output text)
GROUP_ENCRYPTION_KEY=$(aws ssm get-parameter --name "/discord-clone/prod/GROUP_ENCRYPTION_KEY" --with-decryption --query "Parameter.Value" --output text)
DATABASE_URL=$(aws ssm get-parameter --name "/discord-clone/prod/DATABASE_URL" --with-decryption --query "Parameter.Value" --output text)
GHCR_TOKEN=$(aws ssm get-parameter --name "/discord-clone/prod/GHCR_TOKEN" --with-decryption --query "Parameter.Value" --output text)

# 2. Authenticate with GHCR
echo "$GHCR_TOKEN" | docker login ghcr.io -u AidenWoodside --password-stdin

# 3. Export secrets as env vars for docker stack deploy
export JWT_ACCESS_SECRET JWT_REFRESH_SECRET GROUP_ENCRYPTION_KEY DATABASE_URL

# 4. Template coturn config with TURN_SECRET
COTURN_TEMPLATE="$DEPLOY_DIR/docker/coturn/turnserver.prod.conf.template"
COTURN_CONF="$DEPLOY_DIR/docker/coturn/turnserver.prod.conf"
if [ -f "$COTURN_TEMPLATE" ]; then
  sed "s|static-auth-secret=.*|static-auth-secret=$TURN_SECRET|" "$COTURN_TEMPLATE" > "$COTURN_CONF"
fi

# 5. Ensure coturn is running (outside Swarm — needs host networking)
docker compose -f docker-compose.coturn.yml up -d coturn

# 6. Init Swarm (idempotent)
docker swarm init 2>/dev/null || true

# 7. Deploy stack
echo "Deploying discord-clone stack with image tag: $IMAGE_TAG"
docker stack deploy -c docker-compose.yml --with-registry-auth --prune discord-clone

# 8. Wait for Swarm convergence (poll every 5s, up to 150s)
echo "Waiting for service convergence..."
for i in $(seq 1 30); do
  STATE=$(docker service inspect discord-clone_app --format '{{.UpdateStatus.State}}' 2>/dev/null || echo "")
  case "$STATE" in
    completed|"")
      echo "Service converged successfully"
      break
      ;;
    rollback_completed|paused)
      echo "FATAL: Service update failed (state: $STATE)"
      echo "=== Service logs ==="
      docker service logs --tail 50 discord-clone_app 2>&1 || true
      exit 1
      ;;
  esac
  if [ "$i" -eq 30 ]; then
    echo "FATAL: Timed out waiting for convergence (state: $STATE)"
    docker service logs --tail 50 discord-clone_app 2>&1 || true
    exit 1
  fi
  sleep 5
done

# 9. Run migrations
echo "Running database migrations..."
APP_CONTAINER=$(docker ps -q -f "name=discord-clone_app" --latest)
if [ -z "$APP_CONTAINER" ]; then
  echo "FATAL: No app container found"
  exit 1
fi
docker exec "$APP_CONTAINER" node server/dist/scripts/migrate.js

# 10. Prune old images (keep last 7 days)
docker image prune -af --filter "until=168h" 2>/dev/null || true

echo "Deploy complete: $IMAGE_TAG"
