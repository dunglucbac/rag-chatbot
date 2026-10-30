import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssociateReceiptsWithIngestionJobs1778130000000 implements MigrationInterface {
  name = 'AssociateReceiptsWithIngestionJobs1778130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD "ingestion_job_id" character varying`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_ingestion_job_id" ON "receipts" ("ingestion_job_id") WHERE "ingestion_job_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_receipts_ingestion_job_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN "ingestion_job_id"`,
    );
  }
}
