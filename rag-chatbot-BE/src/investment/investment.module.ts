import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvestmentController } from './investment.controller';
import { InvestmentService } from './investment.service';

@Module({
  imports: [AuthModule],
  controllers: [InvestmentController],
  providers: [InvestmentService],
})
export class InvestmentModule {}
