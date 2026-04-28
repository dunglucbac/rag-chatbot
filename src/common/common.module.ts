import { Module } from '@nestjs/common';
import { CommonDispatchService } from '@modules/common/common-dispatch.service';

@Module({
  providers: [CommonDispatchService],
  exports: [CommonDispatchService],
})
export class CommonModule {}
