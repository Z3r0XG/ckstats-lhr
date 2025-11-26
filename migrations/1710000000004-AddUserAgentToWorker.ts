import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAgentToWorker1710000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "Worker" ADD COLUMN "userAgent" varchar(64) NOT NULL DEFAULT '';`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ADD COLUMN "userAgentRaw" text NULL;`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "Worker" DROP COLUMN "userAgentRaw";`);
    await queryRunner.query(`ALTER TABLE "Worker" DROP COLUMN "userAgent";`);
  }
}
