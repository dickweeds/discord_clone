import { buildApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    runMigrations(app.db);
    app.log.info('Database migrations completed');

    await runSeed(app.db, app.log);
    app.log.info('Database seeding completed');

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
