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
 * Rabatt-Typ:
 * flat    → fixer Betrag in Cent (z.B. 1000 = 10,00 € Rabatt)
 * percent → Prozentsatz als Dezimalzahl (z.B. 0.1 = 10% Rabatt)
 */
export enum DiscountType {
  FLAT = 'flat',
  PERCENT = 'percent',
}

/**
 * Worauf der Rabatt angewendet wird:
 * 'subtotal'          → auf den gesamten Katalog-Subtotal
 * { positionKeys: [] } → nur auf bestimmte Positionen
 */
export type DiscountAppliesTo =
  | 'subtotal'
  | { positionKeys: string[] };

/**
 * Ein Katalog-Rabatt auf einer Version.
 *
 * Rabatte werden in Deklarationsreihenfolge angewendet.
 * Ein Prozent-Rabatt mit Cap wendet den Cap vor dem nächsten Rabatt an.
 *
 * Beispiel flat:    { type: 'flat',    value: 1000, cap: null }  → 10,00 € Rabatt
 * Beispiel percent: { type: 'percent', value: 0.1,  cap: 5000 } → 10% Rabatt, max 50,00 €
 */
@Entity({ schema: 'pricing_service', name: 'catalog_discounts' })
export class CatalogDiscount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'version_id', type: 'uuid' })
  @Index()
  versionId: string;

  /**
   * Stabiler Schlüssel für diesen Rabatt. z.B. 'bulk-discount'
   */
  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 16 })
  type: DiscountType;

  /**
   * Bei flat:    Betrag in Cent (z.B. 1000 = 10,00 €)
   * Bei percent: Dezimalzahl   (z.B. 0.1  = 10%)
   */
  @Column({ name: 'discount_value', type: 'numeric', precision: 12, scale: 4 })
  value: number;

  /**
   * Maximaler Rabatt-Betrag in Cent. Nur relevant bei type = 'percent'.
   * Beispiel: cap = 5000 → Rabatt wird auf max 50,00 € begrenzt.
   * Null bedeutet kein Cap.
   */
  @Column({ type: 'integer', nullable: true })
  cap: number | null;

  /**
   * Worauf der Rabatt angewendet wird.
   * 'subtotal'            → gesamter Katalog-Subtotal
   * { positionKeys: [] }  → nur auf diese Positionen
   */
  @Column({ name: 'applies_to', type: 'jsonb' })
  appliesTo: DiscountAppliesTo;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CatalogVersion, (version) => version.discounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'version_id' })
  version: CatalogVersion;
}