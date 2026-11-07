import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvestmentDocuments1794400000000 implements MigrationInterface {
  name = 'AddInvestmentDocuments1794400000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "investment_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY, "user_id" varchar NOT NULL, "symbol" varchar(10) NOT NULL, "ingestion_job_id" varchar NOT NULL, "title" varchar(200) NOT NULL, "publication_date" date NOT NULL, "status" varchar(16) NOT NULL, "page_count" integer NOT NULL DEFAULT 0, "chunk_count" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_investment_document_source" UNIQUE ("user_id", "symbol", "ingestion_job_id"), CONSTRAINT "CHK_investment_document_status" CHECK ("status" IN ('indexing','ready','failed')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_investment_documents_owner_symbol" ON "investment_documents" ("user_id", "symbol", "publication_date")`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "investment_documents"`);
  }
}
