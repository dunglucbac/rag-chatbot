import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '@repositories/base/base.repository';
import { Receipt } from '../entities/receipt.entity';

@Injectable()
export class ReceiptRepository extends BaseRepository<Receipt> {
  constructor(
    @InjectRepository(Receipt)
    private readonly receiptRepository: Repository<Receipt>,
  ) {
    super(receiptRepository);
  }
}
