#!/usr/bin/env bash
set -euo pipefail

echo "========================================"
echo "  Discord Clone — Production Setup"
echo "========================================"
echo ""

# 1. Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker is not installed. Install Docker first: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "ERROR: Docker Compose is not available. Install Docker Compose: https://docs.docker.com/compose/install/"
  exit 1
fi

echo "  Docker: $(docker --version)"
echo "  Docker Compose: $(docker compose version --short)"
echo ""

# Initialize Docker Swarm (idempotent — safe to run if already initialized)
echo "Initializing Docker Swarm..."
docker swarm init 2>/dev/null || echo "  Swarm already initialized"
echo ""

# 2. Idempotency — check if .env already exists
if [ -f .env ]; then
  echo "WARNING: .env file already exists."
  read -rp "Overwrite? (y/N): " OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
    echo "Keeping existing .env. Exiting."
    exit 0
  fi
fi

# 3. Prompt for configuration values
read -rp "Domain name (e.g., chat.example.com): " DOMAIN
read -rp "Email for Let's Encrypt certificates: " CERTBOT_EMAIL
read -rp "Server name (displayed to users): " SERVER_NAME
read -rp "GitHub Releases URL (for download links, or leave blank): " GITHUB_RELEASES_URL

# 4. Auto-detect public IP
echo ""
echo "Detecting public IP..."
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || echo "")
if [ -z "$PUBLIC_IP" ]; then
  echo "Could not auto-detect public IP."
  read -rp "Enter the server's public IP: " PUBLIC_IP
else
  echo "  Detected: $PUBLIC_IP"
  read -rp "Use this IP? (Y/n): " CONFIRM_IP
  if [[ "$CONFIRM_IP" =~ ^[Nn]$ ]]; then
    read -rp "Enter the server's public IP: " PUBLIC_IP
  fi
fi

# Detect private IP (for EC2 NAT traversal)
PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "$PUBLIC_IP")

# 5. Generate secrets
echo ""
echo "Generating secrets..."
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
TURN_SECRET=$(openssl rand -hex 32)

# 6. Create .env from .env.example
cp .env.example .env
chmod 600 .env

# 7. Populate .env with production values
sed -i.bak \
  -e "s|^NODE_ENV=.*|NODE_ENV=production|" \
  -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}|" \
  -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}|" \
  -e "s|^SERVER_NAME=.*|SERVER_NAME=${SERVER_NAME}|" \
  -e "s|^MEDIASOUP_ANNOUNCED_IP=.*|MEDIASOUP_ANNOUNCED_IP=${PUBLIC_IP}|" \
  -e "s|^TURN_HOST=.*|TURN_HOST=${PUBLIC_IP}|" \
  -e "s|^TURN_SECRET=.*|TURN_SECRET=${TURN_SECRET}|" \
  -e "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" \
  -e "s|^CERTBOT_EMAIL=.*|CERTBOT_EMAIL=${CERTBOT_EMAIL}|" \
  -e "s|^GITHUB_RELEASES_URL=.*|GITHUB_RELEASES_URL=${GITHUB_RELEASES_URL}|" \
  .env
rm -f .env.bak

echo "  .env configured"

# 8. Update coturn production config
COTURN_CONF="docker/coturn/turnserver.prod.conf"
if [ -f "$COTURN_CONF" ]; then
  sed -i.bak \
    -e "s|^realm=.*|realm=${DOMAIN}|" \
    -e "s|^static-auth-secret=.*|static-auth-secret=${TURN_SECRET}|" \
    -e "s|^#\{0,1\} *external-ip=.*|external-ip=${PUBLIC_IP}/${PRIVATE_IP}|" \
    "$COTURN_CONF"
  rm -f "${COTURN_CONF}.bak"
  echo "  coturn config updated"
fi

# 9. Update nginx.conf with domain (idempotent — safe to run multiple times)
NGINX_CONF="docker/nginx/nginx.conf"
if [ -f "$NGINX_CONF" ]; then
  sed -i.bak \
    -e "s|ssl_certificate /etc/letsencrypt/live/[^/]*/fullchain.pem;|ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;|" \
    -e "s|ssl_certificate_key /etc/letsencrypt/live/[^/]*/privkey.pem;|ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;|" \
    "$NGINX_CONF"
  rm -f "${NGINX_CONF}.bak"
  echo "  nginx config updated"
fi

# 10. Update landing page with GitHub Releases URL
LANDING_HTML="docker/nginx/landing/index.html"
if [ -f "$LANDING_HTML" ] && [ -n "$GITHUB_RELEASES_URL" ]; then
  sed -i.bak \
    -e "s|content=\"[^\"]*\" <!-- releases-url -->|content=\"${GITHUB_RELEASES_URL}\" <!-- releases-url -->|" \
    "$LANDING_HTML"
  rm -f "${LANDING_HTML}.bak"
  echo "  landing page updated"
fi

# 11. Create data directories
mkdir -p data/certs data/certbot-webroot data/downloads
echo "  data directories created"

# 12. Initial certificate generation (webroot mode via nginx)
# Standalone mode won't work with bridge networking (certbot has no published ports).
# Instead, start nginx with HTTP-only config, use webroot ACME challenge, then switch to TLS.
echo ""
echo "Generating initial TLS certificate..."

# Create a temporary HTTP-only nginx config for initial cert provisioning
TEMP_NGINX_CONF="docker/nginx/nginx-http-only.conf"
cat > "$TEMP_NGINX_CONF" << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Setting up TLS...';
        add_header Content-Type text/plain;
    }
}
NGINX_EOF

# Start a standalone nginx container for cert provisioning (not via compose — main file is a Swarm stack)
docker run -d --name setup-nginx \
  -v "$(pwd)/$TEMP_NGINX_CONF:/etc/nginx/conf.d/default.conf:ro" \
  -v "$(pwd)/data/certbot-webroot:/var/www/certbot" \
  -p 80:80 \
  nginx:1.27-alpine 2>/dev/null || true

# Run certbot in webroot mode
docker run --rm \
  -v "$(pwd)/data/certs:/etc/letsencrypt" \
  -v "$(pwd)/data/certbot-webroot:/var/www/certbot" \
  certbot/certbot:v3.1.0 certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --agree-tos \
  --email "$CERTBOT_EMAIL" \
  --non-interactive || {
    echo ""
    echo "WARNING: Certificate generation failed."
    echo "Make sure DNS for $DOMAIN points to this server and port 80 is open."
    echo "You can retry later with webroot mode after nginx is running."
  }

# Stop temporary nginx and clean up
docker stop setup-nginx 2>/dev/null || true
docker rm setup-nginx 2>/dev/null || true
rm -f "$TEMP_NGINX_CONF"

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Start coturn (runs outside Swarm — needs host networking):"
echo "  docker compose -f docker-compose.coturn.yml up -d"
echo ""
echo "Deploy the Swarm stack:"
echo "  docker stack deploy -c docker-compose.yml --with-registry-auth discord-clone"
echo ""
echo "View logs:"
echo "  docker service logs -f discord-clone_app"
echo ""
echo "Your server will be available at:"
echo "  https://${DOMAIN}"
echo ""
