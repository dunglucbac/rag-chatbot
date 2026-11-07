import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { GoogleAuthGuard } from '../../auth/google-auth.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { BudgetService } from './budget.service';

@Controller('investments/budget')
@UseGuards(GoogleAuthGuard)
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}
  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.budget.status(user.id);
  }
}
