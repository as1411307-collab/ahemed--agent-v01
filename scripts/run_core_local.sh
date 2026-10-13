#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/as1411307-collab/ahemed--agent-v01.git"
BRANCH="feature/llm-memory-tools"
DIR="ahemed--agent-v01"

if [ ! -d "$DIR" ]; then
  git clone "$REPO"
fi

cd "$DIR"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

npm ci

if [ -f "apps/core/.env.example" ] && [ ! -f "apps/core/.env" ]; then
  cp -n apps/core/.env.example apps/core/.env
fi

APP_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
if grep -q '^APP_TOKEN=' apps/core/.env 2>/dev/null; then
  if sed --version >/dev/null 2>&1; then
    sed -i "s/^APP_TOKEN=.*/APP_TOKEN=$APP_TOKEN/" apps/core/.env
  else
    sed -i '' "s/^APP_TOKEN=.*/APP_TOKEN=$APP_TOKEN/" apps/core/.env
  fi
else
  echo "APP_TOKEN=$APP_TOKEN" >> apps/core/.env
fi

echo "Wrote apps/core/.env with APP_TOKEN (keep this secret):"
echo "$APP_TOKEN"
echo "Edit apps/core/.env to add ANTHROPIC_API_KEY if you have one."

echo "Starting Core..."
npm run core
