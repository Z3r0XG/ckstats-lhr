import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIdempotentFixes1710000000003 implements MigrationInterface {
  name = 'AddIdempotentFixes1710000000003';

  private async ensureColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    expectedType: string,
    isNullable = false,
    defaultValue?: string
  ) {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    const col = table.findColumnByName(columnName);
    if (!col) {
      const colDef: TableColumn = new TableColumn({
        name: columnName,
        type: expectedType,
        isNullable,
        default: defaultValue,
      });
      await queryRunner.addColumn(table, colDef);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureColumn(
      queryRunner,
      'PoolStats',
      'hashrate1m',
      'bigint',
      false,
      "'0'"
    );
    await this.ensureColumn(
      queryRunner,
      'PoolStats',
      'hashrate5m',
      'bigint',
      false,
      "'0'"
    );
    await this.ensureColumn(
      queryRunner,
      'PoolStats',
      'hashrate15m',
      'bigint',
      false,
      "'0'"
    );
    await this.ensureColumn(
      queryRunner,
      'PoolStats',
      'hashrate1hr',
      'bigint',
      false,
      "'0'"
    );
    await this.ensureColumn(
      queryRunner,
      'PoolStats',
      'hashrate6hr',
      'bigint',
      false,
      "'0'"
    );
    await this.ensureColumn(
      queryRunner,
      'PoolStats',
      'hashrate1d',
      'bigint',
      false,
      "'0'"
    );
    await this.ensureColumn(
      queryRunner,
      'PoolStats',
      'hashrate7d',
      'bigint',
      false,
      "'0'"
    );

    await this.ensureColumn(
      queryRunner,
      'User',
      'authorised',
      'bigint',
      false,
      "'0'"
    );

    await this.ensureColumn(
      queryRunner,
      'Worker',
      'userAddress',
      'character varying',
      false
    );

    const userStatsTable = await queryRunner.getTable('UserStats');
    if (
      userStatsTable &&
      !userStatsTable.foreignKeys.find((fk: any) =>
        fk.columnNames.includes('userAddress')
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE "UserStats"
        ADD CONSTRAINT "FK_UserStats_User"
        FOREIGN KEY ("userAddress")
        REFERENCES "User"("address")
        ON DELETE CASCADE
      `);
    }

    const workerTable = await queryRunner.getTable('Worker');
    if (
      workerTable &&
      !workerTable.foreignKeys.find((fk: any) =>
        fk.columnNames.includes('userAddress')
      )
    ) {
      await queryRunner.query(`
        ALTER TABLE "Worker"
        ADD CONSTRAINT "FK_Worker_User"
        FOREIGN KEY ("userAddress")
        REFERENCES "User"("address")
        ON DELETE CASCADE
      `);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    void _queryRunner;
  }
}
