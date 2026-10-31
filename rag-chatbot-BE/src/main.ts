import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';

function ensureStorageDirs() {
  const dirs = [path.join(__dirname, '..', 'storage', 'uploads')];
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
}

async function bootstrap() {
  ensureStorageDirs();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(path.resolve(__dirname, '../../rag-chatbot-UI/public'));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors();
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
