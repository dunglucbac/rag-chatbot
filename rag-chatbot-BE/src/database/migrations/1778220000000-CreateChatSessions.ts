import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatSessions1778220000000 implements MigrationInterface {
  name = 'CreateChatSessions1778220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_sessions" ("id" uuid NOT NULL, "user_id" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_chat_sessions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_sessions_user_id" ON "chat_sessions" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_sessions_user_id"`);
    await queryRunner.query(`DROP TABLE "chat_sessions"`);
  }
}
