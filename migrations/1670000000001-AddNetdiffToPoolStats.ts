import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNetdiffToPoolStats1670000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ADD COLUMN "netdiff" float`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "PoolStats" DROP COLUMN "netdiff"`);
  }
}
