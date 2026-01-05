import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBestEverIndexToWorker1710000000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if Worker table exists before creating index
    const tableExists = await queryRunner.hasTable('worker');
    
    if (tableExists) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS idx_worker_bestever_desc 
         ON "worker" ("bestEver" DESC);`
      );
      console.log('Created index on Worker.bestEver DESC for top_best_diffs queries');
    } else {
      console.log('Worker table does not exist yet; skipping index creation');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_worker_bestever_desc;`
    );
  }
}
