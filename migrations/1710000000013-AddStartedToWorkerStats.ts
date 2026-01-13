import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStartedToWorkerStats1710000000013 implements MigrationInterface {
    name = 'AddStartedToWorkerStats1710000000013'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "WorkerStats" ADD "started" bigint NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "WorkerStats" DROP COLUMN "started"`);
    }
}
