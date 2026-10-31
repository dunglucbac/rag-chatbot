import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRejectedIngestionJobStatus1778580000000 implements MigrationInterface {
  name = 'AddRejectedIngestionJobStatus1778580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."ingestion_jobs_status_enum" ADD VALUE IF NOT EXISTS 'rejected'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "ingestion_jobs" SET "status" = 'failed' WHERE "status" = 'rejected'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."ingestion_jobs_status_enum" RENAME TO "ingestion_jobs_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ingestion_jobs_status_enum" AS ENUM('pending', 'processing', 'needs_review', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ALTER COLUMN "status" TYPE "public"."ingestion_jobs_status_enum" USING "status"::text::"public"."ingestion_jobs_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."ingestion_jobs_status_enum_old"`,
    );
  }
}
