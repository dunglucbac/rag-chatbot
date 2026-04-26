import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

function ensureStorageDirs() {
  const dirs = [path.join(process.cwd(), 'storage', 'uploads')];
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
}

async function bootstrap() {
  ensureStorageDirs();

  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
