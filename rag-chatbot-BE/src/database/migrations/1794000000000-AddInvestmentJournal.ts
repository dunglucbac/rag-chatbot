import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvestmentJournal1794000000000 implements MigrationInterface {
  name = 'AddInvestmentJournal1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "investment_stocks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "symbol" character varying(10) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_investment_stocks" PRIMARY KEY ("id"), CONSTRAINT "UQ_investment_stock_owner_symbol" UNIQUE ("user_id", "symbol"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "stock_id" uuid NOT NULL, "request_id" character varying NOT NULL, "type" character varying(20) NOT NULL, "occurred_on" date NOT NULL, "details" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_investment_events" PRIMARY KEY ("id"), CONSTRAINT "UQ_investment_event_request" UNIQUE ("user_id", "request_id"), CONSTRAINT "FK_investment_event_stock" FOREIGN KEY ("stock_id") REFERENCES "investment_stocks"("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_investment_events_owner_stock_date" ON "investment_events" ("user_id", "stock_id", "occurred_on", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "investment_events"`);
    await queryRunner.query(`DROP TABLE "investment_stocks"`);
  }
}
