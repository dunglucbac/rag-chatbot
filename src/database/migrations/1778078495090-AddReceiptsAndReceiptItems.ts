import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptsAndReceiptItems1778078495090 implements MigrationInterface {
  name = 'AddReceiptsAndReceiptItems1778078495090';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "receipt_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "receipt_id" uuid NOT NULL, "name" character varying NOT NULL, "quantity" numeric, "unit_price" numeric, "total_price" numeric NOT NULL, "category" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8633ef98a0b970a980ebfd246e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "receipts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "merchant" character varying NOT NULL, "purchased_at" TIMESTAMP NOT NULL, "total" numeric NOT NULL, "tax" numeric, "currency" character varying NOT NULL, "source" character varying NOT NULL, "raw_text" text, "checksum_sha256" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5465094705eac20981faec5484d" UNIQUE ("user_id", "merchant", "purchased_at", "total", "checksum_sha256"), CONSTRAINT "PK_5e8182d7c29e023da6e1ff33bfe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" ADD CONSTRAINT "FK_9f35634152710322f0296938400" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipt_items" DROP CONSTRAINT "FK_9f35634152710322f0296938400"`,
    );
    await queryRunner.query(`DROP TABLE "receipts"`);
    await queryRunner.query(`DROP TABLE "receipt_items"`);
  }
}
