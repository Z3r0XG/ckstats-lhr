import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNetdiffToPoolStats1710000000014 implements MigrationInterface {
  name = 'AddNetdiffToPoolStats1710000000014';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ADD COLUMN "netdiff" float`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "PoolStats" DROP COLUMN "netdiff"`);
  }
}
