import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Ein Feld im pricingSchema eines Trades.
 * Definiert welche Attribute eine Position haben muss.
 */
export interface PricingSchemaField {
  /** Eindeutiger Name des Feldes. z.B. 'heatingPowerKw' */
  name: string;

  /** Datentyp des Feldes */
  type: 'string' | 'number' | 'boolean' | 'enum';

  /** Ob das Feld beim Anlegen einer Position Pflicht ist */
  required: boolean;

  /** Nur bei type = 'number': Mindestwert */
  min?: number;

  /** Nur bei type = 'number': Maximalwert */
  max?: number;

  /** Nur bei type = 'enum': erlaubte Werte */
  allowedValues?: string[];

  /**
   * Optionale Abhängigkeit von einem anderen Feld.
   * Beispiel: woodTreatment ist Pflicht wenn frameMaterial = 'wood'
   */
  dependsOn?: {
    field: string;
    equals: string | number | boolean;
  };
}

/**
 * Das komplette pricingSchema eines Trades.
 */
export interface PricingSchema {
  fields: PricingSchemaField[];
}

/**
 * Configuration per trade category. Holds the human-readable label plus any
 * trade-specific schema definitions (currently used for nothing — the
 * pricing challenge adds `pricingSchema` here).
 */
@Entity({ schema: 'pricing_service', name: 'trade_configs' })
export class TradeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  @Index({ unique: true })
  trade: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Free-form metadata bag — future-proofs adding small per-trade config
   * without a migration.
   */
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;


   /**
   * Schema für trade-spezifische Positionsattribute.
   * Wird vom Admin konfiguriert und vom partner-portal genutzt
   * um dynamische Formfelder zu rendern.
   *
   * Beispiel HVAC:
   * { fields: [{ name: 'heatingPowerKw', type: 'number', required: true, min: 1, max: 100 }] }
   *
   * Beispiel WINDOWS:
   * { fields: [
   *   { name: 'uValue', type: 'number', required: true, min: 0.5, max: 3.0 },
   *   { name: 'frameMaterial', type: 'enum', required: true, allowedValues: ['wood', 'pvc', 'aluminum'] },
   *   { name: 'woodTreatment', type: 'string', required: false, dependsOn: { field: 'frameMaterial', equals: 'wood' } }
   * ]}
   */
  @Column({ name: 'pricing_schema', type: 'jsonb', nullable: true })
  pricingSchema: PricingSchema | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
