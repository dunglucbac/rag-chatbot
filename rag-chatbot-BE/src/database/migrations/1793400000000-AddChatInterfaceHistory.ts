import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatInterfaceHistory1793400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD "revision" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD "title" varchar NOT NULL DEFAULT 'New conversation'`,
    );
    await queryRunner.query(`CREATE TABLE "chat_messages" (
      "id" SERIAL PRIMARY KEY,
      "session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
      "role" varchar NOT NULL CHECK ("role" IN ('user', 'assistant', 'upload')),
      "content" text NOT NULL,
      "ingestion_job_id" varchar,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE ("session_id", "ingestion_job_id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_messages_session_id_id" ON "chat_messages" ("session_id", "id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`ALTER TABLE "chat_sessions" DROP COLUMN "title"`);
    await queryRunner.query(`ALTER TABLE "receipts" DROP COLUMN "revision"`);
  }
}
