#!/usr/bin/env bash
# One-time setup for the m300-backend app directory on the Hostinger VPS.
# Run once, manually, as root (or via sudo), before the first CD deploy.
#
# This VPS already runs several other stacks (docker ps will show them) -
# this script does NOT touch anything of theirs. It only:
#   1. Confirms Docker is installed (installs it if this is actually a
#      fresh box - a no-op if Docker is already there, as it is here).
#   2. Creates /opt/m300-backend with staging/ and production/
#      subdirectories, owned by the deploy user.
# It does NOT install nginx/Caddy - this box's existing host-level reverse
# proxy (whatever fronts the other stacks' :80xx ports) is expected to
# handle TLS/domain routing; see the note this script prints at the end.
#
# Usage: ssh into the VPS, then: bash vps-bootstrap.sh

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-m300_user}"
APP_DIR="/opt/m300-backend"

if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker Engine + Compose plugin"
  curl -fsSL https://get.docker.com | sh
else
  echo "==> Docker already installed, skipping"
fi

echo "==> Creating deploy user (no password login, docker group)"
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

echo "==> Creating app directories"
mkdir -p "$APP_DIR/staging" "$APP_DIR/production"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

cat <<EOF

Bootstrap complete. Remaining manual steps:

1. Add the deploy user's public key to ~$DEPLOY_USER/.ssh/authorized_keys,
   and put the matching private key into the DEPLOY_SSH_PRIVATE_KEY GitHub
   secret.
2. Configure the per-environment secrets in GitHub under Settings ->
   Environments -> staging / production (see .env.github.example).
3. On this box's existing reverse proxy (whatever currently routes the
   other :80xx services - check for a host-level nginx config, since no
   container here binds :80/:443), add a server block per environment:
     api-staging.<yourdomain>  -> proxy_pass http://127.0.0.1:8099
     api.<yourdomain>          -> proxy_pass http://127.0.0.1:8100
   (8099/8100 are free as of the last "docker ps" audit on this box -
   double check nothing new has claimed them before the first deploy.)
4. Push to the 'staging' branch (or tag a release, e.g. v0.1.0) to trigger
   .github/workflows/deploy.yml - it creates $APP_DIR/<env>/.env itself,
   no manual .env file needed here.
EOF
