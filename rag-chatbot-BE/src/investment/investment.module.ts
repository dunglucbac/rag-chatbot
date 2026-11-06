import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvestmentController } from './investment.controller';
import { InvestmentService } from './investment.service';
import { FinhayController } from './finhay/finhay.controller';
import { FinhayService } from './finhay/finhay.service';
import { ValuationService } from './finhay/valuation.service';
import { BudgetService } from './budget/budget.service';
import { BudgetController } from './budget/budget.controller';
import { InvestmentDocumentController } from './documents/document.controller';
import { InvestmentDocumentService } from './documents/document.service';
import { InvestmentEmbeddingService } from './documents/embedding.service';
import { ObjectStorageModule } from '../storage/object-storage.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';

@Module({
  imports: [AuthModule, ObjectStorageModule, VectorStoreModule],
  controllers: [
    InvestmentController,
    FinhayController,
    BudgetController,
    InvestmentDocumentController,
  ],
  providers: [
    InvestmentService,
    FinhayService,
    ValuationService,
    BudgetService,
    InvestmentDocumentService,
    InvestmentEmbeddingService,
  ],
})
export class InvestmentModule {}
