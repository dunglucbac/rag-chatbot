import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1777863304279 implements MigrationInterface {
  name = 'InitialSchema1777863304279';

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
      `CREATE TABLE "ingestion_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "file_id" character varying NOT NULL, "user_id" character varying NOT NULL, "original_filename" character varying NOT NULL, "storage_path" character varying NOT NULL, "mime_type" character varying NOT NULL, "file_type" "public"."ingestion_jobs_file_type_enum" NOT NULL DEFAULT 'pdf', "classification" "public"."ingestion_jobs_classification_enum" NOT NULL DEFAULT 'unknown', "status" "public"."ingestion_jobs_status_enum" NOT NULL DEFAULT 'pending', "checksum_sha256" text, "correlation_id" text, "error_message" text, "metadata" jsonb, "extracted_text" text, "chunk_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "completed_at" TIMESTAMP, CONSTRAINT "PK_78a3cba789582043cfc8ba82edd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "web_search_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "query" text NOT NULL, "url" text NOT NULL, "scraped" boolean NOT NULL DEFAULT false, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_722f8a4738aa59f85e05b862504" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."messages_role_enum" AS ENUM('human', 'ai')`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "threadId" character varying NOT NULL, "content" text NOT NULL, "role" "public"."messages_role_enum" NOT NULL, "toolsUsed" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TYPE "public"."messages_role_enum"`);
    await queryRunner.query(`DROP TABLE "web_search_logs"`);
    await queryRunner.query(`DROP TABLE "ingestion_jobs"`);
    await queryRunner.query(`DROP TYPE "public"."ingestion_jobs_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."ingestion_jobs_classification_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."ingestion_jobs_file_type_enum"`,
    );
  }
}
