import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { chromeLoginManager } from './chromeLogin.js';
import { IS_PROD, SERVER_HOST, SERVER_PORT } from './config.js';
import { createApiRouter } from './routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', createApiRouter());

  // Serve built SPA in production mode
  const distDir = path.resolve(process.cwd(), 'dist');
  if (IS_PROD && fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isDirectRun) {
  const app = createApp();
  const server = app.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(
      `[newsmth-reader] listening on http://${SERVER_HOST}:${SERVER_PORT} (${IS_PROD ? 'prod' : 'dev'})`,
    );
  });

  const gracefulExit = () => {
    chromeLoginManager.shutdown();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);
}
