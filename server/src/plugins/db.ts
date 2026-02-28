import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createDatabase, type AppDatabase } from '../db/connection.js';

export default fp(async (fastify: FastifyInstance) => {
  const { db, close, migrate } = createDatabase();
  fastify.decorate('db', db);
  fastify.decorate('migrate', migrate);
  fastify.log.info('Database connection established');

  let healthTimer: NodeJS.Timeout | undefined;
  const HEALTH_INTERVAL = 60_000; // 1 minute
  const MAX_HEALTH_FAILURES = 3;
  let consecutiveFailures = 0;

  fastify.addHook('onReady', async () => {
    // Startup check — fail-fast on misconfiguration (single attempt)
    await fastify.db.execute(sql`SELECT 1`);
    fastify.log.info('Database connection verified');

    // Only run periodic health checks against real Postgres (skip for PGlite in tests)
    if (process.env.DATABASE_URL) {
      healthTimer = setInterval(async () => {
        try {
          await fastify.db.execute(sql`SELECT 1`);
          consecutiveFailures = 0;
        } catch (err) {
          consecutiveFailures++;
          fastify.log.warn(
            { err, consecutiveFailures, maxFailures: MAX_HEALTH_FAILURES },
            'Database health check failed',
          );
          if (consecutiveFailures >= MAX_HEALTH_FAILURES) {
            fastify.log.fatal(
              'Database unreachable after %d consecutive checks — exiting',
              MAX_HEALTH_FAILURES,
            );
            process.exit(1);
          }
        }
      }, HEALTH_INTERVAL);
    }
  });

  fastify.addHook('onClose', async () => {
    if (healthTimer) clearInterval(healthTimer);
    await close();
  });
}, { name: 'db' });

// Type augmentation for FastifyInstance
declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase;
    migrate: (folder: string) => Promise<void>;
  }
}
