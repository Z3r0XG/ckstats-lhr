import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthorisedIndexToUser1710000000015 implements MigrationInterface {
  name = 'AddAuthorisedIndexToUser1710000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "User_authorised_idx" ON "User" ("authorised")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
  }
}
