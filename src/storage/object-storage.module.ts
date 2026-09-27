import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObjectStorageController } from './object-storage.controller';
import { ObjectStorageService } from './object-storage.service';

@Module({
  imports: [AuthModule],
  controllers: [ObjectStorageController],
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}
