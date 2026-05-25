import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Adds the pricing catalog tables and pricingSchema field to trade_configs.
 *
 * New tables:
 *  - pricing_service.catalog_versions   — versionierte Kataloge pro (craftsmanId, trade)
 *  - pricing_service.catalog_positions  — Leistungspositionen einer Version
 *  - pricing_service.catalog_discounts  — Rabatte einer Version
 *
 * Modified tables:
 *  - pricing_service.trade_configs      — neues Feld pricing_schema (jsonb)
 */
export class AddPricingCatalogs1748000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // 1. pricing_schema Feld zu trade_configs hinzufügen
    await queryRunner.query(`
      ALTER TABLE pricing_service.trade_configs
      ADD COLUMN pricing_schema jsonb NULL
    `);

    // 2. catalog_versions Tabelle anlegen
    await queryRunner.createTable(
      new Table({
        name: 'pricing_service.catalog_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'craftsman_id',
            type: 'uuid',
          },
          {
            name: 'trade',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: "'DRAFT'",
          },
          {
            name: 'effective_from',
            type: 'timestamptz',
          },
          {
            name: 'published_by',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'published_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
    );

    // Index auf (craftsman_id, trade) — häufigste Abfrage
    await queryRunner.createIndex(
      'pricing_service.catalog_versions',
      new TableIndex({
        name: 'idx_catalog_versions_craftsman_trade',
        columnNames: ['craftsman_id', 'trade'],
      }),
    );

    // Index auf status — für PUBLISHED-Lookup
    await queryRunner.createIndex(
      'pricing_service.catalog_versions',
      new TableIndex({
        name: 'idx_catalog_versions_status',
        columnNames: ['status'],
      }),
    );

    // Foreign Key: catalog_versions → craftsmen
    await queryRunner.createForeignKey(
      'pricing_service.catalog_versions',
      new TableForeignKey({
        columnNames: ['craftsman_id'],
        referencedTableName: 'pricing_service.craftsmen',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 3. catalog_positions Tabelle anlegen
    await queryRunner.createTable(
      new Table({
        name: 'pricing_service.catalog_positions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'version_id',
            type: 'uuid',
          },
          {
            name: 'key',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'label',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'unit',
            type: 'varchar',
            length: '16',
          },
          {
            name: 'net_price_minor_units',
            type: 'integer',
          },
          {
            name: 'vat_rate',
            type: 'numeric',
            precision: 5,
            scale: 4,
          },
          {
            name: 'min_quantity',
            type: 'numeric',
            isNullable: true,
          },
          {
            name: 'max_quantity',
            type: 'numeric',
            isNullable: true,
          },
          {
            name: 'trade_attributes',
            type: 'jsonb',
            default: "'{}'::jsonb",
          },
          {
            name: 'surcharges',
            type: 'jsonb',
            default: "'[]'::jsonb",
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        uniques: [
          {
            // key muss eindeutig pro Version sein
            name: 'uniq_catalog_position_version_key',
            columnNames: ['version_id', 'key'],
          },
        ],
      }),
    );

    // Index auf version_id — für schnelle Positions-Abfrage
    await queryRunner.createIndex(
      'pricing_service.catalog_positions',
      new TableIndex({
        name: 'idx_catalog_positions_version_id',
        columnNames: ['version_id'],
      }),
    );

    // Foreign Key: catalog_positions → catalog_versions
    await queryRunner.createForeignKey(
      'pricing_service.catalog_positions',
      new TableForeignKey({
        columnNames: ['version_id'],
        referencedTableName: 'pricing_service.catalog_versions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 4. catalog_discounts Tabelle anlegen
    await queryRunner.createTable(
      new Table({
        name: 'pricing_service.catalog_discounts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'version_id',
            type: 'uuid',
          },
          {
            name: 'key',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'label',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'type',
            type: 'varchar',
            length: '16',
          },
          {
            name: 'discount_value',
            type: 'numeric',
            precision: 12,
            scale: 4,
          },
          {
            name: 'cap',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'applies_to',
            type: 'jsonb',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        uniques: [
          {
            name: 'uniq_catalog_discount_version_key',
            columnNames: ['version_id', 'key'],
          },
        ],
      }),
    );

    // Index auf version_id
    await queryRunner.createIndex(
      'pricing_service.catalog_discounts',
      new TableIndex({
        name: 'idx_catalog_discounts_version_id',
        columnNames: ['version_id'],
      }),
    );

    // Foreign Key: catalog_discounts → catalog_versions
    await queryRunner.createForeignKey(
      'pricing_service.catalog_discounts',
      new TableForeignKey({
        columnNames: ['version_id'],
        referencedTableName: 'pricing_service.catalog_versions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reihenfolge umgekehrt zu up()

    // catalog_discounts entfernen
    await queryRunner.dropTable('pricing_service.catalog_discounts', true);

    // catalog_positions entfernen
    await queryRunner.dropTable('pricing_service.catalog_positions', true);

    // catalog_versions entfernen
    await queryRunner.dropTable('pricing_service.catalog_versions', true);

    // pricing_schema Feld von trade_configs entfernen
    await queryRunner.query(`
      ALTER TABLE pricing_service.trade_configs
      DROP COLUMN pricing_schema
    `);
  }
}