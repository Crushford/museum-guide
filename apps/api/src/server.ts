import { app } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import {
  getUploadDir,
  verifyStorageWritable,
} from './lib/storage/storage-path';

const PORT = env.PORT;

if (require.main === module) {
  try {
    verifyStorageWritable();
    logger.info(`Upload dir ready: ${getUploadDir()}`);
  } catch (error) {
    logger.fatal(
      { err: error, uploadDir: getUploadDir() },
      'Upload storage init failed'
    );
    process.exit(1);
  }

  app.listen(PORT, () => {
    logger.info({ port: Number(PORT) }, 'API server listening');
  });
}

export { app };
