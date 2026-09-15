import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/pool.js';

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  app.log.info(`Capsule API listening on :${config.apiPort}`);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — shutting down`);
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
