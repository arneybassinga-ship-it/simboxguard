# Système de Détection de Fraude Télécom

Application web full-stack de détection de fraude SimBox / analyse CDR, développée dans le cadre d'un projet de soutenance.

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Base de données | MySQL 8.0 |
| Conteneurisation | Docker Compose |

## Prérequis

- [Node.js](https://nodejs.org/) >= 18
- [Docker](https://www.docker.com/) + Docker Compose
- npm ou pnpm

## Démarrage rapide

### 1. Variables d'environnement

```bash
# Backend
cp backend/.env.example backend/.env
# Éditez backend/.env avec vos valeurs

# Frontend (optionnel — par défaut http://localhost:4000)
cp .env.local.example .env.local
```

### 2. Démarrer MySQL via Docker

```bash
docker compose up -d mysql
```

MySQL est exposé sur le **port 3311** de l'hôte (port interne 3306).

### 3. Démarrer le backend

```bash
cd backend
npm install
npm start
```

Le backend démarre sur `http://localhost:4000`.

### 4. Démarrer le frontend

```bash
# à la racine du projet
pnpm install   # ou npm install
pnpm dev       # ou npm run dev
```

Le frontend démarre sur `http://localhost:8080`.

### Script tout-en-un

```bash
chmod +x start-project.sh
./start-project.sh
```

## Rôles utilisateurs

| Rôle | Description |
|------|-------------|
| `agent_mtn` / `agent_airtel` | Import et analyse des CDR |
| `analyste_fraude` | Validation des SIM suspectes, génération de rapports |
| `arpce` | Réception des rapports, émission d'ordres de blocage, sanctions |

## Structure du projet

```
.
├── backend/          # API Express + MySQL
│   ├── server.js     # Point d'entrée du serveur
│   ├── init.sql      # Schéma de base de données
│   ├── Dockerfile
│   └── .env.example
├── src/              # Frontend React
│   ├── pages/        # Pages par rôle
│   ├── components/   # Composants réutilisables
│   └── types/        # Types TypeScript
├── data/             # Fichiers de données de test
├── docker-compose.yml
└── start-project.sh  # Script de démarrage
```

## API principales

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/cdr/upload` | Import d'un fichier CDR |
| POST | `/api/cdr/agreger` | Agrégation et analyse par SIM |
| POST | `/api/cdr/detecter-simbox` | Détection de groupes SimBox |
| PATCH | `/api/cdr/analyses/:id` | Valider / refuser une SIM suspecte |
| POST | `/api/rapports/envoyer-arpce` | Envoyer un rapport à l'ARPCE |
| POST | `/api/ordres/bloquer` | Émettre un ordre de blocage |
| GET | `/api/audit` | Journal d'audit (max 500 entrées par page) |

## Données de test

Un fichier CDR de démonstration est disponible dans `data/cdr_mtn_test.csv`.
