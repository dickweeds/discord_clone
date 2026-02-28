async function start(): Promise<void> {
  // Generate GROUP_ENCRYPTION_KEY before any modules read it
  if (!process.env.GROUP_ENCRYPTION_KEY) {
    const sodium = (await import('libsodium-wrappers')).default;
    await sodium.ready;
    const groupKey = sodium.crypto_secretbox_keygen();
    const groupKeyBase64 = sodium.to_base64(groupKey);
    process.env.GROUP_ENCRYPTION_KEY = groupKeyBase64;
    process.stderr.write(`\n  GROUP_ENCRYPTION_KEY=${groupKeyBase64}\n`);
    process.stderr.write('  Save this to your .env file. It will not be shown again.\n\n');
  }

  const { buildApp } = await import('./app.js');
  const { runMigrations } = await import('./db/migrate.js');
  const { runSeed } = await import('./db/seed.js');

  const PORT = parseInt(process.env.PORT || '3000', 10);
  const HOST = process.env.HOST || '0.0.0.0';

  const app = await buildApp();

  if (process.env.RUN_MIGRATIONS === 'true') {
    try {
      await runMigrations(app.migrate);
      app.log.info('Database migrations completed');
    } catch (err) {
      app.log.fatal({ err }, 'Migration failed — aborting startup');
      process.exit(1);
    }
  } else {
    app.log.info('RUN_MIGRATIONS not set — skipping migrations');
  }

  try {
    await runSeed(app.db, app.log);

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on ${HOST}:${PORT}`);

    const shutdown = async () => {
      app.log.info('SIGTERM received, shutting down gracefully...');
      await app.close();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
