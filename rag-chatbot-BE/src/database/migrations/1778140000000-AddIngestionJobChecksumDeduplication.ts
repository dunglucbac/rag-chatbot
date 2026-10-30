import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIngestionJobChecksumDeduplication1778140000000 implements MigrationInterface {
  name = 'AddIngestionJobChecksumDeduplication1778140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ingestion_jobs_user_checksum_sha256" ON "ingestion_jobs" ("user_id", "checksum_sha256") WHERE "checksum_sha256" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ingestion_jobs_user_checksum_sha256"`,
    );
  }
}
