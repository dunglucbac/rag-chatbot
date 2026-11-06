import { DataSource } from 'typeorm';
import { AddInvestmentJournal1794000000000 } from '../database/migrations/1794000000000-AddInvestmentJournal';
import { InvestmentEvent } from './entities/investment-event.entity';
import { InvestmentStock } from './entities/investment-stock.entity';
import { InvestmentService } from './investment.service';

const url = process.env.INVESTMENT_TEST_DATABASE_URL;
if (url && new URL(url).pathname !== '/investment_journal_test') {
  throw new Error(
    'PostgreSQL investment tests require a disposable investment_journal_test database',
  );
}
const postgres = url ? describe : describe.skip;

postgres('investment PostgreSQL migration and concurrency', () => {
  let db: DataSource;
  let service: InvestmentService;

  beforeAll(async () => {
    db = await new DataSource({
      type: 'postgres',
      url,
      entities: [InvestmentStock, InvestmentEvent],
      migrations: [AddInvestmentJournal1794000000000],
      synchronize: false,
    }).initialize();
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.runMigrations();
    service = new InvestmentService(db);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.undoLastMigration();
      await db.destroy();
    }
  });

  it('preserves one event when identical requests race and isolates other users', async () => {
    const input = {
      requestId: '6e15685b-de2e-41e5-ab98-6091c8512a40',
      type: 'buy',
      occurredOn: '2025-11-06',
      shares: 500,
      priceVnd: '54000',
    };
    const result = await Promise.all(
      Array.from({ length: 5 }, () => service.record('alice', 'VCB', input)),
    );
    expect(result.filter((item) => !item.deduplicated)).toHaveLength(1);
    expect((await service.get('alice', 'VCB')).events).toHaveLength(1);
    expect(await service.list('bob')).toEqual([]);
    await service.record('bob', 'VCB', input);
    expect((await service.get('bob', 'VCB')).events).toHaveLength(1);
  });
});
