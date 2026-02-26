import { app } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

const PORT = env.PORT;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: Number(PORT) }, 'API server listening');
  });
}

export { app };
