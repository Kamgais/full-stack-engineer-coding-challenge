import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CatalogVersion } from './catalog-version.entity';

/**
 * Erlaubte Einheiten für eine Position.
 * piece  → Stück
 * m2     → Quadratmeter
 * meter  → Laufmeter
 * hour   → Stunde
 * flat   → Pauschale
 */
export enum PositionUnit {
  PIECE = 'piece',
  M2 = 'm2',
  METER = 'meter',
  HOUR = 'hour',
  FLAT = 'flat',
}

/**
 * Ein Zuschlag auf einer Position.
 * type 'flat'    → value in Cent (z.B. 5000 = 50,00 €)
 * type 'percent' → value als Dezimalzahl (z.B. 0.1 = 10%)
 */
export interface Surcharge {
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
}

/**
 * Eine einzelne Leistungsposition in einem Preiskatalog.
 *
 * Preis wird als Integer in Cent gespeichert (1999 = 19,99 €).
 * tradeAttributes: trade-spezifische Felder (z.B. { heatingPowerKw: 5 } für HVAC).
 * surcharges: Aufpreise die beim Quoten aktiviert werden können.
 */
@Entity({ schema: 'pricing_service', name: 'catalog_positions' })
@Index('idx_catalog_positions_version_id', ['versionId'])
export class CatalogPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'version_id', type: 'uuid' })
  versionId: string;

  /**
   * Stabiler, eindeutiger Schlüssel innerhalb einer Version.
   * Wird beim Quoten als Referenz verwendet. z.B. 'radiator-install'
   */
  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 16 })
  unit: PositionUnit;

  /**
   * Nettopreis in Cent (Minor Units). Keine Floats.
   * Beispiel: 19,99 € → 1999
   */
  @Column({ name: 'net_price_minor_units', type: 'integer' })
  netPriceMinorUnits: number;

  /**
   * MwSt-Satz als Dezimalzahl.
   * Beispiel: 19% → 0.19
   */
  @Column({ name: 'vat_rate', type: 'numeric', precision: 5, scale: 4 })
  vatRate: number;

  @Column({ name: 'min_quantity', type: 'numeric', nullable: true })
  minQuantity: number | null;

  @Column({ name: 'max_quantity', type: 'numeric', nullable: true })
  maxQuantity: number | null;

  /**
   * Trade-spezifische Attribute.
   * Beispiel HVAC:    { heatingPowerKw: 5 }
   * Beispiel WINDOWS: { uValue: 1.1, frameMaterial: 'wood' }
   * Wird gegen das pricingSchema des Trades validiert.
   */
  @Column({ name: 'trade_attributes', type: 'jsonb', default: {} })
  tradeAttributes: Record<string, unknown>;

  /**
   * Zuschläge die auf dieser Position deklariert sind.
   * Beispiel: [{ key: 'urgent', label: 'Notfall', type: 'flat', value: 5000 }]
   */
  @Column({ type: 'jsonb', default: [] })
  surcharges: Surcharge[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CatalogVersion, (version) => version.positions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'version_id' })
  version: CatalogVersion;
}