#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Nettoyage des anciens processus ──────────────────────────────────────────
echo "==> Nettoyage des processus existants"
fuser -k 4000/tcp 2>/dev/null && echo "    Port 4000 libéré" || true
fuser -k 8080/tcp 2>/dev/null && echo "    Port 8080 libéré" || true
fuser -k 8081/tcp 2>/dev/null && echo "    Port 8081 libéré" || true
fuser -k 8082/tcp 2>/dev/null && echo "    Port 8082 libéré" || true
pkill -f "node server.js" 2>/dev/null && echo "    Ancien backend Node tué" || true
sleep 1

# ── Docker / MySQL ────────────────────────────────────────────────────────────
echo "==> Vérification de Docker / MySQL"
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose up -d mysql || true
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose up -d mysql || true
  else
    echo "Docker Compose non trouvé. Vérifie que MySQL tourne déjà sur le port 3306."
  fi
else
  echo "Docker non trouvé. Vérifie que MySQL tourne déjà sur le port 3306."
fi

# ── Backend ───────────────────────────────────────────────────────────────────
echo "==> Démarrage du backend sur http://localhost:4000"
(
  cd "$ROOT_DIR/backend"
  npm start
) &
BACKEND_PID=$!

sleep 3

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "==> Démarrage du frontend"
cd "$ROOT_DIR"
npm run dev

wait "$BACKEND_PID"