import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvestmentBudget1794300000000 implements MigrationInterface {
  name = 'AddInvestmentBudget1794300000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "investment_budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY, "user_id" varchar NOT NULL, "month" varchar(7) NOT NULL, "spent_micros" bigint NOT NULL DEFAULT 0, "reserved_micros" bigint NOT NULL DEFAULT 0, CONSTRAINT "UQ_investment_budget_month" UNIQUE ("user_id", "month"), CONSTRAINT "CHK_investment_budget_amounts" CHECK ("spent_micros" >= 0 AND "reserved_micros" >= 0))`,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_reservations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY, "user_id" varchar NOT NULL, "budget_id" uuid NOT NULL REFERENCES "investment_budgets"("id"), "request_id" varchar NOT NULL, "reserved_micros" bigint NOT NULL, "actual_micros" bigint, "status" varchar(16) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_investment_reservation_request" UNIQUE ("user_id", "request_id"), CONSTRAINT "CHK_investment_reservation_amounts" CHECK ("reserved_micros" > 0 AND ("actual_micros" IS NULL OR "actual_micros" >= 0)), CONSTRAINT "CHK_investment_reservation_status" CHECK ("status" IN ('pending','settled','released')))`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "investment_reservations"`);
    await queryRunner.query(`DROP TABLE "investment_budgets"`);
  }
}
