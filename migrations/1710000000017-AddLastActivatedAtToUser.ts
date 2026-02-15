import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastActivatedAtToUser1710000000017 implements MigrationInterface {
  name = 'AddLastActivatedAtToUser1710000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the column as nullable first - use same type as createdAt/updatedAt
    await queryRunner.query(
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActivatedAt" TIMESTAMP`
    );
    
    // Backfill existing users: use createdAt as the initial value
    await queryRunner.query(
      `UPDATE "User" SET "lastActivatedAt" = "createdAt" WHERE "lastActivatedAt" IS NULL`
    );
    
    // Add index for efficient queries
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "User_lastActivatedAt_idx" ON "User" ("lastActivatedAt")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "User_lastActivatedAt_idx"`);
    await queryRunner.query(`ALTER TABLE "User" DROP COLUMN IF EXISTS "lastActivatedAt"`);
  }
}
