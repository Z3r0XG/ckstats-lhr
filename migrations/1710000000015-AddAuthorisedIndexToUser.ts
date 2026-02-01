import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthorisedIndexToUser1710000000015 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if User table exists before creating index
    const tableExists = await queryRunner.hasTable('User');
    
    if (tableExists) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS idx_user_authorised_asc 
         ON "User" ("authorised");`
      );
      console.log('Created index on User.authorised for getTopUserLoyalty queries');
    } else {
      console.log('User table does not exist yet; skipping index creation');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_user_authorised_asc;`
    );
  }
}
