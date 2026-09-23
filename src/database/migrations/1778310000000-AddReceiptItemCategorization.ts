import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptItemCategorization1778310000000 implements MigrationInterface {
  name = 'AddReceiptItemCategorization1778310000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipt_items" ADD "subcategory" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" ADD "categorization_status" character varying NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" ADD "category_confidence" numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" ADD "taxonomy_version" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" ADD "classification_metadata" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipt_items" DROP COLUMN "classification_metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" DROP COLUMN "taxonomy_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" DROP COLUMN "category_confidence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" DROP COLUMN "categorization_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" DROP COLUMN "subcategory"`,
    );
  }
}
