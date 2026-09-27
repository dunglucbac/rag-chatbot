import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceIngestionStoragePathWithObjectKey1778500000000
  implements MigrationInterface
{
  name = 'ReplaceIngestionStoragePathWithObjectKey1778500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "ingestion_jobs" RENAME COLUMN "storage_path" TO "storage_key"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "ingestion_jobs" RENAME COLUMN "storage_key" TO "storage_path"',
    );
  }
}
