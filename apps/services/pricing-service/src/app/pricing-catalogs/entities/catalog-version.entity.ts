import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CatalogPosition } from './catalog-position.entity';
import { CatalogDiscount } from './catalog-discount.entity';


/**
 * Status eines Preiskatalogs.
 * DRAFT     → bearbeitbar, noch nicht veröffentlicht.
 * PUBLISHED → eingefroren, kann nie mehr geändert werden.
 */
export enum CatalogVersionStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

/**
 * Eine versionierte Preiskatalog-Version für ein (craftsmanId, trade) Paar.
 *
 * - Pro (craftsmanId, trade) darf es maximal eine aktive PUBLISHED-Version geben.
 * - Alte PUBLISHED-Versionen bleiben für Audit-Zwecke erhalten.
 * - Ein DRAFT wird durch POST .../publish auf PUBLISHED gesetzt.
 */
@Entity({ schema: 'pricing_service', name: 'catalog_versions' })
@Index('idx_catalog_versions_craftsman_trade', ['craftsmanId', 'trade'])
export class CatalogVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'craftsman_id', type: 'uuid' })
  @Index()
  craftsmanId: string;

  @Column({ type: 'varchar', length: 32 })
  trade: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: CatalogVersionStatus.DRAFT,
  })
  status: CatalogVersionStatus;

  /**
   * Ab wann diese Version gültig ist.
   * Bei DRAFT: geplantes Datum. Bei PUBLISHED: effektives Startdatum.
   */
  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;

  /**
   * Wer diese Version veröffentlicht hat (userId aus JWT-Claims).
   * Null solange die Version noch DRAFT ist.
   */
  @Column({ name: 'published_by', type: 'varchar', length: 255, nullable: true })
  publishedBy: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => CatalogPosition, (pos) => pos.version, { cascade: true })
  positions: CatalogPosition[];

  @OneToMany(() => CatalogDiscount, (dis) => dis.version, { cascade: true })
  discounts: CatalogDiscount[];
}