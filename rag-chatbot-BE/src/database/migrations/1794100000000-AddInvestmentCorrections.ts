import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvestmentCorrections1794100000000 implements MigrationInterface {
  name = 'AddInvestmentCorrections1794100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "investment_events" ADD COLUMN "supersedes_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_events" ADD CONSTRAINT "UQ_investment_event_supersedes" UNIQUE ("supersedes_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "investment_events" DROP CONSTRAINT "UQ_investment_event_supersedes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_events" DROP COLUMN "supersedes_id"`,
    );
  }
}
