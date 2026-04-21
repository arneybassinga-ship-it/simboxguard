#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Vérification de Docker / MySQL"
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose up -d mysql || true
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose up -d mysql || true
  else
    echo "Docker Compose non trouvé. Vérifie que MySQL tourne déjà sur le port 3310."
  fi
else
  echo "Docker non trouvé. Vérifie que MySQL tourne déjà sur le port 3310."
fi

echo "==> Démarrage du backend sur http://localhost:4001"
(
  cd "$ROOT_DIR/backend"
  PORT=4001 MYSQL_HOST=127.0.0.1 MYSQL_PORT=3310 npm start
) &
BACKEND_PID=$!

sleep 3

echo "==> Démarrage du frontend"
cd "$ROOT_DIR"
npm run dev

wait "$BACKEND_PID"
