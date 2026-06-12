import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET manquant — définissez-le dans les variables d'environnement");
}

import { waitForDb } from './db.js';
import { ensureDatabaseSchema } from './lib/audit.js';
import { jwtMiddleware } from './middleware/auth.js';

import authRouter      from './routes/auth.js';
import cdrRouter       from './routes/cdr.js';
import simboxRouter    from './routes/simbox.js';
import rapportsRouter  from './routes/rapports.js';
import blocageRouter   from './routes/blocage.js';
import sanctionsRouter from './routes/sanctions.js';
import usersRouter     from './routes/users.js';
import auditRouter     from './routes/audit.js';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(jwtMiddleware);

app.use(authRouter);
app.use(cdrRouter);
app.use(simboxRouter);
app.use(rapportsRouter);
app.use(blocageRouter);
app.use(sanctionsRouter);
app.use(usersRouter);
app.use(auditRouter);

const port = process.env.PORT || 4000;

waitForDb()
  .then(() => ensureDatabaseSchema())
  .then(() => {
    app.listen(port, () => console.log(`Serveur démarré sur http://localhost:${port}`));
  })
  .catch((err) => {
    console.error('[SCHEMA INIT ERROR]', err);
    process.exit(1);
  });
