import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFinhayConnections1794200000000 implements MigrationInterface {
  name = 'AddFinhayConnections1794200000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "finhay_connections" ("user_id" character varying NOT NULL PRIMARY KEY, "encrypted_data" text NOT NULL, "state_hash" character varying UNIQUE, "state_expires_at" bigint)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "finhay_connections"`);
  }
}
