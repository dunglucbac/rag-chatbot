import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IngestionJobContractUpdate1777200000000 implements MigrationInterface {
  name = 'IngestionJobContractUpdate1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ingestion_jobs_file_type_enum" AS ENUM('pdf', 'image')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ingestion_jobs_classification_enum" AS ENUM('receipt', 'payment', 'document', 'unknown')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ingestion_jobs_status_enum" AS ENUM('pending', 'processing', 'needs_review', 'completed', 'failed')`,
    );

    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ADD "file_id" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ADD "user_id" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ADD "file_type" "public"."ingestion_jobs_file_type_enum" NOT NULL DEFAULT 'pdf'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ADD "classification" "public"."ingestion_jobs_classification_enum" NOT NULL DEFAULT 'unknown'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ADD "checksum_sha256" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ADD "correlation_id" text`,
    );

    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" DROP COLUMN "source_type"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."ingestion_jobs_source_type_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" DROP CONSTRAINT IF EXISTS "CHK_ingestion_jobs_status"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" ADD "source_type" "public"."ingestion_jobs_source_type_enum" NOT NULL DEFAULT 'pdf'`,
    );
    await queryRunner.query(
      `UPDATE "ingestion_jobs" SET "source_type" = 'pdf' WHERE "file_type" = 'pdf'`,
    );
    await queryRunner.query(
      `UPDATE "ingestion_jobs" SET "source_type" = 'image' WHERE "file_type" = 'image'`,
    );

    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" DROP COLUMN "correlation_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" DROP COLUMN "checksum_sha256"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" DROP COLUMN "classification"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" DROP COLUMN "file_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" DROP COLUMN "user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingestion_jobs" DROP COLUMN "file_id"`,
    );

    await queryRunner.query(
      `DROP TYPE "public"."ingestion_jobs_classification_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."ingestion_jobs_file_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ingestion_jobs_status_enum"`);
    await queryRunner.query(
      `CREATE TYPE "public"."ingestion_jobs_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ingestion_jobs_source_type_enum" AS ENUM('pdf', 'image', 'receipt')`,
    );
  }
}
